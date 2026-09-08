import type { ImageMetadata } from 'astro';

const modules = import.meta.glob<{ default: ImageMetadata }>('../assets/**/*.{png,jpg,jpeg,webp,gif}', {
	eager: true,
});

export function resolveContentImage(src: string): ImageMetadata {
	const fileName = src.replace(/^\/images\//, '').replace(/^\//, '');
	const match = Object.entries(modules).find(([key]) => key.endsWith(`/${fileName}`) || key.endsWith(fileName));

	if (!match) {
		throw new Error(`Imagem de conteúdo não encontrada: ${src}`);
	}

	return match[1].default;
}
