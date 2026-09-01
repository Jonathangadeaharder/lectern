import type { FilterSpec } from './diffFilters';

export const BUILTIN_FILTERS: FilterSpec = {
	version: 1,
	filters: [
		{
			id: 'hide-lockfiles',
			label: 'Lockfiles',
			scope: 'file',
			match: {
				pathGlob: [
					'**/*.lock',
					'**/package-lock.json',
					'**/yarn.lock',
					'**/pnpm-lock.yaml',
					'**/poetry.lock',
					'**/Cargo.lock',
					'**/Gemfile.lock',
					'**/composer.lock',
					'**/go.sum'
				]
			},
			action: 'hide',
			defaultOn: true,
			description: 'Hide package-manager lockfiles.'
		},
		{
			id: 'dim-whitespace-only',
			label: 'Whitespace only',
			scope: 'line',
			match: { whitespaceOnly: true },
			action: 'dim',
			defaultOn: true,
			description: 'Dim lines whose change is only whitespace.'
		},
		{
			id: 'collapse-generated',
			label: 'Generated',
			scope: 'hunk',
			match: { anyLineMatches: '@generated|DO NOT EDIT|GENERATED FILE' },
			action: 'collapse',
			defaultOn: false,
			description: 'Collapse hunks that touch generated code.'
		},
		{
			id: 'hide-large-files',
			label: 'Large files',
			scope: 'file',
			match: { linesChangedAbove: 500 },
			action: 'hide',
			defaultOn: false,
			description: 'Hide files with more than 500 changed lines.'
		},
		{
			id: 'hide-tests',
			label: 'Tests',
			scope: 'file',
			match: {
				pathGlob: [
					'**/*test*',
					'**/*Test*',
					'**/*.spec.*',
					'**/*.test.*',
					'**/tests/**',
					'**/__tests__/**',
					'**/test/**',
					'**/spec/**'
				]
			},
			action: 'hide',
			defaultOn: true,
			description: 'Hide files whose path contains "test" or "spec".'
		}
	]
};
