<script lang="ts">
	let { size = 24 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
	<rect x="2" y="4" width="28" height="22" rx="4" stroke="hsl(var(--accent))" stroke-width="1.4" />
	<path d="M9 10v11M9 21h11" stroke="hsl(var(--accent))" stroke-width="2.4" stroke-linecap="round" />
	<circle cx="22" cy="12" r="1.5" fill="hsl(var(--accent))" />
</svg>
