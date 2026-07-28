import { describe, expect, it } from 'vitest';
import { IllegalSessionTransition, nextState } from './machine';

describe('nextState', () => {
	describe('start event', () => {
		it('transitions from created to active', () => {
			expect(nextState('created', { kind: 'start' })).toBe('active');
		});

		it('throws from active', () => {
			expect(() => nextState('active', { kind: 'start' })).toThrow(IllegalSessionTransition);
		});

		it('throws from paused', () => {
			expect(() => nextState('paused', { kind: 'start' })).toThrow(IllegalSessionTransition);
		});

		it('throws from completed', () => {
			expect(() => nextState('completed', { kind: 'start' })).toThrow(IllegalSessionTransition);
		});

		it('throws from abandoned', () => {
			expect(() => nextState('abandoned', { kind: 'start' })).toThrow(IllegalSessionTransition);
		});
	});

	describe('pause event', () => {
		it('transitions from active to paused', () => {
			expect(nextState('active', { kind: 'pause', reason: 'manual' })).toBe('paused');
		});

		it('throws from created', () => {
			expect(() => nextState('created', { kind: 'pause', reason: 'manual' })).toThrow(
				IllegalSessionTransition
			);
		});

		it('throws from paused', () => {
			expect(() => nextState('paused', { kind: 'pause', reason: 'manual' })).toThrow(
				IllegalSessionTransition
			);
		});

		it('throws from completed', () => {
			expect(() => nextState('completed', { kind: 'pause', reason: 'manual' })).toThrow(
				IllegalSessionTransition
			);
		});
	});

	describe('resume event', () => {
		it('transitions from paused to active', () => {
			expect(nextState('paused', { kind: 'resume' })).toBe('active');
		});

		it('throws from created', () => {
			expect(() => nextState('created', { kind: 'resume' })).toThrow(IllegalSessionTransition);
		});

		it('throws from active', () => {
			expect(() => nextState('active', { kind: 'resume' })).toThrow(IllegalSessionTransition);
		});

		it('throws from completed', () => {
			expect(() => nextState('completed', { kind: 'resume' })).toThrow(IllegalSessionTransition);
		});
	});

	describe('complete event', () => {
		it('transitions from active to completed', () => {
			expect(nextState('active', { kind: 'complete' })).toBe('completed');
		});

		it('transitions from paused to completed', () => {
			expect(nextState('paused', { kind: 'complete' })).toBe('completed');
		});

		it('throws from created', () => {
			expect(() => nextState('created', { kind: 'complete' })).toThrow(IllegalSessionTransition);
		});

		it('throws from completed', () => {
			expect(() => nextState('completed', { kind: 'complete' })).toThrow(IllegalSessionTransition);
		});

		it('throws from abandoned', () => {
			expect(() => nextState('abandoned', { kind: 'complete' })).toThrow(IllegalSessionTransition);
		});
	});

	describe('abandon event', () => {
		it('transitions from created to abandoned', () => {
			expect(nextState('created', { kind: 'abandon' })).toBe('abandoned');
		});

		it('transitions from active to abandoned', () => {
			expect(nextState('active', { kind: 'abandon' })).toBe('abandoned');
		});

		it('transitions from paused to abandoned', () => {
			expect(nextState('paused', { kind: 'abandon' })).toBe('abandoned');
		});

		it('throws from completed', () => {
			expect(() => nextState('completed', { kind: 'abandon' })).toThrow(IllegalSessionTransition);
		});

		it('throws from abandoned', () => {
			expect(() => nextState('abandoned', { kind: 'abandon' })).toThrow(IllegalSessionTransition);
		});
	});
});

describe('IllegalSessionTransition', () => {
	it('includes from state and event kind in message', () => {
		const err = new IllegalSessionTransition('completed', 'start');
		expect(err.message).toBe('Cannot start from state completed');
		expect(err.name).toBe('IllegalSessionTransition');
	});

	it('is an instance of Error', () => {
		expect(new IllegalSessionTransition('active', 'start')).toBeInstanceOf(Error);
	});
});
