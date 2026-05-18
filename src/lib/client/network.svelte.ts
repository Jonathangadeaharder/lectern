import { browser } from '$app/environment';

let online = $state(true);
let _interval: ReturnType<typeof setInterval> | null = null;

function check(): void {
	if (!browser) return;
	online = navigator.onLine;
}

async function ping(): Promise<void> {
	if (!browser) return;
	try {
		const res = await fetch('/api/health', { cache: 'no-store' });
		online = res.ok;
	} catch {
		online = false;
	}
}

export function getOnline(): boolean {
	return online;
}

export function startNetworkMonitor(intervalMs = 30_000): void {
	if (!browser || _interval) return;
	check();
	window.addEventListener('online', () => {
		online = true;
	});
	window.addEventListener('offline', () => {
		online = false;
	});
	_interval = setInterval(ping, intervalMs);
	ping();
}

export function stopNetworkMonitor(): void {
	if (_interval) {
		clearInterval(_interval);
		_interval = null;
	}
}
