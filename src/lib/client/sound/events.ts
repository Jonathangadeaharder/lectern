import { play } from './index';
import { EVENT_SOUND_MAP, type SoundEventName } from './types';

type Listener = (event: SoundEventName) => void;

const listeners = new Set<Listener>();

export function emit(event: SoundEventName): void {
	const soundName = EVENT_SOUND_MAP[event];
	if (soundName) play(soundName);
	for (const listener of listeners) {
		listener(event);
	}
}

export function subscribe(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
