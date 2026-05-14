const ENV_REF = /^\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/;

export function resolveSecret(value: string): string {
	const m = ENV_REF.exec(value.trim());
	if (!m) return value;
	const name = m[1];
	const fromEnv = process.env[name as keyof typeof process.env];
	if (!fromEnv) {
		throw new Error(`Environment variable ${name} referenced by {env:${name}} is not set.`);
	}
	return fromEnv;
}
