import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Dashboard from './+page.svelte';

function payload(over: Record<string, unknown> = {}) {
	return {
		dashboard: {
			heatmap: [] as Array<{ date: string; count: number; avgScore: number | null }>,
			skills: [] as Array<unknown>,
			repoCards: [] as Array<unknown>,
			recentSessions: [] as Array<unknown>,
			calibration: [] as Array<unknown>,
			totalSessions: 0,
			totalQuestions: 0,
			overallAvgScore: null,
			streak: 0,
			streakWeek: [] as boolean[],
			...over
		}
	};
}

describe('Dashboard', () => {
	it('renders empty state with all zeros', () => {
		render(Dashboard, { data: payload() });
		expect(screen.getByText(/Welcome back/i)).toBeInTheDocument();
		const stats = screen.getAllByText('0');
		expect(stats.length).toBeGreaterThanOrEqual(3);
	});

	it('renders hero stats from data', () => {
		render(Dashboard, {
			data: payload({
				totalSessions: 47,
				totalQuestions: 312,
				overallAvgScore: 0.74,
				repoCards: [
					{
						repoSlug: 'a/b',
						totalSessions: 1,
						avgScore: 0.5,
						lastSessionAt: null,
						topWeakTag: null
					}
				]
			})
		});
		expect(screen.getByText(/shipped/i)).toBeInTheDocument();
		expect(screen.getByText(/answered/i)).toBeInTheDocument();
	});

	it('renders skill rows with levels', () => {
		render(Dashboard, {
			data: payload({
				skills: [
					{
						tag: 'react',
						ewmaScore: 0.6,
						level: 'developing',
						totalAttempts: 12,
						passRate: 0.5,
						trend: [] as number[]
					}
				]
			})
		});
		expect(screen.getByText('react')).toBeInTheDocument();
		expect(screen.getByText('developing')).toBeInTheDocument();
		expect(screen.getByText('12')).toBeInTheDocument();
	});

	it('omits repo card grid when empty', () => {
		const { container } = render(Dashboard, { data: payload() });
		expect(container.querySelector('.repo-grid')).not.toBeInTheDocument();
	});

	it('renders repo card with mastery and weak tag', () => {
		render(Dashboard, {
			data: payload({
				repoCards: [
					{
						repoSlug: 'drizzle-team/orm',
						totalSessions: 4,
						avgScore: 0.62,
						lastSessionAt: null,
						topWeakTag: 'concurrency'
					}
				]
			})
		});
		expect(screen.getByText('drizzle-team/orm')).toBeInTheDocument();
		expect(screen.getByText('62')).toBeInTheDocument();
		expect(screen.getByText('concurrency')).toBeInTheDocument();
	});

	it('omits calibration block when no points', () => {
		render(Dashboard, { data: payload() });
		expect(screen.queryByText(/Predicted vs Actual/i)).not.toBeInTheDocument();
	});

	it('renders calibration scatter SVG when points exist', () => {
		const { container } = render(Dashboard, {
			data: payload({
				calibration: [{ predicted: 0.5, actual: 0.4, count: 10 }]
			})
		});
		expect(container.querySelector('svg.calib-svg')).toBeInTheDocument();
		expect(container.querySelectorAll('svg circle').length).toBe(1);
	});

	it('renders recent sessions with Debrief link', () => {
		render(Dashboard, {
			data: payload({
				recentSessions: [
					{
						sessionId: 'sess-1234567890',
						repoSlug: 'a/b',
						state: 'completed',
						startedAt: null,
						confidenceScore: 75,
						questionsAttempted: 10,
						questionsPassed: 7
					}
				]
			})
		});
		expect(screen.getByText('a/b')).toBeInTheDocument();
		const link = screen.getByRole('link', { name: /Debrief/i });
		expect(link).toHaveAttribute('href', '/session/sess-1234567890/debrief');
	});
});
