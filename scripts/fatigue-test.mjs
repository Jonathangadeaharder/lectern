#!/usr/bin/env node

import { createReadStream, readdirSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, join } from 'node:path';
import readline from 'node:readline';

const SOUNDS_DIR = join(import.meta.dirname, '..', 'static', 'sounds');
const PORT = 3456;
const DURATION_MIN = 30;
const MIN_INTERVAL_S = 5;
const MAX_INTERVAL_S = 15;

const soundName = process.argv[2];
if (!soundName) {
	const files = readdirSync(SOUNDS_DIR).filter((f) => f.endsWith('.opus'));
	console.error('Usage: node scripts/fatigue-test.mjs <sound-name>');
	console.error('Available sounds:', files.join(', '));
	process.exit(1);
}

const soundFile = `${soundName}.opus`;
const soundPath = join(SOUNDS_DIR, soundFile);
try {
	await stat(soundPath);
} catch {
	console.error(`Sound file not found: ${soundPath}`);
	process.exit(1);
}

const html = `<!DOCTYPE html>
<html>
<head><title>Fatigue Test: ${soundName}</title></head>
<body>
<h1>Fatigue Test: ${soundName}</h1>
<p>Playing at random intervals for ${DURATION_MIN} minutes. Keep this tab in the foreground.</p>
<p id="status">Starting...</p>
<p id="count">Plays: 0</p>
<script src="https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.4/howler.min.js"></script>
<script>
const sound = new Howl({ src: ['/sounds/${soundFile}'], volume: 0.4 });
let count = 0;
const log = [];
function scheduleNext() {
  const delay = ${MIN_INTERVAL_S}000 + Math.random() * (${MAX_INTERVAL_S - MIN_INTERVAL_S}000);
  setTimeout(() => {
    sound.play();
    const ts = new Date().toISOString();
    count++;
    log.push(ts);
    document.getElementById('count').textContent = 'Plays: ' + count;
    fetch('/log', { method: 'POST', body: JSON.stringify({ ts, count }) });
    scheduleNext();
  }, delay);
}
scheduleNext();
const endMs = ${DURATION_MIN} * 60 * 1000;
setTimeout(() => {
  document.getElementById('status').textContent = 'Test complete. Return to terminal.';
  fetch('/done', { method: 'POST', body: JSON.stringify(log) });
}, endMs);
</script>
</body>
</html>`;

const playLog = [];
let _testDone = false;
let doneResolve;
const donePromise = new Promise((r) => {
	doneResolve = r;
});

const server = createServer(async (req, res) => {
	if (req.url === '/' && req.method === 'GET') {
		res.writeHead(200, { 'Content-Type': 'text/html' });
		res.end(html);
	} else if (req.url?.startsWith('/sounds/') && req.method === 'GET') {
		const filePath = join(SOUNDS_DIR, basename(req.url));
		const s = createReadStream(filePath);
		res.writeHead(200, { 'Content-Type': 'audio/opus' });
		s.pipe(res);
	} else if (req.url === '/log' && req.method === 'POST') {
		let body = '';
		req.on('data', (c) => (body += c));
		req.on('end', () => {
			try {
				playLog.push(JSON.parse(body));
			} catch {}
			res.writeHead(204);
			res.end();
		});
	} else if (req.url === '/done' && req.method === 'POST') {
		let body = '';
		req.on('data', (c) => (body += c));
		req.on('end', () => {
			_testDone = true;
			try {
				const timestamps = JSON.parse(body);
				playLog.length = 0;
				playLog.push(...timestamps.map((ts) => ({ ts })));
			} catch {}
			res.writeHead(204);
			res.end();
			doneResolve();
		});
	} else {
		res.writeHead(404);
		res.end();
	}
});

server.listen(PORT, () => {
	console.log(`Fatigue test server: http://localhost:${PORT}`);
	console.log(`Sound: ${soundName}`);
	console.log(`Duration: ${DURATION_MIN} min, interval: ${MIN_INTERVAL_S}-${MAX_INTERVAL_S}s`);
	console.log('Open the URL in a browser and keep the tab in the foreground.\n');
});

process.on('SIGINT', () => {
	console.log('\nInterrupted.');
	cleanup();
});

async function cleanup() {
	server.close();
	if (playLog.length === 0) {
		console.log('No play events recorded.');
		process.exit(0);
	}
	console.log(`\nTest complete. ${playLog.length} plays recorded.`);
	console.log('Rate the sound fatigue:');
	console.log('  1 = Tolerable');
	console.log('  2 = Borderline');
	console.log('  3 = Intolerable');

	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	rl.question('Your rating (1-3): ', (answer) => {
		const rating = answer.trim();
		const label = { 1: 'tolerable', 2: 'borderline', 3: 'intolerable' }[rating] ?? 'unknown';
		const date = new Date().toISOString().split('T')[0];
		const result = {
			sound: soundName,
			date,
			durationMin: DURATION_MIN,
			intervalRange: [MIN_INTERVAL_S, MAX_INTERVAL_S],
			rating: label,
			playCount: playLog.length,
			timestamps: playLog.map((e) => e.ts)
		};
		const outDir = join(import.meta.dirname, '..', 'tests', 'fatigue', 'results');
		const outFile = join(outDir, `${soundName}-${date}.json`);
		import('node:fs').then((fs) => {
			fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
			console.log(`Result saved: ${outFile}`);
			rl.close();
			process.exit(0);
		});
	});
}

donePromise.then(() => {
	setTimeout(cleanup, 2000);
});
