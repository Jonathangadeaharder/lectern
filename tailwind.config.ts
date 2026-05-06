import type { Config } from 'tailwindcss';

export default {
	content: ['./src/**/*.{html,svelte,ts,js}'],
	darkMode: ['class', '[data-theme="dark"]', '[data-theme="light"]'],
	theme: {
		extend: {
			colors: {
				surface: {
					0: 'hsl(var(--surface-0) / <alpha-value>)',
					1: 'hsl(var(--surface-1) / <alpha-value>)',
					2: 'hsl(var(--surface-2) / <alpha-value>)',
					3: 'hsl(var(--surface-3) / <alpha-value>)'
				},
				border: {
					subtle: 'hsl(var(--border-subtle) / <alpha-value>)',
					DEFAULT: 'hsl(var(--border-default) / <alpha-value>)',
					strong: 'hsl(var(--border-strong) / <alpha-value>)'
				},
				text: {
					primary: 'hsl(var(--text-primary) / <alpha-value>)',
					secondary: 'hsl(var(--text-secondary) / <alpha-value>)',
					muted: 'hsl(var(--text-muted) / <alpha-value>)',
					disabled: 'hsl(var(--text-disabled) / <alpha-value>)'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
					hover: 'hsl(var(--accent-hover) / <alpha-value>)',
					muted: 'hsl(var(--accent-muted) / <alpha-value>)'
				},
				state: {
					success: 'hsl(var(--state-success) / <alpha-value>)',
					'success-bg': 'hsl(var(--state-success-bg) / <alpha-value>)',
					warning: 'hsl(var(--state-warning) / <alpha-value>)',
					'warning-bg': 'hsl(var(--state-warning-bg) / <alpha-value>)',
					error: 'hsl(var(--state-error) / <alpha-value>)',
					'error-bg': 'hsl(var(--state-error-bg) / <alpha-value>)',
					info: 'hsl(var(--state-info) / <alpha-value>)',
					'info-bg': 'hsl(var(--state-info-bg) / <alpha-value>)'
				}
			},
			fontFamily: {
				sans: ['var(--font-sans)'],
				mono: ['var(--font-mono)']
			},
			fontSize: {
				xs: ['12px', { lineHeight: '1.5' }],
				sm: ['13px', { lineHeight: '1.5' }],
				base: ['14px', { lineHeight: '1.5' }],
				lg: ['16px', { lineHeight: '1.5' }],
				xl: ['18px', { lineHeight: '1.4' }],
				'2xl': ['22px', { lineHeight: '1.3' }],
				'3xl': ['28px', { lineHeight: '1.2' }]
			},
			spacing: {
				1: '4px',
				2: '8px',
				3: '12px',
				4: '16px',
				5: '20px',
				6: '24px',
				8: '32px',
				10: '40px',
				12: '48px',
				14: '56px',
				16: '64px',
				18: '72px',
				20: '80px',
				24: '96px'
			},
			borderRadius: {
				sm: '4px',
				md: '8px',
				lg: '12px'
			},
			transitionDuration: {
				fast: '50ms',
				DEFAULT: '120ms',
				slow: '200ms',
				slower: '400ms'
			},
			transitionTimingFunction: {
				out: 'cubic-bezier(.2,.8,.2,1)',
				'in-out': 'cubic-bezier(.4,0,.2,1)'
			}
		}
	},
	plugins: []
} satisfies Config;
