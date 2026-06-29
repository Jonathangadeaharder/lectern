import { describe, expect, it } from 'vitest';
import {
	FindingSchema,
	SuggestionSchema,
	PrAgentReviewSchema,
	PrAgentDescribeSchema,
	PrAgentImproveSchema,
	PrAgentAskSchema,
	PrAgentCrashError,
	PrAgentParseError,
	PrAgentSetupError,
	PrAgentTimeoutError
} from './index';

describe('PrAgentReviewSchema', () => {
	it('validates a minimal review', () => {
		const result = PrAgentReviewSchema.safeParse({ task: 'review' });
		expect(result.success).toBe(true);
		expect(result.success && result.data.findings).toEqual([]);
		expect(result.success && result.data.summary).toBe('');
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
		expect(result.success && result.data.findings).toHaveLength(1);
		expect(result.success && result.data.findings[0]?.severityHint).toBe('blocker');
	});

	it('rejects wrong task value', () => {
		const result = PrAgentReviewSchema.safeParse({ task: 'describe' });
		expect(result.success).toBe(false);
	});

	it('uses default for missing findings', () => {
		const result = PrAgentReviewSchema.safeParse({ task: 'review', summary: 'ok' });
		expect(result.success).toBe(true);
		expect(result.success && result.data.findings).toEqual([]);
	});

	it('accepts raw field', () => {
		const result = PrAgentReviewSchema.safeParse({
			task: 'review',
			raw: { some: 'data' }
		});
		expect(result.success).toBe(true);
	});
});

describe('PrAgentDescribeSchema', () => {
	it('validates a minimal describe', () => {
		const result = PrAgentDescribeSchema.safeParse({ task: 'describe' });
		expect(result.success).toBe(true);
		expect(result.success && result.data.title).toBe('');
		expect(result.success && result.data.labels).toEqual([]);
	});

	it('validates a describe with title and labels', () => {
		const result = PrAgentDescribeSchema.safeParse({
			task: 'describe',
			title: 'Fix race condition in worker pool',
			description: 'Adds mutex around shared queue',
			labels: ['bug fix', 'concurrency']
		});
		expect(result.success).toBe(true);
		expect(result.success && result.data.labels).toContain('concurrency');
	});
});

describe('PrAgentImproveSchema', () => {
	it('validates a minimal improve', () => {
		const result = PrAgentImproveSchema.safeParse({ task: 'improve' });
		expect(result.success).toBe(true);
		expect(result.success && result.data.suggestions).toEqual([]);
	});
});

describe('PrAgentAskSchema', () => {
	it('validates a minimal ask', () => {
		const result = PrAgentAskSchema.safeParse({ task: 'ask' });
		expect(result.success).toBe(true);
		expect(result.success && result.data.answer).toBe('');
	});

	it('validates ask with answer', () => {
		const result = PrAgentAskSchema.safeParse({
			task: 'ask',
			answer: 'This function returns null on empty input.'
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

describe('SuggestionSchema', () => {
	it('validates with all fields', () => {
		const result = SuggestionSchema.safeParse({
			id: 's1',
			file: 'src/bar.ts',
			line: 5,
			message: 'use const instead of let',
			suggestion: 'const x = 1',
			category: 'style',
			severityHint: 'minor'
		});
		expect(result.success).toBe(true);
	});
});

describe('PrAgentSetupError', () => {
	it('has correct name and message', () => {
		const err = new PrAgentSetupError('Python not found');
		expect(err.name).toBe('PrAgentSetupError');
		expect(err.reason).toBe('Python not found');
		expect(err.message).toContain('Python not found');
	});
});

describe('PrAgentTimeoutError', () => {
	it('has correct name and message', () => {
		const err = new PrAgentTimeoutError();
		expect(err.name).toBe('PrAgentTimeoutError');
		expect(err.message).toBe('PR-Agent run timed out.');
	});
});

describe('PrAgentCrashError', () => {
	it('has correct name, stderrTail, and code', () => {
		const err = new PrAgentCrashError('traceback...', 1);
		expect(err.name).toBe('PrAgentCrashError');
		expect(err.stderrTail).toBe('traceback...');
		expect(err.code).toBe(1);
		expect(err.message).toContain('1');
	});
});

describe('PrAgentParseError', () => {
	it('has correct name, rawOutput, and message', () => {
		const err = new PrAgentParseError('not json');
		expect(err.name).toBe('PrAgentParseError');
		expect(err.rawOutput).toBe('not json');
		expect(err.message).toContain('not valid JSON');
	});
});

describe('runReview', () => {
	it.todo('requires integration test with venv + DB');
});

describe('runDescribe', () => {
	it.todo('requires integration test with venv + DB');
});

describe('runImprove', () => {
	it.todo('requires integration test with venv + DB');
});

describe('runAsk', () => {
	it.todo('requires integration test with venv + DB');
});

describe('isPrAgentAvailable', () => {
	it.todo('requires integration test with filesystem');
});
