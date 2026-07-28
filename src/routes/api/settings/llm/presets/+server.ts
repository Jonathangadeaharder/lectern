import { json } from '@sveltejs/kit';
import { defaultPresetId, listPresets } from '$lib/server/services/llm/quick_config';

export async function GET() {
	return json({ presets: listPresets(), defaultId: defaultPresetId() });
}
