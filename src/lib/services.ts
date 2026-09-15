import serviceDetails from '../data/service-details.json';

export function cleanServiceTitle(title: string) {
	return title.replace(/\u200b/g, '').trim();
}

const iconAttrs =
	'xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

const serviceIcons: Record<string, string> = {
	fisioterapia: `<svg ${iconAttrs}><circle cx="12" cy="5" r="2"/><path d="M9 21v-4l-3-7 6-3 6 3-3 7v4"/><path d="M6 11h2M16 11h2"/></svg>`,
	acupuntura: `<svg ${iconAttrs}><path d="M12 3v4"/><circle cx="12" cy="12" r="3.25"/><path d="m5.6 6.4 2.2 2.2M18.4 6.4 16.2 8.6M5.6 17.6l2.2-2.2M18.4 17.6l-2.2-2.2"/><path d="M12 17v4"/></svg>`,
	hidroterapia: `<svg ${iconAttrs}><path d="M3 7c1 .7 2 1.2 3.5 1.2 2.5 0 2.5-2.4 5-2.4s2.5 2.4 5 2.4c1.5 0 2.5-.5 3.5-1.2"/><path d="M3 12c1 .7 2 1.2 3.5 1.2 2.5 0 2.5-2.4 5-2.4s2.5 2.4 5 2.4c1.5 0 2.5-.5 3.5-1.2"/><path d="M3 17c1 .7 2 1.2 3.5 1.2 2.5 0 2.5-2.4 5-2.4s2.5 2.4 5 2.4c1.5 0 2.5-.5 3.5-1.2"/></svg>`,
	'pilates-clinico': `<svg ${iconAttrs}><circle cx="12" cy="5" r="2"/><path d="M12 7v5M9 21l3-9 3 9M6 12h12"/></svg>`,
	ozonioterapia: `<svg ${iconAttrs}><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2"/></svg>`,
	microfisioterapia: `<svg ${iconAttrs}><path d="M8 11c0-2 1.5-3.5 4-3.5s4 1.5 4 3.5v7H8v-7Z"/><path d="M10 21v-3h4v3"/></svg>`,
	'terapias-manuais': `<svg ${iconAttrs}><path d="M8 13c0-2.2 1.8-4 4-4s4 1.8 4 4v6H8v-6Z"/><path d="M7 11 5 8.5M17 11l2-2.5"/></svg>`,
};

const fallbackIcon = `<svg ${iconAttrs}><circle cx="12" cy="12" r="9"/><path d="M4.5 12.5 9 17l10.5-10.5"/></svg>`;

export function getServiceIcon(slug: string) {
	return serviceIcons[slug] ?? fallbackIcon;
}

export function getServiceDetails(slug: string) {
	return serviceDetails[slug as keyof typeof serviceDetails] ?? null;
}
