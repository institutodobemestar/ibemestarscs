import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'https://ibemestarscs.com.br/wp-content/uploads/2024/08/Logo-2-svg.svg';
const DEST = path.join(ROOT, 'src', 'assets', 'logo.svg');

const HEADERS = {
	Accept: 'image/svg+xml,*/*',
	'User-Agent': 'InstitutoDoBemEstarAstroExtractor/1.0',
};

async function main() {
	const response = await fetch(URL, { headers: HEADERS });
	if (!response.ok) {
		throw new Error(`Falha ao baixar o logo (${response.status}): ${URL}`);
	}

	const body = await response.text();
	if (!body.includes('<svg')) {
		throw new Error('A resposta não parece um SVG válido.');
	}

	await mkdir(path.dirname(DEST), { recursive: true });
	await writeFile(DEST, body, 'utf8');
	console.log(`OK src/assets/logo.svg ← ${URL}`);
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
