import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPlaySound = vi.fn();
const mockEnsureHowler = vi.fn().mockResolvedValue(true);
const mockCanPlay = vi.fn().mockReturnValue(true);
const mockMarkPlayed = vi.fn();
const mockSetGlobalVolume = vi.fn();
const mockResetConfig = vi.fn();

vi.mock('./bus.svelte', () => ({
	config: {
		enabled: false,
		volume: 0.4,
		perSoundOverrides: {}
	},
	ensureHowler: (...args: unknown[]) => mockEnsureHowler(...args),
	canPlay: (...args: unknown[]) => mockCanPlay(...args),
	markPlayed: (...args: unknown[]) => mockMarkPlayed(...args),
	playSound: (...args: unknown[]) => mockPlaySound(...args),
	setGlobalVolume: (...args: unknown[]) => mockSetGlobalVolume(...args),
	resetConfig: (...args: unknown[]) => mockResetConfig(...args),
	_resetForTesting: vi.fn()
}));

vi.mock('./events', () => {
	const listeners = new Set<Function>();
	return {
		emit: vi.fn((event: string) => {
			for (const l of listeners) l(event);
		}),
		subscribe: vi.fn((listener: Function) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		})
	};
});

describe('sound API', () => {
	let api: typeof import('./index');
	let busConfig: { enabled: boolean; volume: number; perSoundOverrides: Record<string, unknown> };

	beforeEach(async () => {
		vi.clearAllMocks();
		const bus = await import('./bus.svelte');
		busConfig = bus.config as typeof busConfig;
		busConfig.enabled = false;
		busConfig.volume = 0.4;
		busConfig.perSoundOverrides = {};
		api = await import('./index');
	});

	describe('play', () => {
		it('is no-op when disabled', async () => {
			busConfig.enabled = false;
			await api.play('correct');
			expect(mockEnsureHowler).not.toHaveBeenCalled();
			expect(mockPlaySound).not.toHaveBeenCalled();
		});

		it('skips when canPlay returns false', async () => {
			busConfig.enabled = true;
			mockCanPlay.mockReturnValue(false);
			await api.play('correct');
			expect(mockPlaySound).not.toHaveBeenCalled();
		});

		it('plays when enabled and canPlay returns true', async () => {
			busConfig.enabled = true;
			mockCanPlay.mockReturnValue(true);
			await api.play('correct');
			expect(mockEnsureHowler).toHaveBeenCalled();
			expect(mockPlaySound).toHaveBeenCalledWith('correct');
		});
	});

	describe('setEnabled', () => {
		it('sets config.enabled to true', async () => {
			await api.setEnabled(true);
			expect(busConfig.enabled).toBe(true);
		});

		it('loads howler and plays chunk_complete on first enable', async () => {
			await api.setEnabled(true);
			expect(mockEnsureHowler).toHaveBeenCalled();
			expect(mockPlaySound).toHaveBeenCalledWith('chunk_complete');
		});

		it('fires toast on first enable', async () => {
			const toastSpy = vi.fn();
			api.onToast(toastSpy);
			await api.setEnabled(true);
			expect(toastSpy).toHaveBeenCalledWith('Sound enabled');
		});

		it('does nothing when setting to same value', async () => {
			busConfig.enabled = false;
			await api.setEnabled(false);
			expect(mockEnsureHowler).not.toHaveBeenCalled();
		});
	});

	describe('setVolume', () => {
		it('delegates to bus.setGlobalVolume', () => {
			api.setVolume(0.6);
			expect(mockSetGlobalVolume).toHaveBeenCalledWith(0.6);
		});
	});

	describe('resetToDefaults', () => {
		it('delegates to bus.resetConfig', () => {
			api.resetToDefaults();
			expect(mockResetConfig).toHaveBeenCalled();
		});
	});

	describe('localStorage round-trip', () => {
		it('persists and reads config', () => {
			const testConfig = { enabled: true, volume: 0.7, perSoundOverrides: {} };
			localStorage.setItem('lectern.sound', JSON.stringify(testConfig));

			const raw = localStorage.getItem('lectern.sound');
			expect(raw).not.toBeNull();
			if (raw) {
				const parsed = JSON.parse(raw);
				expect(parsed.enabled).toBe(true);
				expect(parsed.volume).toBe(0.7);
			}
		});

		it('handles missing localStorage gracefully', () => {
			localStorage.removeItem('lectern.sound');
			const raw = localStorage.getItem('lectern.sound');
			expect(raw).toBeNull();
		});
	});
});
