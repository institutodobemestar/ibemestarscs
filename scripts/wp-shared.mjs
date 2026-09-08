import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import TurndownService from 'turndown';

export const WP_ORIGIN = 'https://ibemestarscs.com.br';
export const API_BASE = `${WP_ORIGIN}/wp-json/wp/v2`;

export const FETCH_HEADERS = {
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

export class ApiUnavailableError extends Error {
	constructor() {
		super(
			'WP REST API não está acessível. Verifique se está bloqueada por plugin de segurança (ex: Wordfence, iThemes Security) ou se o site usa outro caminho de API.',
		);
		this.name = 'ApiUnavailableError';
	}
}

export async function wpFetch(url, { failOn404 = false } = {}) {
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

export function decodeEntities(value) {
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

export function stripElementorHtml(html) {
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
	out = out.replace(/\sstyle=["'][^"']*["']/gi, '');

	return out;
}

export function htmlToMarkdown(html) {
	const cleaned = stripElementorHtml(html);
	const markdown = turndown.turndown(cleaned);
	return markdown
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.replace(/^\s+|\s+$/g, '');
}

export async function fetchPageBySlug(slug) {
	const { data } = await wpFetch(`${API_BASE}/pages?slug=${encodeURIComponent(slug)}`);
	return Array.isArray(data) && data[0] ? data[0] : null;
}

export async function resolveMediaUrl(item) {
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

export async function listAllPageSlugs() {
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

export async function downloadImage(url, destPath) {
	const response = await fetch(url, { headers: FETCH_HEADERS });
	if (!response.ok) {
		throw new Error(`Falha ao baixar imagem (${response.status}): ${url}`);
	}

	await mkdir(path.dirname(destPath), { recursive: true });
	await writeFile(destPath, Buffer.from(await response.arrayBuffer()));
}
