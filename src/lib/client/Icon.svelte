<script lang="ts" module>
	// Icon name union is a superset of every callsite. Each name maps to a
	// codicon glyph in CODICON. Renames are 1-line additions here.
	export type IconName =
		| 'home'
		| 'book'
		| 'repo'
		| 'chart'
		| 'plus'
		| 'search'
		| 'settings'
		| 'flame'
		| 'chevron-right'
		| 'command'
		| 'arrow-right'
		| 'arrow-up'
		| 'arrow-down'
		| 'sun-moon'
		| 'pull-request'
		| 'zap'
		| 'brain'
		| 'layers'
		| 'download'
		| 'x'
		| 'send'
		| 'eye'
		| 'refresh'
		| 'check-all'
		| 'list-selection'
		| 'clear-all'
		| 'discard'
		| 'comment-add'
		| 'check'
		| 'layout-sidebar-left'
		| 'layout-sidebar-left-off'
		| 'layout-sidebar-right'
		| 'layout-sidebar-right-off';

	const CODICON: Record<IconName, string> = {
		home: 'home',
		book: 'book',
		repo: 'repo',
		chart: 'graph',
		plus: 'add',
		search: 'search',
		settings: 'settings-gear',
		flame: 'flame',
		'chevron-right': 'chevron-right',
		command: 'symbol-keyword',
		'arrow-right': 'arrow-right',
		'arrow-up': 'arrow-up',
		'arrow-down': 'arrow-down',
		'sun-moon': 'color-mode',
		'pull-request': 'git-pull-request',
		zap: 'zap',
		brain: 'hubot',
		layers: 'layers',
		download: 'cloud-download',
		x: 'close',
		send: 'send',
		eye: 'eye',
		refresh: 'refresh',
		'check-all': 'check-all',
		'list-selection': 'list-selection',
		'clear-all': 'clear-all',
		discard: 'discard',
		'comment-add': 'comment-add',
		check: 'check',
		'layout-sidebar-left': 'layout-sidebar-left',
		'layout-sidebar-left-off': 'layout-sidebar-left-off',
		'layout-sidebar-right': 'layout-sidebar-right',
		'layout-sidebar-right-off': 'layout-sidebar-right-off'
	};

	export const codiconFor = (name: IconName): string => CODICON[name];
</script>

<script lang="ts">
	let {
		name,
		size = 16,
		color = 'currentColor'
	}: {
		name: IconName;
		size?: number;
		color?: string;
		/* strokeWidth retained for callsite compatibility but ignored — codicons are glyphs. */
		strokeWidth?: number;
	} = $props();
</script>

<i
	class="codicon codicon-{CODICON[name]}"
	style:font-size="{size}px"
	style:width="{size}px"
	style:height="{size}px"
	style:color
	aria-hidden="true"
></i>

<style>
	.codicon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
		flex-shrink: 0;
	}
</style>
