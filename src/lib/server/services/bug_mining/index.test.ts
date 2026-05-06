import { describe, it, expect } from 'vitest';
import { isBugFixMessage, isRefactorMessage, classifyCommit } from './index';

describe('isBugFixMessage', () => {
	it('detects "fix" prefix', () => {
		expect(isBugFixMessage('fix: null pointer in auth')).toBe(true);
	});

	it('detects "fixes"', () => {
		expect(isBugFixMessage('fixes login crash')).toBe(true);
	});

	it('detects "fixed"', () => {
		expect(isBugFixMessage('fixed memory leak in worker')).toBe(true);
	});

	it('detects "bug fix"', () => {
		expect(isBugFixMessage('bug fix: race condition in queue')).toBe(true);
	});

	it('detects "hotfix"', () => {
		expect(isBugFixMessage('hotfix: production crash')).toBe(true);
	});

	it('detects "resolve"', () => {
		expect(isBugFixMessage('resolve merge conflict issue')).toBe(true);
	});

	it('detects "regression"', () => {
		expect(isBugFixMessage('fix regression from v2 migration')).toBe(true);
	});

	it('detects "null pointer"', () => {
		expect(isBugFixMessage('handle null pointer in parser')).toBe(true);
	});

	it('detects "off by one"', () => {
		expect(isBugFixMessage('fix off-by-one in loop')).toBe(true);
	});

	it('detects "race condition"', () => {
		expect(isBugFixMessage('fix race condition in cache')).toBe(true);
	});

	it('detects "crash"', () => {
		expect(isBugFixMessage('prevent crash on empty input')).toBe(true);
	});

	it('rejects non-bug messages', () => {
		expect(isBugFixMessage('add user profile page')).toBe(false);
		expect(isBugFixMessage('update README')).toBe(false);
		expect(isBugFixMessage('feat: new dashboard')).toBe(false);
	});
});

describe('isRefactorMessage', () => {
	it('detects "refactor"', () => {
		expect(isRefactorMessage('refactor auth module')).toBe(true);
	});

	it('detects "rename"', () => {
		expect(isRefactorMessage('rename UserService to AccountService')).toBe(true);
	});

	it('detects "clean up"', () => {
		expect(isRefactorMessage('clean up unused imports')).toBe(true);
	});

	it('detects "extract"', () => {
		expect(isRefactorMessage('extract validation logic')).toBe(true);
	});

	it('detects "formatting"', () => {
		expect(isRefactorMessage('formatting: fix indentation')).toBe(true);
	});

	it('detects "whitespace"', () => {
		expect(isRefactorMessage('whitespace changes')).toBe(true);
	});

	it('detects "typo"', () => {
		expect(isRefactorMessage('fix typo in comment')).toBe(true);
	});

	it('rejects non-refactor messages', () => {
		expect(isRefactorMessage('add login feature')).toBe(false);
		expect(isRefactorMessage('fix crash in parser')).toBe(false);
	});
});

describe('classifyCommit', () => {
	it('classifies bug fix', () => {
		const result = classifyCommit('fix: null pointer');
		expect(result.isBugFix).toBe(true);
		expect(result.isRefactor).toBe(false);
	});

	it('classifies refactor', () => {
		const result = classifyCommit('refactor auth module');
		expect(result.isBugFix).toBe(false);
		expect(result.isRefactor).toBe(true);
	});

	it('classifies neither', () => {
		const result = classifyCommit('add new feature');
		expect(result.isBugFix).toBe(false);
		expect(result.isRefactor).toBe(false);
	});

	it('handles messages that match both (refactor wins for filter)', () => {
		const result = classifyCommit('refactor: fix broken test structure');
		expect(result.isRefactor).toBe(true);
	});
});
