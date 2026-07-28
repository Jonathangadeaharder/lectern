import {
	previewSound as busPreviewSound,
	resetConfig as busResetConfig,
	setGlobalVolume as busSetGlobalVolume,
	canPlay,
	config,
	ensureHowler,
	playSound
} from './bus.svelte';
import type { SoundName } from './types';

export type { SoundConfig, SoundEventName, SoundName } from './types';
export { EVENT_SOUND_MAP, SOUND_NAMES } from './types';

let toastCallback: ((message: string) => void) | null = null;

export function onToast(cb: (message: string) => void): void {
	toastCallback = cb;
}

function showToast(message: string): void {
	if (toastCallback) toastCallback(message);
}

export { config };

export async function play(name: SoundName): Promise<void> {
	if (!config.enabled) return;
	if (!canPlay(name)) return;
	const ready = await ensureHowler();
	if (!ready) return;
	playSound(name);
}

export async function setEnabled(enabled: boolean): Promise<void> {
	if (enabled === config.enabled) return;
	config.enabled = enabled;

	if (enabled) {
		const ready = await ensureHowler();
		if (ready) {
			playSound('chunk_complete');
			showToast('Sound enabled');
		}
	}
}

export function setVolume(vol: number): void {
	busSetGlobalVolume(vol);
}

export function previewSound(name: SoundName): void {
	busPreviewSound(name);
}

export function resetToDefaults(): void {
	busResetConfig();
}

export function getEnabled(): boolean {
	return config.enabled;
}
