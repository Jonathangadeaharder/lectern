import esbuild from 'esbuild';
import sveltePlugin from 'esbuild-svelte';
import { sveltePreprocess } from 'svelte-preprocess';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Resolve $lib/* to the workspace-root src/lib so the webview can reuse
// the Svelte components in src/lib/client/mr/ and shared logic in
// src/lib/shared/mr/. Absolute path so it works regardless of cwd.
const workspaceRoot = resolve(process.cwd(), '..', '..');
const libRoot = join(workspaceRoot, 'src', 'lib');

const prod = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// Copy codicon font + stylesheet into resources/ so the webview can serve them
// via asWebviewUri without leaking node_modules into the VSIX surface.
const codiconDist = join('node_modules', '@vscode', 'codicons', 'dist');
mkdirSync('resources', { recursive: true });
copyFileSync(join(codiconDist, 'codicon.ttf'), join('resources', 'codicon.ttf'));
copyFileSync(join(codiconDist, 'codicon.css'), join('resources', 'codicon.css'));

const shared = {
	bundle: true,
	minify: prod,
	sourcemap: !prod,
	logLevel: 'info'
};

const host = {
	...shared,
	entryPoints: ['src/extension.ts'],
	outfile: 'out/extension.js',
	platform: 'node',
	format: 'cjs',
	target: 'node20',
	external: ['vscode']
};

/**
 * Alias plugin: rewrite `$lib/x` and `$lib/x.svelte` imports to their absolute
 * path under src/lib. Runs before esbuild's default resolver so it wins over
 * node_modules resolution. We must handle .svelte explicitly because
 * esbuild-svelte only fires for files it can already resolve. Node's ESM
 * resolver does not append extensions when the specifier lacks one, so try
 * each known extension in turn.
 */
import { existsSync } from 'node:fs';
const EXT_TRIES = ['', '.ts', '.svelte', '.js', '.mjs', '/index.ts', '/index.js'];
const libAliasPlugin = {
	name: 'lib-alias',
	setup(build) {
		build.onResolve({ filter: /^\$lib(\/|$)/ }, (args) => {
			const rel = args.path.replace(/^\$lib/, '');
			const base = join(libRoot, rel);
			for (const ext of EXT_TRIES) {
				const candidate = base + ext;
				if (existsSync(candidate)) return { path: candidate };
			}
			// Fall through to default resolver; will surface as a real error.
			return null;
		});
	}
};

const webview = {
	...shared,
	entryPoints: ['webview/main.ts'],
	outdir: 'out/webview',
	platform: 'browser',
	format: 'esm',
	target: 'es2022',
	splitting: true,
	loader: { '.css': 'css' },
	plugins: [
		libAliasPlugin,
		sveltePlugin({
			// Only strip TS types from <script lang="ts"> — let esbuild do the
			// rest. Skips svelte-preprocess's tsconfig discovery which otherwise
			// picks up the host-side tsconfig.json (rootDir: src) and rejects
			// files under webview/.
			preprocess: sveltePreprocess({ typescript: { tsconfigFile: 'webview/tsconfig.json' } }),
			compilerOptions: { runes: true }
		})
	]
};

if (watch) {
	const ctxHost = await esbuild.context(host);
	const ctxWeb = await esbuild.context(webview);
	await Promise.all([ctxHost.watch(), ctxWeb.watch()]);
	console.log('[esbuild] watching…');
} else {
	await esbuild.build(host);
	await esbuild.build(webview);
}
