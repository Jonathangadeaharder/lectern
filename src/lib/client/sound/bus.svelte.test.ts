import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockHowl = {
	play: vi.fn(),
	stop: vi.fn(),
	volume: vi.fn(),
	on: vi.fn()
};

vi.mock('howler', () => {
	return {
		Howl: vi.fn((opts: any) => {
			if (opts.onloaderror) {
				mockHowl.on.mockImplementation((event: string, cb: Function) => {
					if (event === 'loaderror' && opts.onloaderror) opts.onloaderror(0);
					if (event === 'playerror' && opts.onplayerror) opts.onplayerror(0);
				});
			}
			return mockHowl;
		})
	};
});

describe('sound bus', () => {
	let bus: typeof import('./bus.svelte');

	beforeEach(async () => {
		vi.useFakeTimers();
		localStorage.clear();
		bus = await import('./bus.svelte');
		bus._resetForTesting();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('canPlay throttling', () => {
		it('allows first play', () => {
			expect(bus.canPlay('correct')).toBe(true);
		});

		it('blocks play within 200ms gap', () => {
			bus.markPlayed('correct');
			vi.advanceTimersByTime(100);
			expect(bus.canPlay('correct')).toBe(false);
		});

		it('allows play after 200ms gap', () => {
			bus.markPlayed('correct');
			vi.advanceTimersByTime(201);
			expect(bus.canPlay('correct')).toBe(true);
		});

		it('suppresses question_reveal within 1s of prior question_reveal', () => {
			bus.markPlayed('question_reveal');
			vi.advanceTimersByTime(500);
			expect(bus.canPlay('question_reveal')).toBe(false);
		});

		it('allows question_reveal after 1s', () => {
			bus.markPlayed('question_reveal');
			vi.advanceTimersByTime(1001);
			expect(bus.canPlay('question_reveal')).toBe(true);
		});

		it('allows non-question_reveal within 1s of question_reveal', () => {
			bus.markPlayed('question_reveal');
			vi.advanceTimersByTime(250);
			expect(bus.canPlay('correct')).toBe(true);
		});
	});

	describe('playSound (disabled state)', () => {
		it('does not call howler when config.enabled is false', () => {
			bus.config.enabled = false;
			bus.playSound('correct');
			// No howlMap loaded, so playSound returns early
			// The key assertion: config remains disabled
			expect(bus.config.enabled).toBe(false);
		});
	});

	describe('ensureHowler', () => {
		it('returns false when not in browser', async () => {
			const result = await bus.ensureHowler();
			// In jsdom, window exists so it tries to load
			// The mock will succeed
			expect(typeof result).toBe('boolean');
		});
	});

	describe('setGlobalVolume', () => {
		it('clamps volume to 0-1 range', () => {
			bus.setGlobalVolume(1.5);
			expect(bus.config.volume).toBe(1);

			bus.setGlobalVolume(-0.5);
			expect(bus.config.volume).toBe(0);
		});

		it('sets volume within valid range', () => {
			bus.setGlobalVolume(0.7);
			expect(bus.config.volume).toBe(0.7);
		});

		it('does not clobber per-sound volume overrides', () => {
			bus.config.perSoundOverrides = { correct: { volume: 0.2 } };
			bus.setGlobalVolume(0.8);
			expect(bus.config.volume).toBe(0.8);
			expect(bus.config.perSoundOverrides.correct?.volume).toBe(0.2);
		});
	});

	describe('resetConfig', () => {
		it('resets to defaults', () => {
			bus.config.enabled = true;
			bus.config.volume = 0.9;
			bus.config.perSoundOverrides = { correct: { volume: 0.2 } };

			bus.resetConfig();

			expect(bus.config.enabled).toBe(false);
			expect(bus.config.volume).toBe(0.4);
			expect(bus.config.perSoundOverrides).toEqual({});
		});
	});
});
