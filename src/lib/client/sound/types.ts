export const SOUND_NAMES = [
	'question_reveal',
	'correct',
	'wrong',
	'chunk_complete',
	'session_complete'
] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

export interface SoundConfig {
	enabled: boolean;
	volume: number;
	perSoundOverrides: Partial<Record<SoundName, { volume?: number; muted?: boolean }>>;
}

export const DEFAULT_CONFIG: SoundConfig = {
	enabled: false,
	volume: 0.4,
	perSoundOverrides: {}
};

export const SOUND_FILES: Record<SoundName, string> = {
	question_reveal: '/sounds/question_reveal.opus',
	correct: '/sounds/correct.opus',
	wrong: '/sounds/wrong.opus',
	chunk_complete: '/sounds/chunk_complete.opus',
	session_complete: '/sounds/session_complete.opus'
};

export type SoundEventName =
	| 'question_pending'
	| 'verdict_pass'
	| 'verdict_fail'
	| 'complete_chunk'
	| 'session_debrief';

export const EVENT_SOUND_MAP: Record<SoundEventName, SoundName> = {
	question_pending: 'question_reveal',
	verdict_pass: 'correct',
	verdict_fail: 'wrong',
	complete_chunk: 'chunk_complete',
	session_debrief: 'session_complete'
};
