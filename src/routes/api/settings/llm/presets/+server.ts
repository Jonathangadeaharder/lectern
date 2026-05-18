import { defaultPresetId, listPresets } from '$lib/server/services/llm/quick_config';
import { json } from '@sveltejs/kit';

export async function GET() {
	return json({ presets: listPresets(), defaultId: defaultPresetId() });
}
