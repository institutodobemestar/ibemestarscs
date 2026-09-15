import { getCollection, type CollectionEntry } from 'astro:content';

export async function getPublishedPosts() {
	return (await getCollection('blog')).sort(
		(a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf(),
	);
}

export function getPostCategory(post: CollectionEntry<'blog'>) {
	if (post.data.tags[0]) return post.data.tags[0];

	const slug = post.data.slug;
	if (slug.includes('acupuntura')) return 'Acupuntura';
	if (slug.includes('hidroterapia')) return 'Hidroterapia';
	if (slug.includes('pilates')) return 'Pilates clínico';
	if (slug.includes('ozonio')) return 'Ozonioterapia';
	if (slug.includes('microfisio')) return 'Microfisioterapia';
	return 'Fisioterapia';
}
