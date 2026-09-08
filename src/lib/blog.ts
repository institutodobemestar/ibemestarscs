import { getCollection } from 'astro:content';

export async function getPublishedPosts() {
	return (await getCollection('blog')).sort(
		(a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf(),
	);
}
