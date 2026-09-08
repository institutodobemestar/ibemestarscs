export function cleanServiceTitle(title: string) {
	return title.replace(/\u200b/g, '').trim();
}
