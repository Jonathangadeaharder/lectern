import { json } from '@sveltejs/kit';
import { dbPath, resolveDataDir } from '$lib/server/config/paths';
import { getQuickConfig } from '$lib/server/services/llm/quick_config';

export async function GET() {
	const cfg = await getQuickConfig();
	return json({
		ok: true,
		version: '0.1.0',
		dataDir: resolveDataDir().root,
		dbPath: dbPath(),
		hasLlmConfig: Boolean(cfg),
		node: process.version,
		platform: process.platform
	});
}
