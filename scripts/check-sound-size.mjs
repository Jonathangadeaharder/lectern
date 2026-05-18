#!/usr/bin/env node

import { readdirSync, statSync } from 'fs';
import { join } from 'path';

const SOUNDS_DIR = join(import.meta.dirname, '..', 'static', 'sounds');
const MAX_TOTAL_KB = 100;

const files = readdirSync(SOUNDS_DIR).filter((f) => f.endsWith('.opus'));
let totalBytes = 0;
const details = [];

for (const f of files) {
	const stats = statSync(join(SOUNDS_DIR, f));
	totalBytes += stats.size;
	details.push({ file: f, sizeKB: (stats.size / 1024).toFixed(1) });
}

const totalKB = totalBytes / 1024;

console.log('Sound file sizes:');
for (const d of details) {
	console.log(`  ${d.file}: ${d.sizeKB} KB`);
}
console.log(`Total: ${totalKB.toFixed(1)} KB (limit: ${MAX_TOTAL_KB} KB)`);

if (totalKB > MAX_TOTAL_KB) {
	console.error(`FAIL: Total sound size ${totalKB.toFixed(1)} KB exceeds ${MAX_TOTAL_KB} KB limit.`);
	process.exit(1);
}

console.log('PASS: Sound sizes within limit.');
