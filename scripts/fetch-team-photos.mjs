import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PHOTOS = [
	{
		url: 'https://ibemestarscs.com.br/wp-content/uploads/2025/10/Design-sem-nome-34.png',
		dest: path.join(ROOT, 'src', 'assets', 'team', 'ricardo-rossi.png'),
		json: path.join(ROOT, 'src', 'content', 'team', 'ricardo-rossi.json'),
		photo: '../../assets/team/ricardo-rossi.png',
	},
	{
		url: 'https://ibemestarscs.com.br/wp-content/uploads/2024/10/Doutora.png',
		dest: path.join(ROOT, 'src', 'assets', 'team', 'daniele-rossi.png'),
		json: path.join(ROOT, 'src', 'content', 'team', 'daniele-rossi.json'),
		photo: '../../assets/team/daniele-rossi.png',
	},
];

const HEADERS = {
	Accept: 'image/*,*/*',
	'User-Agent': 'InstitutoDoBemEstarAstroExtractor/1.0',
};

async function download(url, dest) {
	const response = await fetch(url, { headers: HEADERS });
	if (!response.ok) {
		throw new Error(`Falha ao baixar ${url} (${response.status})`);
	}

	await mkdir(path.dirname(dest), { recursive: true });
	await writeFile(dest, Buffer.from(await response.arrayBuffer()));
}

async function updatePhotoField(jsonPath, photo) {
	const data = JSON.parse(await readFile(jsonPath, 'utf8'));
	data.photo = photo;
	await writeFile(jsonPath, `${JSON.stringify(data, null, '\t')}\n`, 'utf8');
}

async function main() {
	for (const item of PHOTOS) {
		await download(item.url, item.dest);
		await updatePhotoField(item.json, item.photo);
		console.log(`OK ${item.photo}`);
		console.log(`   ${item.url}`);
	}
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
