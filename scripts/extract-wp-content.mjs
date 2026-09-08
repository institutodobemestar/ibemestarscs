import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import TurndownService from 'turndown';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WP_ORIGIN = 'https://ibemestarscs.com.br';
const API_BASE = `${WP_ORIGIN}/wp-json/wp/v2`;
const APPLY = process.argv.includes('--apply');

const SERVICE_SLUGS = [
	'acupuntura',
	'hidroterapia',
	'fisioterapia',
	'pilates-clinico',
	'ozonioterapia',
	'microfisioterapia',
	'terapias-manuais',
];

const SERVICE_ORDER = Object.fromEntries(SERVICE_SLUGS.map((slug, index) => [slug, index + 1]));

const FETCH_HEADERS = {
	Accept: 'application/json',
	'User-Agent': 'InstitutoDoBemEstarAstroExtractor/1.0',
};

const turndown = new TurndownService({
	headingStyle: 'atx',
	bulletListMarker: '-',
	codeBlockStyle: 'fenced',
});

turndown.addRule('dropScriptsAndMedia', {
	filter: ['script', 'style', 'noscript', 'iframe', 'video', 'audio', 'source', 'embed', 'object', 'svg'],
	replacement: () => '',
});

class ApiUnavailableError extends Error {
	constructor() {
		super(
			'WP REST API não está acessível. Verifique se está bloqueada por plugin de segurança (ex: Wordfence, iThemes Security) ou se o site usa outro caminho de API.',
		);
		this.name = 'ApiUnavailableError';
	}
}

async function wpFetch(url, { failOn404 = false } = {}) {
	let response;

	try {
		response = await fetch(url, { headers: FETCH_HEADERS });
	} catch {
		throw new ApiUnavailableError();
	}

	const contentType = response.headers.get('content-type') ?? '';
	const text = await response.text();

	if (!contentType.includes('json')) {
		throw new ApiUnavailableError();
	}

	if (response.status === 404) {
		if (failOn404) throw new ApiUnavailableError();
		return { response, data: null };
	}

	try {
		return { response, data: JSON.parse(text) };
	} catch {
		throw new ApiUnavailableError();
	}
}

function decodeEntities(value) {
	return value
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&quot;/gi, '"')
		.replace(/&#0*39;/g, "'")
		.replace(/&apos;/gi, "'")
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&#8211;/g, '–')
		.replace(/&#8212;/g, '—')
		.replace(/&#8216;/g, "'")
		.replace(/&#8217;/g, "'")
		.replace(/&#8220;/g, '"')
		.replace(/&#8221;/g, '"')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/\s+/g, ' ')
		.trim();
}

function stripElementorHtml(html) {
	let out = String(html ?? '');

	out = out.replace(/<script\b[\s\S]*?<\/script>/gi, '');
	out = out.replace(/<style\b[\s\S]*?<\/style>/gi, '');
	out = out.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '');
	out = out.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '');
	out = out.replace(/<video\b[\s\S]*?<\/video>/gi, '');
	out = out.replace(/<audio\b[\s\S]*?<\/audio>/gi, '');
	out = out.replace(/<(source|embed|track)\b[^>]*>/gi, '');
	out = out.replace(/<object\b[\s\S]*?<\/object>/gi, '');
	out = out.replace(/<svg\b[\s\S]*?<\/svg>/gi, '');

	out = out.replace(
		/<[^>]+class=["'][^"']*(?:elementor-widget-video|elementor-custom-embed|elementor-video|e-hosted-video|elementor-wrapper)[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi,
		'',
	);

	out = out.replace(/\s(?:class|id)=["'][^"']*elementor[^"']*["']/gi, '');
	out = out.replace(/\sdata-elementor-[a-z0-9-]+(?:=["'][^"']*["'])?/gi, '');
	out = out.replace(/\sdata-settings=["'][^"']*["']/gi, '');

	return out;
}

function htmlToMarkdown(html) {
	const cleaned = stripElementorHtml(html);
	const markdown = turndown.turndown(cleaned);
	return markdown
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.replace(/^\s+|\s+$/g, '');
}

function firstParagraphSummary(markdown, max = 160) {
	const blocks = markdown.split(/\n{2,}/);

	for (const block of blocks) {
		const line = block
			.split('\n')
			.map((part) => part.trim())
			.filter(Boolean)
			.join(' ');
		if (!line) continue;
		if (/^#{1,6}\s/.test(line)) continue;
		if (/^[-*+]\s/.test(line)) continue;
		if (/^\d+\.\s/.test(line)) continue;
		if (/^!\[/.test(line)) continue;

		const text = decodeEntities(line.replace(/[*_`>#\[\]]/g, '')).trim();
		if (!text) continue;
		if (text.length <= max) return text;

		const sliced = text.slice(0, max);
		const lastSpace = sliced.lastIndexOf(' ');
		return (lastSpace > 80 ? sliced.slice(0, lastSpace) : sliced).trim();
	}

	return '';
}

function excerptToDescription(html, max = 160) {
	const text = decodeEntities(htmlToMarkdown(html));
	if (text.length <= max) return text;
	const sliced = text.slice(0, max);
	const lastSpace = sliced.lastIndexOf(' ');
	return (lastSpace > 80 ? sliced.slice(0, lastSpace) : sliced).trim();
}

function yamlScalar(value) {
	const text = String(value ?? '');
	if (text === '') return '""';
	if (/[:#\[\]\{\}&*?|>'"%@`!]|\n/.test(text) || text !== text.trim()) {
		return JSON.stringify(text);
	}
	return text;
}

function yamlList(values) {
	if (!values.length) return '[]';
	return `\n${values.map((item) => `  - ${yamlScalar(item)}`).join('\n')}`;
}

function extensionFromUrl(url) {
	try {
		const ext = path.extname(new URL(url).pathname).toLowerCase();
		return ext && ext.length <= 5 ? ext : '.jpg';
	} catch {
		return '.jpg';
	}
}

async function fileExists(filePath) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function resolveMediaUrl(item) {
	if (item.featured_media) {
		const { data } = await wpFetch(`${API_BASE}/media/${item.featured_media}`);
		const url = data && data.source_url;
		if (url) return url;
	}

	const ogImage = item.yoast_head_json?.og_image?.[0]?.url;
	if (ogImage) return ogImage;

	const match = String(item.content?.rendered ?? '').match(/<img[^>]+src=["']([^"']+)["']/i);
	return match?.[1] ?? null;
}

async function fetchPageBySlug(slug) {
	const { data } = await wpFetch(`${API_BASE}/pages?slug=${encodeURIComponent(slug)}`);
	return Array.isArray(data) && data[0] ? data[0] : null;
}

async function fetchAllPosts() {
	const posts = [];
	let page = 1;
	let totalPages = 1;

	do {
		const { response, data } = await wpFetch(`${API_BASE}/posts?per_page=100&page=${page}`);
		totalPages = Number(response.headers.get('X-WP-TotalPages') ?? '1');
		if (Array.isArray(data)) posts.push(...data);
		page += 1;
	} while (page <= totalPages);

	return posts;
}

async function fetchTagsById(ids) {
	const unique = [...new Set(ids.filter(Boolean))];
	const byId = new Map();
	if (!unique.length) return byId;

	for (let i = 0; i < unique.length; i += 50) {
		const chunk = unique.slice(i, i + 50);
		const { data } = await wpFetch(`${API_BASE}/tags?per_page=100&include=${chunk.join(',')}`);
		if (Array.isArray(data)) {
			for (const tag of data) {
				byId.set(tag.id, decodeEntities(tag.name));
			}
		}
	}

	return byId;
}

async function listAllPageSlugs() {
	const slugs = [];
	let page = 1;
	let totalPages = 1;

	do {
		const { response, data } = await wpFetch(`${API_BASE}/pages?per_page=100&page=${page}&_fields=slug`);
		totalPages = Number(response.headers.get('X-WP-TotalPages') ?? '1');
		if (Array.isArray(data)) slugs.push(...data.map((item) => item.slug));
		page += 1;
	} while (page <= totalPages);

	return slugs;
}

function suggestSlugs(missing, available) {
	return missing.map((slug) => {
		const hints = available.filter((candidate) => candidate.includes(slug) || slug.includes(candidate));
		return { slug, hints };
	});
}

function buildServiceMarkdown(page, slug, imagePath) {
	const title = decodeEntities(page.title?.rendered ?? slug);
	const body = htmlToMarkdown(page.content?.rendered ?? '');
	const shortDescription = firstParagraphSummary(body);
	const hasIndicationLists = /indica/i.test(body);

	const frontmatter = [
		'---',
		`title: ${yamlScalar(title)}`,
		`slug: ${slug}`,
		`shortDescription: ${yamlScalar(shortDescription)}`,
		`heroImage: ${yamlScalar(imagePath ?? '')}`,
		`indications: []${hasIndicationLists ? ' # preencher manualmente a partir do conteúdo abaixo' : ''}`,
		`order: ${SERVICE_ORDER[slug]}`,
		'---',
		'',
	].join('\n');

	return `${frontmatter}${body}\n`;
}

function buildPostMarkdown(post, tags, imagePath) {
	const title = decodeEntities(post.title?.rendered ?? post.slug);
	const description = excerptToDescription(post.excerpt?.rendered ?? '');
	const body = htmlToMarkdown(post.content?.rendered ?? '');
	const publishDate = post.date;

	const frontmatter = [
		'---',
		`title: ${yamlScalar(title)}`,
		`slug: ${post.slug}`,
		`description: ${yamlScalar(description)}`,
		`publishDate: ${publishDate}`,
		`heroImage: ${yamlScalar(imagePath ?? '')}`,
		`tags: ${yamlList(tags)}`,
		'---',
		'',
	].join('\n');

	return `${frontmatter}${body}\n`;
}

async function downloadImage(url, destPath) {
	const response = await fetch(url, { headers: FETCH_HEADERS });
	if (!response.ok) {
		throw new Error(`Falha ao baixar imagem (${response.status}): ${url}`);
	}

	await mkdir(path.dirname(destPath), { recursive: true });
	await writeFile(destPath, Buffer.from(await response.arrayBuffer()));
}

async function planEntry({ kind, slug, markdownPath, imageUrl }) {
	const ext = imageUrl ? extensionFromUrl(imageUrl) : '';
	const imageRel = imageUrl ? `/images/${kind}/${slug}${ext}` : '';
	const imageAbs = imageUrl ? path.join(ROOT, 'src', 'assets', kind, `${slug}${ext}`) : null;
	const markdownAbs = path.join(ROOT, markdownPath);
	const markdownExists = await fileExists(markdownAbs);
	const imageExists = imageAbs ? await fileExists(imageAbs) : false;

	return {
		kind,
		slug,
		markdownPath,
		markdownAbs,
		markdownExists,
		imageUrl,
		imageRel,
		imageAbs,
		imageExists,
		wouldDownload: Boolean(imageUrl),
	};
}

function logPlan(plan) {
	const action = plan.markdownExists ? 'SOBRESCREVER' : 'CRIAR';
	const image = plan.imageUrl
		? `${plan.imageRel} ← ${plan.imageUrl}`
		: 'sem imagem (featured_media ausente e sem fallback)';
	console.log(`  [${action}] ${plan.markdownPath}`);
	console.log(`           imagem: ${image}`);
}

async function applyPlan(plan, markdown) {
	await mkdir(path.dirname(plan.markdownAbs), { recursive: true });
	await writeFile(plan.markdownAbs, markdown, 'utf8');

	if (plan.imageUrl && plan.imageAbs) {
		await downloadImage(plan.imageUrl, plan.imageAbs);
	}
}

async function main() {
	console.log(APPLY ? 'Modo: --apply (grava arquivos)\n' : 'Modo: DRY-RUN (nenhum arquivo será gravado)\n');

	await wpFetch(`${API_BASE}/pages?per_page=1`, { failOn404: true });
	console.log('WP REST API acessível.\n');

	const foundServices = [];
	const missingServices = [];
	const servicePlans = [];

	console.log('Buscando services...');
	for (const slug of SERVICE_SLUGS) {
		const page = await fetchPageBySlug(slug);
		if (!page) {
			missingServices.push(slug);
			console.log(`  [AUSENTE] ${slug}`);
			continue;
		}

		foundServices.push(page);
		const imageUrl = await resolveMediaUrl(page);
		const plan = await planEntry({
			kind: 'services',
			slug,
			markdownPath: `src/content/services/${slug}.md`,
			imageUrl,
		});
		servicePlans.push({ plan, page });
		logPlan(plan);
	}

	console.log('\nBuscando posts do blog...');
	const posts = await fetchAllPosts();
	const tagNameById = await fetchTagsById(posts.flatMap((post) => post.tags ?? []));

	const blogPlans = [];
	for (const post of posts) {
		const imageUrl = await resolveMediaUrl(post);
		const plan = await planEntry({
			kind: 'blog',
			slug: post.slug,
			markdownPath: `src/content/blog/${post.slug}.md`,
			imageUrl,
		});
		const tags = (post.tags ?? []).map((id) => tagNameById.get(id)).filter(Boolean);
		blogPlans.push({ plan, post, tags });
		logPlan(plan);
	}

	if (APPLY) {
		console.log('\nGravando arquivos...');
		for (const { plan, page } of servicePlans) {
			await applyPlan(plan, buildServiceMarkdown(page, plan.slug, plan.imageRel));
		}
		for (const { plan, post, tags } of blogPlans) {
			await applyPlan(plan, buildPostMarkdown(post, tags, plan.imageRel));
		}
	}

	const availableSlugs = missingServices.length ? await listAllPageSlugs() : [];
	const suggestions = suggestSlugs(missingServices, availableSlugs);
	const imageCount = [...servicePlans, ...blogPlans].filter(({ plan }) => plan.wouldDownload).length;

	console.log('\n=== Relatório extract-wp ===');
	console.log(`Services encontradas: ${foundServices.length} / 7 esperadas`);
	console.log(`Posts de blog encontrados: ${posts.length}`);
	console.log(`Imagens que ${APPLY ? 'foram' : 'seriam'} baixadas: ${imageCount}`);

	if (missingServices.length) {
		console.log('Slugs de services NÃO encontrados:');
		for (const item of suggestions) {
			const hint = item.hints.length ? ` (possíveis no WP: ${item.hints.join(', ')})` : '';
			console.log(`  - ${item.slug}${hint}`);
		}
	} else {
		console.log('Slugs de services não encontrados: nenhum');
	}
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
