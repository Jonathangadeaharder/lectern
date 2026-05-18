import type { Howl } from 'howler';
import { DEFAULT_CONFIG, SOUND_FILES, type SoundConfig, type SoundName } from './types';

const STORAGE_KEY = 'lectern.sound';
const MIN_GAP_MS = 200;
const QUESTION_REVEAL_SUPPRESS_MS = 1000;

let howlMap: Record<string, Howl> | null = null;
let howlerLoading = false;
let brokenSounds = new Set<string>();
let sessionSoundDisabled = false;

let lastPlayedAt = 0;
let lastQuestionRevealAt = 0;
let currentHowl: Howl | null = null;

function isBrowser(): boolean {
	return typeof window !== 'undefined';
}

function loadFromStorage(): SoundConfig {
	if (!isBrowser()) return { ...DEFAULT_CONFIG };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...DEFAULT_CONFIG };
		const parsed = JSON.parse(raw) as Partial<SoundConfig>;
		return {
			enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
			volume: Math.max(0, Math.min(1, parsed.volume ?? DEFAULT_CONFIG.volume)),
			perSoundOverrides: parsed.perSoundOverrides ?? {}
		};
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

function saveToStorage(config: SoundConfig): void {
	if (!isBrowser()) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
	} catch {
		// storage full or unavailable
	}
}

export const config: SoundConfig = $state(loadFromStorage());

if (isBrowser()) {
	$effect.root(() => {
		$effect(() => {
			saveToStorage(config);
		});
	});
}

export async function ensureHowler(): Promise<boolean> {
	if (howlMap) return true;
	if (!isBrowser()) return false;
	if (howlerLoading) {
		await new Promise<void>((resolve) => {
			const check = setInterval(() => {
				if (!howlerLoading) {
					clearInterval(check);
					resolve();
				}
			}, 50);
		});
		return howlMap !== null;
	}

	howlerLoading = true;
	try {
		const { Howl } = await import('howler');
		howlMap = {} as Record<string, Howl>;
		for (const name of Object.keys(SOUND_FILES) as SoundName[]) {
			howlMap[name] = new Howl({
				src: [SOUND_FILES[name]],
				volume: config.volume,
				preload: true,
				onloaderror: () => {
					if (!brokenSounds.has(name)) {
						console.warn(`[sound] load error: ${name}`);
						brokenSounds.add(name);
					}
				},
				onplayerror: () => {
					if (!brokenSounds.has(name)) {
						console.warn(`[sound] play error: ${name}`);
						brokenSounds.add(name);
					}
				}
			});
		}

		try {
			const howlerCtx = (window as any).Howler?.ctx;
			if (howlerCtx && howlerCtx.state === 'suspended') {
				await howlerCtx.resume().catch(() => {
					sessionSoundDisabled = true;
				});
			}
		} catch {
			// AudioContext check best-effort
		}

		return true;
	} catch {
		return false;
	} finally {
		howlerLoading = false;
	}
}

export function canPlay(name: SoundName): boolean {
	const now = Date.now();

	if (now - lastPlayedAt < MIN_GAP_MS) return false;

	if (name === 'question_reveal') {
		if (now - lastQuestionRevealAt < QUESTION_REVEAL_SUPPRESS_MS) return false;
	}

	return true;
}

export function markPlayed(name: SoundName): void {
	const now = Date.now();
	lastPlayedAt = now;
	if (name === 'question_reveal') {
		lastQuestionRevealAt = now;
	}
}

export function playSound(name: SoundName): void {
	if (!config.enabled) return;
	if (!howlMap) return;
	if (sessionSoundDisabled) return;
	if (brokenSounds.has(name)) return;

	const override = config.perSoundOverrides[name];
	if (override?.muted) return;

	if (currentHowl) {
		currentHowl.stop();
		currentHowl = null;
	}

	const howl = howlMap[name];
	if (!howl) return;

	const vol = override?.volume !== undefined ? override.volume : config.volume;
	howl.volume(vol);
	howl.play();
	currentHowl = howl;
	markPlayed(name);
}

export function setGlobalVolume(vol: number): void {
	config.volume = Math.max(0, Math.min(1, vol));
	if (!howlMap) return;
	for (const [name, howl] of Object.entries(howlMap)) {
		const override = config.perSoundOverrides[name as SoundName];
		if (override?.volume !== undefined) continue;
		howl.volume(config.volume);
	}
}

export function resetConfig(): void {
	config.enabled = DEFAULT_CONFIG.enabled;
	config.volume = DEFAULT_CONFIG.volume;
	config.perSoundOverrides = {};
}

export function previewSound(name: SoundName): void {
	if (!howlMap) return;
	if (brokenSounds.has(name)) return;
	const override = config.perSoundOverrides[name];
	if (override?.muted) return;
	const howl = howlMap[name];
	if (!howl) return;
	const vol = override?.volume !== undefined ? override.volume : config.volume;
	howl.volume(vol);
	howl.play();
}

export function _resetForTesting(): void {
	howlMap = null;
	howlerLoading = false;
	lastPlayedAt = 0;
	lastQuestionRevealAt = 0;
	currentHowl = null;
	brokenSounds = new Set();
	sessionSoundDisabled = false;
}
