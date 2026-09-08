import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const DOWNLOAD_TIMEOUT_MS = 20_000;

const COLLECTIONS = [
	{
		name: 'blog',
		contentDir: path.join(ROOT, 'src', 'content', 'blog'),
		assetsDir: path.join(ROOT, 'src', 'assets', 'blog-inline'),
	},
	{
		name: 'services',
		contentDir: path.join(ROOT, 'src', 'content', 'services'),
		assetsDir: path.join(ROOT, 'src', 'assets', 'services-inline'),
	},
];

const FETCH_HEADERS = {
	Accept: 'image/*,*/*',
	'User-Agent': 'InstitutoDoBemEstarAstroExtractor/1.0',
};

const REMOTE_UPLOADS =
	'https?:\\/\\/(?:www\\.)?ibemestarscs\\.com\\.br\\/wp-content\\/uploads\\/[^\\s"\'<>)]+';

const MD_IMAGE_RE = new RegExp(
	`!\\[([^\\]]*)\\]\\((${REMOTE_UPLOADS})(?:\\s+(?:"[^"]*"|'[^']*'))?\\)`,
	'gi',
);

const IMG_TAG_RE = /<img\b[^>]*>/gi;
const SRC_ATTR_RE = new RegExp(`\\bsrc=["'](${REMOTE_UPLOADS})["']`, 'i');
const ALT_ATTR_RE = /\balt=["']([^"']*)["']/i;

const EXT_FROM_TYPE = {
	'image/jpeg': '.jpg',
	'image/jpg': '.jpg',
	'image/png': '.png',
	'image/webp': '.webp',
	'image/gif': '.gif',
};

function extractFrontmatterTitle(source) {
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return '';

	const titleLine = match[1].match(/^title:\s*(?:"([^"]*)"|'([^']*)'|(.+))\s*$/m);
	return (titleLine?.[1] ?? titleLine?.[2] ?? titleLine?.[3] ?? '').trim();
}

function extractFrontmatterSlug(source, filePath) {
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	const fromMatter = match?.[1].match(/^slug:\s*(?:"([^"]*)"|'([^']*)'|(.+))\s*$/m);
	const slug = (fromMatter?.[1] ?? fromMatter?.[2] ?? fromMatter?.[3] ?? '').trim();
	return slug || path.basename(filePath, path.extname(filePath));
}

function extensionFromUrl(url) {
	try {
		const pathname = new URL(url).pathname;
		const ext = path.extname(pathname).toLowerCase();
		if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return ext === '.jpeg' ? '.jpg' : ext;
	} catch {
		/* ignore invalid URL */
	}
	return '';
}

function resolveAlt(rawAlt, fallbackTitle, remoteCount, position) {
	const alt = (rawAlt ?? '').replace(/\s+/g, ' ').trim();
	if (alt) return alt;

	const title = fallbackTitle || 'Imagem do Instituto do Bem Estar';
	if (remoteCount > 1) return `${title} - imagem ${position}`;
	return title;
}

function findMatches(source) {
	const matches = [];

	for (const match of source.matchAll(MD_IMAGE_RE)) {
		matches.push({
			start: match.index,
			end: match.index + match[0].length,
			url: match[2],
			alt: match[1],
			kind: 'markdown',
		});
	}

	for (const match of source.matchAll(IMG_TAG_RE)) {
		const tag = match[0];
		const src = tag.match(SRC_ATTR_RE)?.[1];
		if (!src) continue;

		matches.push({
			start: match.index,
			end: match.index + tag.length,
			url: src,
			alt: tag.match(ALT_ATTR_RE)?.[1] ?? '',
			kind: 'html',
		});
	}

	return matches.sort((a, b) => a.start - b.start);
}

function toPosix(filePath) {
	return filePath.split(path.sep).join('/');
}

async function downloadImage(url) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			headers: FETCH_HEADERS,
			signal: controller.signal,
			redirect: 'follow',
		});

		if (!response.ok) {
			return { ok: false, error: `${response.status}` };
		}

		const buffer = Buffer.from(await response.arrayBuffer());
		const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
		const ext = extensionFromUrl(url) || EXT_FROM_TYPE[type] || '.jpg';
		return { ok: true, buffer, ext };
	} catch (error) {
		if (error?.name === 'AbortError') {
			return { ok: false, error: 'timeout' };
		}
		return { ok: false, error: error?.message || 'falha de rede' };
	} finally {
		clearTimeout(timer);
	}
}

async function listMarkdownFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
		.map((entry) => path.join(dir, entry.name))
		.sort();
}

async function processFile(filePath, collection) {
	const source = await readFile(filePath, 'utf8');
	const matches = findMatches(source);
	if (matches.length === 0) return null;

	const title = extractFrontmatterTitle(source);
	const slug = extractFrontmatterSlug(source, filePath);
	const replacements = [];
	const failures = [];
	let nextSource = source;

	for (const [index, match] of matches.entries()) {
		const result = await downloadImage(match.url);
		const position = index + 1;

		if (!result.ok) {
			failures.push({
				file: toPosix(path.relative(ROOT, filePath)),
				url: match.url,
				error: result.error,
			});
			continue;
		}

		const destName = `${slug}-${position}${result.ext}`;
		const destAbs = path.join(collection.assetsDir, destName);
		const relative = toPosix(path.relative(path.dirname(filePath), destAbs));
		const alt = resolveAlt(match.alt, title, matches.length, position);
		const markdown = `![${alt}](${relative})`;

		replacements.push({
			start: match.start,
			end: match.end,
			markdown,
			destAbs,
			buffer: result.buffer,
			url: match.url,
			relative,
			alt,
		});
	}

	if (APPLY && replacements.length > 0) {
		await mkdir(collection.assetsDir, { recursive: true });

		for (const item of replacements) {
			await writeFile(item.destAbs, item.buffer);
		}

		for (const item of [...replacements].sort((a, b) => b.start - a.start)) {
			nextSource = `${nextSource.slice(0, item.start)}${item.markdown}${nextSource.slice(item.end)}`;
		}

		await writeFile(filePath, nextSource, 'utf8');
	}

	return {
		file: toPosix(path.relative(ROOT, filePath)),
		found: matches.length,
		fixed: replacements.length,
		failures,
		previews: replacements.map((item) => `![${item.alt}](${item.relative}) ← ${item.url}`),
	};
}

async function main() {
	const filesWithImages = [];
	const failures = [];

	for (const collection of COLLECTIONS) {
		const files = await listMarkdownFiles(collection.contentDir);

		for (const filePath of files) {
			const result = await processFile(filePath, collection);
			if (!result) continue;

			filesWithImages.push(result);
			failures.push(...result.failures);
		}
	}

	const mode = APPLY ? 'APPLY' : 'DRY-RUN';
	const totalFixed = filesWithImages.reduce((sum, item) => sum + item.fixed, 0);

	console.log(`\nfix-inline-content-images [${mode}]`);
	console.log(`Arquivos com imagens remotas: ${filesWithImages.length}`);
	console.log(`Imagens prontas para correção: ${totalFixed}`);
	console.log('');

	if (filesWithImages.length === 0) {
		console.log('Nenhuma imagem remota encontrada em blog/ ou services/.');
	} else {
		for (const item of filesWithImages) {
			console.log(`- ${item.file}: ${item.fixed}/${item.found} imagem(ns)`);
			for (const preview of item.previews) {
				console.log(`    ${preview}`);
			}
		}
	}

	if (failures.length > 0) {
		console.log('\nDownloads com falha (arquivo não alterado para essas URLs):');
		for (const fail of failures) {
			console.log(`- [${fail.error}] ${fail.file}`);
			console.log(`    ${fail.url}`);
		}
	} else {
		console.log('\nNenhuma falha de download.');
	}

	if (!APPLY) {
		console.log('\nNada foi gravado. Rode com --apply para baixar e substituir as referências.');
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
