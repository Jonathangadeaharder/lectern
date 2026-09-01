/**
 * Client-side wrappers around /api/mr/[iid]/** endpoints. Each caller supplies
 * the project path from the current MR summary; the server owns tokens.
 *
 * When mode==='fixture', the endpoints echo success without hitting gitlab so
 * the reviewer flow can be exercised end-to-end in tests and offline dev.
 */

export interface ActionCtx {
	iid: number;
	projectPath: string;
	host?: string;
	fixture?: boolean;
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; mode?: string; [k: string]: unknown }> {
	const res = await fetch(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	if (!res.ok) {
		const msg = typeof json.message === 'string' ? json.message : `HTTP ${res.status}`;
		throw new Error(msg);
	}
	return json as { ok: boolean; mode?: string };
}

async function put(path: string, body: unknown): Promise<Record<string, unknown>> {
	const res = await fetch(path, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	if (!res.ok) {
		const msg = typeof json.message === 'string' ? json.message : `HTTP ${res.status}`;
		throw new Error(msg);
	}
	return json;
}

export function approve(ctx: ActionCtx) {
	return post(`/api/mr/${ctx.iid}/action`, {
		kind: 'approve',
		host: ctx.host,
		projectPath: ctx.projectPath,
		fixture: ctx.fixture
	});
}

export function unapprove(ctx: ActionCtx) {
	return post(`/api/mr/${ctx.iid}/action`, {
		kind: 'unapprove',
		host: ctx.host,
		projectPath: ctx.projectPath,
		fixture: ctx.fixture
	});
}

export function generalComment(ctx: ActionCtx, body: string) {
	return post(`/api/mr/${ctx.iid}/action`, {
		kind: 'comment',
		host: ctx.host,
		projectPath: ctx.projectPath,
		body,
		fixture: ctx.fixture
	});
}

export interface DiffPositionInput {
	base_sha: string;
	head_sha: string;
	start_sha: string;
	position_type: 'text';
	new_path?: string;
	old_path?: string;
	new_line?: number;
	old_line?: number;
}

export function postDiscussion(ctx: ActionCtx, body: string, position: DiffPositionInput) {
	return post(`/api/mr/${ctx.iid}/discussions`, {
		host: ctx.host,
		projectPath: ctx.projectPath,
		body,
		position,
		fixture: ctx.fixture
	});
}

export function replyDiscussion(ctx: ActionCtx, disc: string, body: string) {
	return post(`/api/mr/${ctx.iid}/discussions/${encodeURIComponent(disc)}/notes`, {
		host: ctx.host,
		projectPath: ctx.projectPath,
		body,
		fixture: ctx.fixture
	});
}

export function resolveDisc(ctx: ActionCtx, disc: string, resolved: boolean) {
	return put(`/api/mr/${ctx.iid}/discussions/${encodeURIComponent(disc)}/resolve`, {
		host: ctx.host,
		projectPath: ctx.projectPath,
		resolved,
		fixture: ctx.fixture
	});
}

export async function fetchVersionFiles(
	ctx: ActionCtx,
	versionId: number,
	fixtureSlug?: string
): Promise<unknown[]> {
	const params = new URLSearchParams();
	if (ctx.fixture && fixtureSlug) params.set('fixture', fixtureSlug);
	if (!ctx.fixture) {
		if (ctx.host) params.set('host', ctx.host);
		params.set('project', ctx.projectPath);
	}
	const qs = params.toString();
	const url = `/api/mr/${ctx.iid}/version/${versionId}${qs ? `?${qs}` : ''}`;
	const res = await fetch(url);
	if (!res.ok) {
		const j = (await res.json().catch(() => ({}))) as { message?: string };
		throw new Error(j.message ?? `HTTP ${res.status}`);
	}
	const j = (await res.json()) as { files: unknown[] };
	return j.files;
}
