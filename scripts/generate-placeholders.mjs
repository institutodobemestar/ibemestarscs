import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const images = [
	{ file: 'src/assets/images/hero-clinica.png', w: 1600, h: 1200, color: '#0d9488' },
	{ file: 'src/assets/images/services/fisioterapia-ortopedica.png', w: 1200, h: 800, color: '#0f766e' },
	{ file: 'src/assets/images/services/reabilitacao-neurologica.png', w: 1200, h: 800, color: '#155e75' },
	{ file: 'src/assets/images/services/rpg-postura.png', w: 1200, h: 800, color: '#1b3a4b' },
	{ file: 'src/assets/images/blog/lombalgia.png', w: 1280, h: 720, color: '#134e4a' },
	{ file: 'src/assets/images/blog/pos-cirurgico.png', w: 1280, h: 720, color: '#0f766e' },
	{ file: 'src/assets/images/team/ana-figueiredo.png', w: 600, h: 600, color: '#0d9488' },
	{ file: 'src/assets/images/team/ricardo-mendes.png', w: 600, h: 600, color: '#1b3a4b' },
	{ file: 'src/assets/images/testimonials/maria-helena.png', w: 240, h: 240, color: '#e07a5f' },
];

for (const image of images) {
	const dest = path.resolve(image.file);
	await mkdir(path.dirname(dest), { recursive: true });
	await sharp({
		create: {
			width: image.w,
			height: image.h,
			channels: 3,
			background: image.color,
		},
	})
		.png()
		.toFile(dest);
}

console.log(`Geradas ${images.length} imagens de placeholder.`);
