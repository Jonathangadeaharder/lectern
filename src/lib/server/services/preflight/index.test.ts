import { describe, it, expect } from 'vitest';
import { classifyFinding } from './index';

describe('classifyFinding', () => {
	it('returns severityHint when provided', () => {
		expect(classifyFinding('anything', 'blocker')).toBe('blocker');
		expect(classifyFinding('anything', 'major')).toBe('major');
		expect(classifyFinding('anything', 'minor')).toBe('minor');
	});

	it('classifies blocker categories', () => {
		expect(classifyFinding('sql_injection')).toBe('blocker');
		expect(classifyFinding('command_injection')).toBe('blocker');
		expect(classifyFinding('hardcoded_secret')).toBe('blocker');
		expect(classifyFinding('ssrf')).toBe('blocker');
		expect(classifyFinding('path_traversal')).toBe('blocker');
		expect(classifyFinding('deserialization_rce')).toBe('blocker');
		expect(classifyFinding('xxe')).toBe('blocker');
	});

	it('classifies major categories', () => {
		expect(classifyFinding('probable_bug')).toBe('major');
		expect(classifyFinding('race_condition')).toBe('major');
		expect(classifyFinding('n_plus_one')).toBe('major');
		expect(classifyFinding('missing_error_handling')).toBe('major');
		expect(classifyFinding('resource_leak')).toBe('major');
	});

	it('classifies minor categories', () => {
		expect(classifyFinding('style')).toBe('minor');
		expect(classifyFinding('documentation')).toBe('minor');
		expect(classifyFinding('naming')).toBe('minor');
		expect(classifyFinding('formatting')).toBe('minor');
		expect(classifyFinding('lint')).toBe('minor');
		expect(classifyFinding('dead_code')).toBe('minor');
	});

	it('defaults to minor for unknown categories', () => {
		expect(classifyFinding('some_unknown_thing')).toBe('minor');
		expect(classifyFinding(undefined)).toBe('minor');
		expect(classifyFinding('')).toBe('minor');
	});

	it('is case-insensitive for category matching', () => {
		expect(classifyFinding('SQL_INJECTION')).toBe('blocker');
		expect(classifyFinding('Probable_Bug')).toBe('major');
		expect(classifyFinding('STYLE')).toBe('minor');
	});

	it('prefers severityHint over category', () => {
		// style is normally minor, but explicit hint overrides
		expect(classifyFinding('style', 'blocker')).toBe('blocker');
		// sql_injection is normally blocker, but explicit hint overrides
		expect(classifyFinding('sql_injection', 'minor')).toBe('minor');
	});
});
