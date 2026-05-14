import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import RepoProfile from './+page.svelte';

function payload(over: Record<string, unknown> = {}) {
	return {
		profile: {
			repoSlug: 'drizzle-team/orm',
			competence: { totalSessions: 9, totalQuestions: 81, avgScore: 0.62 } as const,
			skills: [] as Array<unknown>,
			weakSpots: [] as Array<unknown>,
			bugPatterns: [] as Array<unknown>,
			conventions: [] as Array<unknown>,
			recentActivity: [] as Array<unknown>,
			...over
		}
	};
}

describe('Repo Profile', () => {
	it('renders repo slug as title', () => {
		render(RepoProfile, { data: payload() });
		expect(screen.getByText('drizzle-team/orm')).toBeInTheDocument();
	});

	it('renders mastery score', () => {
		render(RepoProfile, { data: payload() });
		expect(screen.getByText('62')).toBeInTheDocument();
	});

	it('renders skill rows with bar colors', () => {
		render(RepoProfile, {
			data: payload({
				skills: [
					{
						tag: 'react',
						ewmaScore: 0.8,
						level: 'mastered',
						totalAttempts: 20,
						passRate: 0.9,
						trend: []
					},
					{
						tag: 'rust',
						ewmaScore: 0.6,
						level: 'proficient',
						totalAttempts: 15,
						passRate: 0.7,
						trend: []
					},
					{
						tag: 'css',
						ewmaScore: 0.2,
						level: 'novice',
						totalAttempts: 5,
						passRate: 0.3,
						trend: []
					}
				]
			})
		});
		expect(screen.getByText('react')).toBeInTheDocument();
		expect(screen.getByText('rust')).toBeInTheDocument();
		expect(screen.getByText('css')).toBeInTheDocument();
	});

	it('renders bug patterns with pip count clamped at 8', () => {
		const { container } = render(RepoProfile, {
			data: payload({
				bugPatterns: [{ summary: 'X', rootCause: 'Y', frequency: 12, confidence: 0.8 }]
			})
		});
		expect(screen.getByText('X')).toBeInTheDocument();
		expect(container.querySelectorAll('.bug-pip').length).toBe(8);
	});

	it('renders weak spots list', () => {
		render(RepoProfile, {
			data: payload({
				weakSpots: [{ tag: 'concurrency', missRate: 0.42, sampleCount: 12 }]
			})
		});
		expect(screen.getByText('concurrency')).toBeInTheDocument();
	});

	it('renders conventions section when present', () => {
		render(RepoProfile, {
			data: payload({
				conventions: [{ source: 'auto' as const, filePath: 'src/foo.ts', summary: 'bar' }]
			})
		});
		expect(screen.getByText('bar')).toBeInTheDocument();
	});

	it('renders recent activity section', () => {
		render(RepoProfile, {
			data: payload({
				recentActivity: [
					{ date: '2026-05-01', questionsAttempted: 5, questionsPassed: 4, avgScore: 0.8 }
				]
			})
		});
		expect(screen.getByText('4/5 passed')).toBeInTheDocument();
	});

	it('shows no-sessions placeholder when competence null', () => {
		render(RepoProfile, {
			data: payload({ competence: null })
		});
		expect(screen.getByText(/No sessions for this repo yet/i)).toBeInTheDocument();
	});
});
