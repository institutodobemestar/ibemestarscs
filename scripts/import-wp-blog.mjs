import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const postsUrl = 'https://ibemestarscs.com.br/wp-json/wp/v2/posts?per_page=100&_embed=1';
const blogDir = path.join(root, 'src/content/blog');
const heroDir = path.join(root, 'src/assets/blog');
const inlineDir = path.join(root, 'src/assets/blog-inline');

function decodeEntities(text) {
	return text
		.replace(/&#8211;/g, '–')
		.replace(/&#8212;/g, '—')
		.replace(/&#8216;/g, '‘')
		.replace(/&#8217;/g, '’')
		.replace(/&#8220;/g, '“')
		.replace(/&#8221;/g, '”')
		.replace(/&#8226;/g, '•')
		.replace(/&#8230;/g, '…')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html) {
	return decodeEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function yamlQuote(value) {
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function extFromUrl(url) {
	const clean = url.split('?')[0];
	const ext = path.extname(clean).toLowerCase();
	if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return ext;
	return '.jpg';
}

async function download(url, dest) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Falha ao baixar ${url}: ${res.status}`);
	const buf = Buffer.from(await res.arrayBuffer());
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.writeFileSync(dest, buf);
	return dest;
}

const sitePages = new Set([
	'contato',
	'equipe',
	'servicos',
	'sobre-nos',
	'infraestrutura',
	'blog',
]);

function rewriteInternalLinks(href, postSlugs) {
	try {
		const u = new URL(href, 'https://ibemestarscs.com.br');
		if (u.hostname.includes('wa.me') || href.includes('whatsapp')) return '/contato/';
		if (!u.hostname.includes('ibemestarscs.com.br')) return href;
		const parts = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
		const slug = parts.at(-1);
		if (!slug) return '/';
		if (sitePages.has(slug) || sitePages.has(parts[0])) {
			return `/${parts.join('/')}/`;
		}
		if (postSlugs.has(slug)) return `/blog/${slug}/`;
		return `/${parts.join('/')}/`;
	} catch {
		return href;
	}
}

function htmlToMarkdown(html, imageMap, postSlugs) {
	let md = html;
	md = md.replace(/<script[\s\S]*?<\/script>/gi, '');
	md = md.replace(/<style[\s\S]*?<\/style>/gi, '');
	md = md.replace(/<!--[\s\S]*?-->/g, '');

	md = md.replace(/<figure[\s\S]*?<\/figure>/gi, (block) => {
		const src = block.match(/src="([^"]+)"/i)?.[1];
		const alt = block.match(/alt="([^"]*)"/i)?.[1] || '';
		if (!src) return '';
		const local = imageMap.get(src.split('?')[0]) || imageMap.get(src);
		if (!local) return '';
		return `\n\n![${decodeEntities(alt)}](${local})\n\n`;
	});

	md = md.replace(/<img[^>]*>/gi, (tag) => {
		const src = tag.match(/src="([^"]+)"/i)?.[1];
		const alt = tag.match(/alt="([^"]*)"/i)?.[1] || '';
		if (!src) return '';
		const local = imageMap.get(src.split('?')[0]) || imageMap.get(src);
		if (!local) return '';
		return `\n\n![${decodeEntities(alt)}](${local})\n\n`;
	});

	md = md.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, inner) => {
		const text = stripTags(inner);
		return `\n\n${'#'.repeat(Number(level))} ${text}\n\n`;
	});

	md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) => {
		const text = stripTags(inner);
		return `\n\n> ${text}\n\n`;
	});

	md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) => `- ${inline(inner, postSlugs)}\n`);
	md = md.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');
	md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, inner) => `\n\n${inline(inner, postSlugs)}\n\n`);
	md = md.replace(/<br\s*\/?>/gi, '\n');
	md = md.replace(/<\/?(div|span|section|article)[^>]*>/gi, '');
	md = md.replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
		const label = stripTags(inner);
		const link = rewriteInternalLinks(href, postSlugs);
		return `[${label}](${link})`;
	});

	md = decodeEntities(md);
	md = md.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
	return `${md}\n`;
}

function inline(html, postSlugs) {
	let text = html;
	text = text.replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
		const label = stripTags(inner);
		const link = rewriteInternalLinks(href, postSlugs);
		return `[${label}](${link})`;
	});
	text = text.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
	text = text.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');
	text = stripTags(text);
	return text;
}

const posts = await (await fetch(postsUrl)).json();
fs.mkdirSync(heroDir, { recursive: true });
fs.mkdirSync(inlineDir, { recursive: true });
fs.mkdirSync(blogDir, { recursive: true });

console.log(`Posts encontrados: ${posts.length}`);
const postSlugs = new Set(posts.map((post) => post.slug));

for (const post of posts) {
	const slug = post.slug;
	const title = decodeEntities(stripTags(post.title.rendered));
	const yoast = post.yoast_head_json?.description || stripTags(post.excerpt.rendered).replace(/\[\s*…\s*\]$/, '').trim();
	const description = yoast.replace(/\s+/g, ' ').trim();
	const publishDate = post.date.replace(' ', 'T');
	const terms = post._embedded?.['wp:term']?.flat?.() || [];
	const tags = terms
		.filter((term) => term.taxonomy === 'category' && !['sem-categoria', 'blog'].includes(term.slug))
		.map((term) => term.name);

	const featured = post._embedded?.['wp:featuredmedia']?.[0];
	const featuredUrl = featured?.source_url;
	let heroExt = '.jpg';
	if (featuredUrl) {
		heroExt = extFromUrl(featuredUrl);
		const heroPath = path.join(heroDir, `${slug}${heroExt}`);
		process.stdout.write(`capa ${slug}... `);
		await download(featuredUrl, heroPath);
		console.log('ok');
	}

	const html = post.content.rendered;
	const urls = [...html.matchAll(/src="(https?:[^"]+)"/gi)].map((m) => m[1]);
	const imageMap = new Map();
	let inlineIndex = 1;
	for (const url of urls) {
		const abs = url.split('?')[0];
		if (imageMap.has(abs)) continue;
		const ext = extFromUrl(abs);
		const fileName = `${slug}-${inlineIndex}${ext}`;
		inlineIndex += 1;
		const dest = path.join(inlineDir, fileName);
		process.stdout.write(`inline ${fileName}... `);
		try {
			await download(abs, dest);
			imageMap.set(abs, `../../assets/blog-inline/${fileName}`);
			imageMap.set(url, `../../assets/blog-inline/${fileName}`);
			console.log('ok');
		} catch (error) {
			console.log(`erro (${error.message})`);
		}
	}

	const body = htmlToMarkdown(html, imageMap, postSlugs);
	const frontmatter = [
		'---',
		`title: ${yamlQuote(title)}`,
		`slug: ${slug}`,
		`description: ${yamlQuote(description)}`,
		`publishDate: ${publishDate}`,
		`heroImage: /images/blog/${slug}${heroExt}`,
		`tags: [${tags.map((tag) => yamlQuote(tag)).join(', ')}]`,
		'---',
		'',
		body,
	].join('\n');

	fs.writeFileSync(path.join(blogDir, `${slug}.md`), frontmatter);
	console.log(`markdown ${slug}`);
}

console.log('Importação concluída.');
