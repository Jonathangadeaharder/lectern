import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	BudgetExceededError,
	CircuitOpenError,
	LlmAbortError,
	LlmAuthError,
	LlmNotConfiguredError,
	LlmProviderError,
	LlmRateLimitError,
	LlmSchemaError
} from './errors';

vi.mock('./provider', () => ({
	getModel: vi.fn()
}));

vi.mock('ai', () => ({
	generateObject: vi.fn(),
	streamObject: vi.fn(),
	generateText: vi.fn()
}));

vi.mock('../../db', () => ({
	getDb: vi.fn(() => ({
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					get: vi.fn(() => null)
				}))
			}))
		}))
	}))
}));

describe('LLM Errors', () => {
	it('LlmNotConfiguredError has 412 status', () => {
		const err = new LlmNotConfiguredError();
		expect(err.httpStatus).toBe(412);
		expect(err.name).toBe('LlmNotConfiguredError');
	});

	it('LlmAuthError has 401 status', () => {
		const err = new LlmAuthError('test');
		expect(err.httpStatus).toBe(401);
		expect(err.message).toBe('test');
	});

	it('LlmRateLimitError has 429 status', () => {
		const err = new LlmRateLimitError('test', 5);
		expect(err.httpStatus).toBe(429);
		expect(err.retryAfterSec).toBe(5);
	});

	it('LlmSchemaError has 502 status', () => {
		const err = new LlmSchemaError();
		expect(err.httpStatus).toBe(502);
	});

	it('LlmAbortError has 499 status', () => {
		const err = new LlmAbortError();
		expect(err.httpStatus).toBe(499);
	});

	it('LlmProviderError has 502 status', () => {
		const err = new LlmProviderError('test', 500);
		expect(err.httpStatus).toBe(502);
		expect(err.upstreamStatus).toBe(500);
	});

	it('CircuitOpenError has 503 status', () => {
		const err = new CircuitOpenError(Date.now());
		expect(err.httpStatus).toBe(503);
		expect(err.name).toBe('CircuitOpenError');
		expect(err.opensAt).toBeTypeOf('number');
	});

	it('BudgetExceededError has 429 status', () => {
		const err = new BudgetExceededError(150, 100);
		expect(err.httpStatus).toBe(429);
		expect(err.name).toBe('BudgetExceededError');
		expect(err.used).toBe(150);
		expect(err.limit).toBe(100);
	});
});
