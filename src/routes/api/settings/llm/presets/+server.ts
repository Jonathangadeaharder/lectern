import { json } from '@sveltejs/kit';
import { PROVIDER_PRESETS } from '$lib/server/services/llm/quick_config';

export async function GET() {
	return json({ presets: PROVIDER_PRESETS });
}
