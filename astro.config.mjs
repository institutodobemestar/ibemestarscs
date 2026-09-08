// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	site: 'https://www.institutodobemestar.com.br',
	output: 'static',
	adapter: vercel(),
	integrations: [
		sitemap({
			filter: (page) =>
				!page.includes('/politica-de-privacidade') && !page.includes('/termos-de-uso'),
		}),
	],
	build: {
		inlineStylesheets: 'always',
	},
	vite: {
		plugins: [tailwindcss()],
	},
});
