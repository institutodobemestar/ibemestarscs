import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

const CONTENT_DIRS = [
	path.join(ROOT, 'src', 'content', 'blog'),
	path.join(ROOT, 'src', 'content', 'services'),
];

const SERVICE_SLUGS = new Set([
	'acupuntura',
	'hidroterapia',
	'fisioterapia',
	'pilates-clinico',
	'ozonioterapia',
	'microfisioterapia',
	'terapias-manuais',
]);

const OLD_HOST = /^(?:www\.)?ibemestarscs\.com\.br$/i;
const OLD_HOST_IN_TEXT = /https?:\/\/(?:www\.)?ibemestarscs\.com\.br/i;
const ENCODED_OLD_HOST = /https?%3A%2F%2F(?:www\.)?ibemestarscs\.com\.br/i;

const MD_LINK_RE = /\[([^\]]*)\]\((<?)(https?:\/\/[^)\s>]+)(>?)(?:\s+(?:"[^"]*"|'[^']*'))?\)/gi;

function toPosix(filePath) {
	return filePath.split(path.sep).join('/');
}

function pathSegments(pathname) {
	return pathname.replace(/\/+$/, '').split('/').filter(Boolean);
}

function classifyOldSiteHref(href) {
	let parsed;
	try {
		parsed = new URL(href);
	} catch {
		return null;
	}

	const host = parsed.hostname;
	const isWhatsApp = /^(?:www\.)?(?:api\.whatsapp\.com|wa\.me)$/i.test(host);
	const mentionsOldHost = OLD_HOST_IN_TEXT.test(href) || ENCODED_OLD_HOST.test(href);

	if (isWhatsApp && mentionsOldHost) {
		return {
			group: 'd',
			replacement: null,
			reason: 'domínio antigo no parâmetro text= do WhatsApp',
		};
	}

	if (!OLD_HOST.test(host)) return null;

	const segments = pathSegments(parsed.pathname);

	if (segments.length === 1 && segments[0] === 'contato') {
		return { group: 'a', replacement: '/contato', reason: 'rota /contato' };
	}

	if (segments.length === 1 && SERVICE_SLUGS.has(segments[0])) {
		return {
			group: 'b',
			replacement: `/servicos/${segments[0]}`,
			reason: `serviço ${segments[0]}`,
		};
	}

	if (segments.length === 2 && segments[0] === 'servicos' && SERVICE_SLUGS.has(segments[1])) {
		return {
			group: 'b',
			replacement: `/servicos/${segments[1]}`,
			reason: `serviço ${segments[1]}`,
		};
	}

	return {
		group: 'c',
		replacement: null,
		reason: 'rota não mapeada automaticamente',
		oldPath: `/${segments.join('/')}/`,
	};
}

function findMarkdownLinks(source) {
	const matches = [];

	for (const match of source.matchAll(MD_LINK_RE)) {
		const href = match[3];
		const classification = classifyOldSiteHref(href);
		if (!classification) continue;

		matches.push({
			start: match.index,
			end: match.index + match[0].length,
			full: match[0],
			anchor: match[1].replace(/\s+/g, ' ').trim(),
			href,
			open: match[2],
			close: match[4],
			...classification,
		});
	}

	return matches;
}

function findOrphanDomainMentions(source, alreadyCovered) {
	const leftovers = [];
	const pattern = /https?:\/\/(?:www\.)?ibemestarscs\.com\.br[^\s)>"']*/gi;

	for (const match of source.matchAll(pattern)) {
		const start = match.index;
		const covered = alreadyCovered.some((item) => start >= item.start && start < item.end);
		if (covered) continue;

		leftovers.push({
			start,
			end: start + match[0].length,
			full: match[0],
			anchor: '(texto sem âncora Markdown)',
			href: match[0],
			group: 'c',
			replacement: null,
			reason: 'URL solta, fora de um link Markdown',
		});
	}

	return leftovers;
}

async function listMarkdownFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
		.map((entry) => path.join(dir, entry.name))
		.sort();
}

async function processFile(filePath) {
	const source = await readFile(filePath, 'utf8');
	const links = findMarkdownLinks(source);
	const orphans = findOrphanDomainMentions(source, links);
	const findings = [...links, ...orphans].sort((a, b) => a.start - b.start);
	if (findings.length === 0) return null;

	const writable = findings.filter((item) => item.replacement);
	let nextSource = source;

	if (APPLY && writable.length > 0) {
		for (const item of [...writable].sort((a, b) => b.start - a.start)) {
			const nextLink = `[${item.anchor}](${item.replacement})`;
			nextSource = `${nextSource.slice(0, item.start)}${nextLink}${nextSource.slice(item.end)}`;
		}
		await writeFile(filePath, nextSource, 'utf8');
	}

	return {
		file: toPosix(path.relative(ROOT, filePath)),
		findings,
	};
}

function printGroup(label, items) {
	console.log(`\n${label} (${items.length})`);
	if (items.length === 0) {
		console.log('  — nenhuma ocorrência');
		return;
	}

	for (const item of items) {
		console.log(`- ${item.file}`);
		console.log(`    âncora: ${item.anchor || '(vazia)'}`);
		console.log(`    de:     ${item.href}`);
		if (item.replacement) {
			console.log(`    para:   ${item.replacement}`);
		} else if (item.oldPath) {
			console.log(`    path:   ${item.oldPath}`);
		}
	}
}

async function main() {
	const grouped = { a: [], b: [], c: [], d: [] };

	for (const dir of CONTENT_DIRS) {
		const files = await listMarkdownFiles(dir);
		for (const filePath of files) {
			const result = await processFile(filePath);
			if (!result) continue;

			for (const finding of result.findings) {
				grouped[finding.group].push({
					file: result.file,
					...finding,
				});
			}
		}
	}

	const mode = APPLY ? 'APPLY' : 'DRY-RUN';
	const total = grouped.a.length + grouped.b.length + grouped.c.length + grouped.d.length;
	const writable = grouped.a.length + grouped.b.length;

	console.log(`\nfix-internal-links [${mode}]`);
	console.log(`Ocorrências encontradas: ${total}`);
	console.log(`Seriam gravadas no --apply (grupos a + b): ${writable}`);

	printGroup('a) /contato/ → /contato', grouped.a);
	printGroup('b) slug de serviço → /servicos/{slug}', grouped.b);
	printGroup('c) rota desconhecida — NÃO alterar (decisão manual)', grouped.c);
	printGroup('d) domínio no text= do WhatsApp — manter até haver domínio final', grouped.d);

	if (!APPLY) {
		console.log('\nNada foi gravado. Rode com --apply para aplicar apenas os grupos a e b.');
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
