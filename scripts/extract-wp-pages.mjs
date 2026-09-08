import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	API_BASE,
	decodeEntities,
	downloadImage,
	fetchPageBySlug,
	htmlToMarkdown,
	listAllPageSlugs,
	resolveMediaUrl,
	wpFetch,
} from './wp-shared.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

const PAGE_SLUGS = [
	'sobre-nos',
	'infraestrutura',
	'contato',
	'politica-de-privacidade',
	'termos-de-uso',
];

const BUILDING_HINT =
	/(metragem|m²|m2|\bmetros?\b|acessib|rampa|elevador|pr[eé]dio|infraestrutura|estacionamento|piscina|salas?\b)/i;

function extensionFromUrl(url) {
	try {
		const ext = path.extname(new URL(url).pathname).toLowerCase();
		return ext && ext.length <= 5 ? ext : '.jpg';
	} catch {
		return '.jpg';
	}
}

function wordCount(text) {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

function extractBuildingNotes(markdown) {
	return markdown
		.split(/\n{2,}/)
		.map((block) => block.replace(/\s+/g, ' ').trim())
		.filter((block) => block.length > 0 && BUILDING_HINT.test(block));
}

function yamlScalar(value) {
	const text = String(value ?? '');
	if (text === '') return '""';
	if (/[:#\[\]\{\}&*?|>'"%@`!]|\n/.test(text) || text !== text.trim()) {
		return JSON.stringify(text);
	}
	return text;
}

async function fileExists(filePath) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

function buildPageMarkdown({ title, slug, sourceUrl, imageRel, body, buildingNotes }) {
	const lines = [
		'---',
		`title: ${yamlScalar(title)}`,
		`slug: ${slug}`,
		`source: ${yamlScalar(sourceUrl)}`,
		`heroImage: ${yamlScalar(imageRel ?? '')}`,
		'---',
		'',
		body,
	];

	if (slug === 'contato' && buildingNotes.length) {
		lines.push('', '## Trechos sobre o prédio / infraestrutura de atendimento', '');
		for (const note of buildingNotes) {
			lines.push(`- ${note}`);
		}
	}

	return `${lines.join('\n').trim()}\n`;
}

async function main() {
	console.log(APPLY ? 'Modo: --apply (grava arquivos)\n' : 'Modo: DRY-RUN (nenhum arquivo será gravado)\n');

	await wpFetch(`${API_BASE}/pages?per_page=1`, { failOn404: true });
	console.log('WP REST API acessível.\n');

	const found = [];
	const missing = [];

	for (const slug of PAGE_SLUGS) {
		const page = await fetchPageBySlug(slug);
		if (!page) {
			missing.push(slug);
			console.log(`  [AUSENTE] ${slug}`);
			continue;
		}

		const wantsImage = slug !== 'contato';
		const imageUrl = wantsImage ? await resolveMediaUrl(page) : null;
		const ext = imageUrl ? extensionFromUrl(imageUrl) : '';
		const imageRel = imageUrl ? `/images/pages/${slug}${ext}` : '';
		const imageAbs = imageUrl ? path.join(ROOT, 'src', 'assets', 'pages', `${slug}${ext}`) : null;
		const markdownPath = `src/content/pages-raw/${slug}.md`;
		const markdownAbs = path.join(ROOT, markdownPath);
		const title = decodeEntities(page.title?.rendered ?? slug);
		const body = htmlToMarkdown(page.content?.rendered ?? '');
		const notes = slug === 'contato' ? extractBuildingNotes(body) : [];
		const markdown = buildPageMarkdown({
			title,
			slug,
			sourceUrl: page.link ?? '',
			imageRel,
			body,
			buildingNotes: notes,
		});

		const entry = {
			slug,
			title,
			words: wordCount(body),
			imageFound: Boolean(imageUrl),
			imageUrl,
			imageRel,
			imageAbs,
			markdownPath,
			markdownAbs,
			markdown,
			exists: await fileExists(markdownAbs),
			buildingNotes: notes,
		};

		found.push(entry);

		const action = entry.exists ? 'SOBRESCREVER' : 'CRIAR';
		const imageLabel = wantsImage
			? imageUrl
				? `${imageRel} ← ${imageUrl}`
				: 'não encontrada'
			: 'não aplicável (contato)';
		console.log(`  [${action}] ${markdownPath}`);
		console.log(`           título: ${title}`);
		console.log(`           imagem: ${imageLabel}`);
	}

	if (APPLY) {
		console.log('\nGravando arquivos...');
		for (const entry of found) {
			await mkdir(path.dirname(entry.markdownAbs), { recursive: true });
			await writeFile(entry.markdownAbs, entry.markdown, 'utf8');
			if (entry.imageUrl && entry.imageAbs) {
				await downloadImage(entry.imageUrl, entry.imageAbs);
			}
		}
	}

	if (missing.length) {
		const available = await listAllPageSlugs();
		console.log('\nSlugs NÃO encontrados:');
		for (const slug of missing) {
			const hints = available.filter((candidate) => candidate.includes(slug) || slug.includes(candidate));
			const hint = hints.length ? ` (possíveis no WP: ${hints.join(', ')})` : '';
			console.log(`  - ${slug}${hint}`);
		}
	}

	console.log('\n=== Relatório extract-wp-pages ===');
	for (const entry of found) {
		const imageStatus = entry.slug === 'contato' ? 'não aplicável' : entry.imageFound ? 'sim' : 'não';
		console.log(`- ${entry.slug}: "${entry.title}" · ${entry.words} palavras · imagem: ${imageStatus}`);
		if (entry.slug === 'contato') {
			if (entry.buildingNotes.length) {
				console.log(`  trechos de prédio/infraestrutura: ${entry.buildingNotes.length}`);
				for (const note of entry.buildingNotes) {
					console.log(`    • ${note.slice(0, 180)}${note.length > 180 ? '…' : ''}`);
				}
			} else {
				console.log('  trechos de prédio/infraestrutura: nenhum');
			}
		}
	}

	console.log(`Páginas encontradas: ${found.length} / ${PAGE_SLUGS.length}`);
	console.log(`Imagens que ${APPLY ? 'foram' : 'seriam'} baixadas: ${found.filter((entry) => entry.imageFound).length}`);
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
