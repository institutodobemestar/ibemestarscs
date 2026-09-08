export function formatPublishDate(date: Date) {
	return date.toLocaleDateString('pt-BR', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});
}
