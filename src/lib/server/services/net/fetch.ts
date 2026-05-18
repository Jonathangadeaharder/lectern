/** Egress-allowlisted fetch wrapper. Used by all outbound HTTP. */

const STATIC_ALLOW = new Set<string>([
	'api.anthropic.com',
	'api.openai.com',
	'generativelanguage.googleapis.com',
	'openrouter.ai',
	'api.github.com',
	'gitlab.com',
	'localhost',
	'127.0.0.1'
]);

const dynamicAllow = new Set<string>();

export class EgressViolation extends Error {
	constructor(host: string) {
		super(`Egress to ${host} not permitted`);
		this.name = 'EgressViolation';
	}
}

export function permitHost(host: string): void {
	dynamicAllow.add(host.toLowerCase());
}

export function isHostAllowed(host: string): boolean {
	const h = host.toLowerCase();
	if (STATIC_ALLOW.has(h)) return true;
	if (dynamicAllow.has(h)) return true;

	const envAllow = (process.env.LECTERN_EGRESS_ALLOW ?? '')
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	if (envAllow.includes(h)) return true;

	return false;
}

export function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const url =
		typeof input === 'string'
			? new URL(input)
			: input instanceof URL
				? input
				: new URL(input.url);

	if (!isHostAllowed(url.hostname)) {
		throw new EgressViolation(url.hostname);
	}
	return fetch(input, init);
}
