import esbuild from 'esbuild';
import sveltePlugin from 'esbuild-svelte';
import { sveltePreprocess } from 'svelte-preprocess';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

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

const webview = {
	...shared,
	entryPoints: ['webview/main.ts'],
	outdir: 'out/webview',
	platform: 'browser',
	format: 'esm',
	target: 'es2022',
	splitting: true,
	plugins: [
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
