import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPlay = vi.fn();

vi.mock('./index', () => ({
	play: (...args: unknown[]) => mockPlay(...args)
}));

describe('sound events', () => {
	let events: typeof import('./events');

	beforeEach(async () => {
		vi.clearAllMocks();
		events = await import('./events');
	});

	it('emit plays mapped sound', () => {
		events.emit('verdict_pass');
		expect(mockPlay).toHaveBeenCalledWith('correct');
	});

	it('emit plays question_reveal for question_pending', () => {
		events.emit('question_pending');
		expect(mockPlay).toHaveBeenCalledWith('question_reveal');
	});

	it('emit plays wrong for verdict_fail', () => {
		events.emit('verdict_fail');
		expect(mockPlay).toHaveBeenCalledWith('wrong');
	});

	it('emit plays chunk_complete for complete_chunk', () => {
		events.emit('complete_chunk');
		expect(mockPlay).toHaveBeenCalledWith('chunk_complete');
	});

	it('emit plays session_complete for session_debrief', () => {
		events.emit('session_debrief');
		expect(mockPlay).toHaveBeenCalledWith('session_complete');
	});

	it('subscribe receives events', () => {
		const listener = vi.fn();
		const unsub = events.subscribe(listener);
		events.emit('verdict_pass');
		expect(listener).toHaveBeenCalledWith('verdict_pass');
		unsub();
	});

	it('unsubscribe stops receiving events', () => {
		const listener = vi.fn();
		const unsub = events.subscribe(listener);
		unsub();
		events.emit('verdict_pass');
		expect(listener).not.toHaveBeenCalled();
	});
});
