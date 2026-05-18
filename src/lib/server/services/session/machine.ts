export type SessionState = 'created' | 'active' | 'paused' | 'completed' | 'abandoned';

export type SessionEvent =
	| { kind: 'start' }
	| { kind: 'pause'; reason: string }
	| { kind: 'resume' }
	| { kind: 'complete' }
	| { kind: 'abandon' };

export class IllegalSessionTransition extends Error {
	constructor(from: SessionState, event: SessionEvent['kind']) {
		super(`Cannot ${event} from state ${from}`);
		this.name = 'IllegalSessionTransition';
	}
}

export function nextState(from: SessionState, event: SessionEvent): SessionState {
	switch (event.kind) {
		case 'start':
			if (from === 'created') return 'active';
			break;
		case 'pause':
			if (from === 'active') return 'paused';
			break;
		case 'resume':
			if (from === 'paused') return 'active';
			break;
		case 'complete':
			if (from === 'active' || from === 'paused') return 'completed';
			break;
		case 'abandon':
			if (from === 'created' || from === 'active' || from === 'paused') return 'abandoned';
			break;
	}
	throw new IllegalSessionTransition(from, event.kind);
}
