#!/usr/bin/env node

/**
 * Sound encoding pipeline for Lectern.
 *
 * Generates minimal valid Opus files for the sound design system.
 *
 * Prerequisites:
 *   - ffmpeg with libopus encoder
 *
 * Encoding parameters:
 *   - Sample rate: 48000 Hz (Opus native)
 *   - Channels: mono
 *   - Bitrate: 6 kbps (minimal)
 *   - Duration: 0.3s per file
 *   - Source: null audio (silence) via lavfi anullsrc
 *
 * Production sounds should replace these placeholders with
 * properly designed audio. Recommended encoding for production:
 *   ffmpeg -i source.wav -c:a libopus -b:a 24k -vbr on \
 *          -compression_level 10 -frame_duration 60 \
 *          -apply_phase_inv 0 output.opus
 *
 * Usage:
 *   node scripts/encode-sounds.mjs
 */

import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

const SOUNDS_DIR = join(import.meta.dirname, '..', 'static', 'sounds');
const SOUNDS = ['question_reveal', 'correct', 'wrong', 'chunk_complete', 'session_complete'];

const hasFfmpeg = (() => {
	try {
		execSync('ffmpeg -version', { stdio: 'pipe' });
		return true;
	} catch {
		return false;
	}
})();

if (!hasFfmpeg) {
	console.error('ffmpeg not found. Install ffmpeg with libopus support to encode sounds.');
	console.error('  brew install ffmpeg   (macOS)');
	console.error('  apt install ffmpeg    (Linux)');
	process.exit(1);
}

for (const name of SOUNDS) {
	const outPath = join(SOUNDS_DIR, `${name}.opus`);
	const cmd = `ffmpeg -f lavfi -i anullsrc=r=48000:cl=mono -t 0.3 -c:a libopus -b:a 6k -y "${outPath}"`;
	try {
		execSync(cmd, { stdio: 'pipe' });
		console.log(`Generated: ${name}.opus`);
	} catch (e) {
		console.error(`Failed: ${name}.opus`, e.message);
	}
}

console.log('\nDone. Replace placeholder sounds with production audio before release.');
