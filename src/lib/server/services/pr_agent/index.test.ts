import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const FindingSchema = z.object({
	id: z.string().optional(),
	category: z.string().optional(),
	severityHint: z.enum(['blocker', 'major', 'minor']).optional(),
	file: z.string().optional(),
	line: z.number().optional(),
	endLine: z.number().optional(),
	message: z.string().optional(),
	suggestion: z.string().optional()
});

const PrAgentReviewSchema = z.object({
	task: z.literal('review'),
	findings: z.array(FindingSchema).default([]),
	summary: z.string().default(''),
	raw: z.unknown().optional()
});

describe('PrAgentReviewSchema', () => {
	it('validates a minimal review', () => {
		const result = PrAgentReviewSchema.safeParse({ task: 'review' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.findings).toEqual([]);
			expect(result.data.summary).toBe('');
		}
	});

	it('validates a review with findings', () => {
		const input = {
			task: 'review',
			findings: [
				{
					id: 'f1',
					category: 'sql_injection',
					severityHint: 'blocker',
					file: 'src/db.ts',
					line: 42,
					message: 'SQL injection vulnerability',
					suggestion: 'Use parameterized queries'
				}
			],
			summary: 'Found 1 blocker'
		};
		const result = PrAgentReviewSchema.safeParse(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.findings).toHaveLength(1);
			expect(result.data.findings[0]!.severityHint).toBe('blocker');
		}
	});

	it('rejects wrong task value', () => {
		const result = PrAgentReviewSchema.safeParse({ task: 'describe' });
		expect(result.success).toBe(false);
	});

	it('uses default for missing findings', () => {
		const result = PrAgentReviewSchema.safeParse({ task: 'review', summary: 'ok' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.findings).toEqual([]);
		}
	});

	it('accepts raw field', () => {
		const result = PrAgentReviewSchema.safeParse({
			task: 'review',
			raw: { some: 'data' }
		});
		expect(result.success).toBe(true);
	});
});

describe('FindingSchema', () => {
	it('validates with all fields', () => {
		const result = FindingSchema.safeParse({
			id: 'f1',
			category: 'bug',
			severityHint: 'major',
			file: 'src/foo.ts',
			line: 10,
			endLine: 20,
			message: 'something wrong',
			suggestion: 'fix it'
		});
		expect(result.success).toBe(true);
	});

	it('validates with no fields (all optional)', () => {
		const result = FindingSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	it('rejects invalid severityHint', () => {
		const result = FindingSchema.safeParse({ severityHint: 'critical' });
		expect(result.success).toBe(false);
	});
});
