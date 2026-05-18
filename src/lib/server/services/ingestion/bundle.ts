import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import * as tar from 'tar';
import { resolveDataDir } from '../../config/paths';
import type { BundleManifest } from './types';
import type { ParsedPrUrl } from './url';
import { repoSlug } from './url';

export class UnsafeBundlePathError extends Error {
	constructor(path: string) {
		super(`Refusing unsafe bundle path: ${path}`);
		this.name = 'UnsafeBundlePathError';
	}
}

export function sanitizeBundlePath(p: string): string {
	if (!p) throw new UnsafeBundlePathError('<empty>');
	if (p.includes('\0')) throw new UnsafeBundlePathError(p);
	if (isAbsolute(p)) throw new UnsafeBundlePathError(p);
	const parts = normalize(p)
		.split(sep)
		.filter((s) => s !== '.');
	if (parts.includes('..')) throw new UnsafeBundlePathError(p);
	const joined = parts.join('/');
	if (joined.length > 255) throw new UnsafeBundlePathError(p);
	return joined;
}

export interface BundleInput {
	parsed: ParsedPrUrl;
	manifest: BundleManifest;
	metadataJson: string;
	commitsJson: string;
	diffPatch: string;
	files: Array<{ side: 'base' | 'head'; path: string; content: Buffer }>;
}

export async function bundlePath(parsed: ParsedPrUrl): Promise<string> {
	const root = resolveDataDir().bundles;
	const dir = join(root, repoSlug(parsed), String(parsed.prNumber));
	await mkdir(dir, { recursive: true, mode: 0o700 });
	return join(dir, 'bundle.lectern');
}

export async function writeBundle(
	input: BundleInput
): Promise<{ filePath: string; sizeBytes: number }> {
	const filePath = await bundlePath(input.parsed);
	const stagingDir = `${filePath}.staging`;
	await rm(stagingDir, { recursive: true, force: true });
	await mkdir(stagingDir, { recursive: true, mode: 0o700 });

	const entries: Array<{ path: string; content: Buffer }> = [
		{
			path: 'manifest.json',
			content: Buffer.from(JSON.stringify(input.manifest, null, 2), 'utf8')
		},
		{ path: 'metadata.json', content: Buffer.from(input.metadataJson, 'utf8') },
		{ path: 'commits.json', content: Buffer.from(input.commitsJson, 'utf8') },
		{ path: 'diff.patch', content: Buffer.from(input.diffPatch, 'utf8') }
	];
	for (const f of input.files) {
		const safe = sanitizeBundlePath(f.path);
		entries.push({ path: `files/${f.side}/${safe}`, content: f.content });
	}

	for (const e of entries) {
		const target = join(stagingDir, e.path);
		await mkdir(dirname(target), { recursive: true, mode: 0o700 });
		await writeFile(target, e.content, { mode: 0o600 });
	}

	const sortedPaths = entries.map((e) => e.path).sort();

	await pipeline(
		tar.c({ gzip: true, cwd: stagingDir, portable: true }, sortedPaths),
		createWriteStream(filePath)
	);

	await rm(stagingDir, { recursive: true, force: true });

	const s = await stat(filePath);
	return { filePath, sizeBytes: s.size };
}

/** Read a single entry from a `.lectern` bundle into memory. */
export async function readBundleEntry(
	bundleFile: string,
	entryPath: string
): Promise<Buffer | null> {
	let buf: Buffer | null = null;
	await tar.list({
		file: bundleFile,
		filter: (path) => path === entryPath,
		onentry: (entry) => {
			const chunks: Buffer[] = [];
			entry.on('data', (chunk: Buffer) => {
				chunks.push(chunk);
			});
			entry.on('end', () => {
				buf = Buffer.concat(chunks);
			});
		}
	});
	return buf;
}

export async function readBundleManifest(bundleFile: string): Promise<BundleManifest | null> {
	const buf = await readBundleEntry(bundleFile, 'manifest.json');
	if (!buf) return null;
	try {
		return JSON.parse(buf.toString('utf8')) as BundleManifest;
	} catch {
		return null;
	}
}

export async function readBundleDiff(bundleFile: string): Promise<string | null> {
	const buf = await readBundleEntry(bundleFile, 'diff.patch');
	return buf ? buf.toString('utf8') : null;
}
