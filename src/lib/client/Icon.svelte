<script lang="ts">
	type IconName =
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
		| 'eye';

	let {
		name,
		size = 16,
		color = 'currentColor',
		strokeWidth = 2
	}: {
		name: IconName;
		size?: number;
		color?: string;
		strokeWidth?: number;
	} = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke={color}
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'home'}
		<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
		<polyline points="9 22 9 12 15 12 15 22" />
	{:else if name === 'book'}
		<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
	{:else if name === 'repo'}
		<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
		<polyline points="10 2 10 10 13 8 16 10 16 2" />
	{:else if name === 'chart'}
		<line x1="12" x2="12" y1="20" y2="10" />
		<line x1="18" x2="18" y1="20" y2="4" />
		<line x1="6" x2="6" y1="20" y2="16" />
	{:else if name === 'plus'}
		<path d="M12 5v14M5 12h14" />
	{:else if name === 'search'}
		<circle cx="11" cy="11" r="8" />
		<path d="m21 21-4.3-4.3" />
	{:else if name === 'settings'}
		<path
			d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
		/>
		<circle cx="12" cy="12" r="3" />
	{:else if name === 'flame'}
		<path
			d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
		/>
	{:else if name === 'chevron-right'}
		<path d="m9 18 6-6-6-6" />
	{:else if name === 'command'}
		<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
	{:else if name === 'arrow-right'}
		<line x1="5" x2="19" y1="12" y2="12" />
		<polyline points="12 5 19 12 12 19" />
	{:else if name === 'arrow-up'}
		<path d="m5 12 7-7 7 7M12 19V5" />
	{:else if name === 'arrow-down'}
		<path d="M12 5v14M5 12l7 7 7-7" />
	{:else if name === 'sun-moon'}
		<path d="M12 8a2.83 2.83 0 0 1 4 4" />
		<path d="M12 2v2" />
		<path d="M12 20v2" />
		<path d="m4.93 4.93 1.41 1.41" />
		<path d="m17.66 17.66 1.41 1.41" />
		<path d="M2 12h2" />
		<path d="M20 12h2" />
		<path d="m6.34 17.66-1.41 1.41" />
		<path d="m19.07 4.93-1.41 1.41" />
		<path d="M12 18a6 6 0 0 0 0-12v12z" />
	{:else if name === 'pull-request'}
		<circle cx="18" cy="18" r="3" />
		<circle cx="6" cy="6" r="3" />
		<path d="M13 6h3a2 2 0 0 1 2 2v7" />
		<line x1="6" x2="6" y1="9" y2="21" />
	{:else if name === 'zap'}
		<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
	{:else if name === 'brain'}
		<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
		<path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
	{:else if name === 'layers'}
		<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
		<polyline points="2 12 12 17 22 12" />
		<polyline points="2 17 12 22 22 17" />
	{:else if name === 'download'}
		<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
		<polyline points="7 10 12 15 17 10" />
		<line x1="12" x2="12" y1="15" y2="3" />
	{:else if name === 'x'}
		<path d="M18 6 6 18M6 6l12 12" />
	{:else if name === 'send'}
		<path d="m22 2-7 20-4-9-9-4Z" />
		<path d="M22 2 11 13" />
	{:else if name === 'eye'}
		<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
		<circle cx="12" cy="12" r="3" />
	{/if}
</svg>
