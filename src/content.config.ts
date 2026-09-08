import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const services = defineCollection({
	loader: glob({ base: './src/content/services', pattern: '**/*.md' }),
	schema: z.object({
		title: z.string(),
		slug: z.string(),
		shortDescription: z.string(),
		icon: z.string().optional(),
		heroImage: z.string(),
		indications: z.array(z.string()),
		order: z.number(),
	}),
});

const blog = defineCollection({
	loader: glob({ base: './src/content/blog', pattern: '**/*.md' }),
	schema: z.object({
		title: z.string(),
		slug: z.string(),
		description: z.string(),
		publishDate: z.coerce.date(),
		heroImage: z.string(),
		tags: z.array(z.string()),
	}),
});

const team = defineCollection({
	loader: glob({ pattern: '**/*.json', base: './src/content/team' }),
	schema: ({ image }) =>
		z.object({
			name: z.string(),
			crefito: z.string(),
			specialties: z.array(z.string()),
			bio: z.string(),
			photo: image(),
			socials: z
				.object({
					facebook: z.string().optional(),
					youtube: z.string().optional(),
				})
				.optional(),
		}),
});

const testimonials = defineCollection({
	loader: glob({ base: './src/content/testimonials', pattern: '**/*.json' }),
	schema: z.object({
		name: z.string(),
		quote: z.string(),
		photo: z.string().optional(),
		rating: z.number(),
	}),
});

export const collections = { services, blog, team, testimonials };
