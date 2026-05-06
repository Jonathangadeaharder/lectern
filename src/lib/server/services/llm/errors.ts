/** Typed LLM errors. Routes map these to HTTP status codes. */

export class LlmNotConfiguredError extends Error {
	readonly httpStatus = 412;
	constructor() {
		super('LLM not configured. Visit /onboarding to set up an endpoint and model.');
		this.name = 'LlmNotConfiguredError';
	}
}

export class LlmAuthError extends Error {
	readonly httpStatus = 401;
	constructor(message = 'Provider rejected the API token.') {
		super(message);
		this.name = 'LlmAuthError';
	}
}

export class LlmRateLimitError extends Error {
	readonly httpStatus = 429;
	constructor(
		message = 'Provider rate limit exceeded.',
		public readonly retryAfterSec?: number
	) {
		super(message);
		this.name = 'LlmRateLimitError';
	}
}

export class LlmSchemaError extends Error {
	readonly httpStatus = 502;
	constructor(message = 'Provider returned malformed structured output.') {
		super(message);
		this.name = 'LlmSchemaError';
	}
}

export class LlmAbortError extends Error {
	readonly httpStatus = 499;
	constructor() {
		super('LLM request aborted.');
		this.name = 'LlmAbortError';
	}
}

export class LlmProviderError extends Error {
	readonly httpStatus = 502;
	constructor(
		message: string,
		public readonly upstreamStatus?: number
	) {
		super(message);
		this.name = 'LlmProviderError';
	}
}

export class CircuitOpenError extends Error {
	readonly httpStatus = 503;
	constructor(public readonly opensAt: number) {
		super('Circuit breaker is open; refusing LLM calls.');
		this.name = 'CircuitOpenError';
	}
}

export class BudgetExceededError extends Error {
	readonly httpStatus = 429;
	constructor(
		public readonly used: number,
		public readonly limit: number
	) {
		super(`Token budget exceeded: ${used}/${limit}`);
		this.name = 'BudgetExceededError';
	}
}
