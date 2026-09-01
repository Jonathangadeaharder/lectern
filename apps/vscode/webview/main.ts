import { mount } from 'svelte';
import App from './App.svelte';
import '../../../src/lib/styles/tokens.css';

declare function acquireVsCodeApi(): {
	postMessage(msg: unknown): void;
	setState(state: unknown): void;
	getState<T = unknown>(): T | undefined;
};

const vscode = acquireVsCodeApi();
// Stash on window so deeply-nested components (CodePanel etc.) can postMessage
// without prop-drilling. acquireVsCodeApi() may only be called once per webview;
// any component that needs it reads __lecternVscode instead of calling again.
(window as unknown as { __lecternVscode: typeof vscode }).__lecternVscode = vscode;

function syncTheme(): void {
	document.documentElement.dataset.theme = document.body.classList.contains('vscode-light')
		? 'light'
		: 'dark';
}

syncTheme();
new MutationObserver(syncTheme).observe(document.body, {
	attributes: true,
	attributeFilter: ['class']
});

const target = document.getElementById('app');
if (!target) throw new Error('lectern: #app root missing in webview shell');

const app = mount(App, { target, props: { vscode } });

// Announce readiness so the extension host can post the init payload.
vscode.postMessage({ type: 'ready' });

// Capture uncaught errors so the E2E dump can report render crashes.
(window as unknown as { __e2eErrors?: string[] }).__e2eErrors = [];
window.addEventListener('error', (ev) => {
	const line = `${ev.message} @ ${ev.filename}:${ev.lineno}`;
	((window as unknown as { __e2eErrors: string[] }).__e2eErrors).push(line);
	vscode.postMessage({ type: 'log', msg: `[error] ${line}` });
});
window.addEventListener('unhandledrejection', (ev) => {
	const line = `unhandled: ${String((ev as PromiseRejectionEvent).reason)}`;
	((window as unknown as { __e2eErrors: string[] }).__e2eErrors).push(line);
	vscode.postMessage({ type: 'log', msg: `[error] ${line}` });
});

export {};
