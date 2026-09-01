import type { MrFile } from './types';

export type StructuralCategory = 'behavior' | 'mechanical' | 'new' | 'deleted';
export type StructuralLineKind = 'context' | 'addition' | 'deletion';
export type MechanicalReason =
	| 'formatting'
	| 'comments'
	| 'identifiers'
	| 'symbols'
	| 'braces'
	| 'reorder'
	| 'move'
	| 'rename';

export interface StructuralLine {
	id: string;
	kind: StructuralLineKind;
	oldNumber: number | null;
	newNumber: number | null;
	text: string;
	category: StructuralCategory | null;
	mechanicalReason?: MechanicalReason;
}

export interface StructuralHunk {
	id: string;
	header: string;
	lines: StructuralLine[];
}

export interface StructuralFile {
	id: string;
	file: MrFile;
	path: string;
	status: 'A' | 'D' | 'R' | 'M';
	hunks: StructuralHunk[];
	counts: Record<StructuralCategory, number>;
	changedLines: number;
	isPureRename: boolean;
}

export interface StructuralDiff {
	files: StructuralFile[];
	counts: Record<StructuralCategory, number>;
	total: number;
}

export interface RenamedPathReference {
	source: string;
	target: string;
}

export interface StructuralDiffOptions {
	renamedPathReferences?: RenamedPathReference[];
}

interface Token {
	kind: 'comment' | 'literal' | 'keyword' | 'identifier' | 'operator';
	value: string;
}

interface ChangeBlock {
	id: string;
	deletions: StructuralLine[];
	additions: StructuralLine[];
	reason: MechanicalReason | null;
}

interface AnalyzedFile extends StructuralFile {
	blocks: ChangeBlock[];
	identifierMappings: Map<string, string>;
	symbolMappings: Map<string, string>;
}

interface ComparableToken {
	kind: string;
	value: string;
}

interface MappedToken extends Token {
	originalValue: string;
	lineIndex: number;
}

interface RenameEvidence {
	forward: Map<string, Map<string, number>>;
	reverse: Map<string, Map<string, number>>;
	observedPathPairs: Array<[string, string]>;
}

interface SymbolEvidence {
	forward: Map<string, Map<string, number>>;
	reverse: Map<string, Map<string, number>>;
}

interface TypedConstantCandidate {
	oldIndex: number;
	newIndex: number;
	source: string;
	target: string;
	context: number;
	distance: number;
}

const cppKeywords = new Set([
	'alignas', 'alignof', 'and', 'and_eq', 'asm', 'auto', 'bitand', 'bitor', 'bool',
	'break', 'case', 'catch', 'char', 'char16_t', 'char32_t', 'class', 'compl', 'concept',
	'const', 'constexpr', 'const_cast', 'continue', 'co_await', 'co_return', 'co_yield',
	'decltype', 'default', 'delete', 'do', 'double', 'dynamic_cast', 'else', 'enum',
	'explicit', 'export', 'extern', 'false', 'float', 'for', 'friend', 'goto', 'if',
	'inline', 'int', 'long', 'mutable', 'namespace', 'new', 'noexcept', 'not', 'not_eq',
	'nullptr', 'operator', 'or', 'or_eq', 'private', 'protected', 'public', 'register',
	'reinterpret_cast', 'requires', 'return', 'short', 'signed', 'sizeof', 'static',
	'static_assert', 'static_cast', 'struct', 'switch', 'template', 'this', 'thread_local',
	'throw', 'true', 'try', 'typedef', 'typeid', 'typename', 'union', 'unsigned', 'using',
	'virtual', 'void', 'volatile', 'wchar_t', 'while', 'xor', 'xor_eq'
]);

const exactTokenMatchWeight = 4;
const renamedIdentifierMatchWeight = 1;
const minimumRenameEvidence = 2;
const minimumSymbolEvidence = 2;

function readQuoted(source: string, start: number, quote: string): number {
	let index = start + 1;
	while (index < source.length) {
		if (source.charAt(index) === '\\') {
			index += 2;
			continue;
		}
		index++;
		if (source.charAt(index - 1) === quote) break;
	}
	return index;
}

function tokenize(source: string, dropComments: boolean): Token[] {
	const tokens: Token[] = [];
	let index = 0;
	while (index < source.length) {
		const character = source.charAt(index);
		const next = source.charAt(index + 1);
		if (/\s/.test(character)) {
			index++;
			continue;
		}
		if (character === '/' && next === '/') {
			let lineEnd = source.indexOf('\n', index + 2);
			lineEnd = lineEnd === -1 ? source.length : lineEnd;
			if (!dropComments) tokens.push({ kind: 'comment', value: source.slice(index, lineEnd) });
			index = lineEnd;
			continue;
		}
		if (character === '/' && next === '*') {
			let commentEnd = source.indexOf('*/', index + 2);
			commentEnd = commentEnd === -1 ? source.length : commentEnd + 2;
			if (!dropComments) tokens.push({ kind: 'comment', value: source.slice(index, commentEnd) });
			index = commentEnd;
			continue;
		}
		if (character === '"' || character === "'") {
			const quotedEnd = readQuoted(source, index, character);
			tokens.push({ kind: 'literal', value: source.slice(index, quotedEnd) });
			index = quotedEnd;
			continue;
		}
		if (/[A-Za-z_$]/.test(character)) {
			let identifierEnd = index + 1;
			while (identifierEnd < source.length && /[A-Za-z0-9_$]/.test(source.charAt(identifierEnd))) {
				identifierEnd++;
			}
			const identifier = source.slice(index, identifierEnd);
			tokens.push({
				kind: cppKeywords.has(identifier) ? 'keyword' : 'identifier',
				value: identifier
			});
			index = identifierEnd;
			continue;
		}
		if (/[0-9]/.test(character)) {
			let numberEnd = index + 1;
			while (numberEnd < source.length && /[A-Za-z0-9_.']/.test(source.charAt(numberEnd))) {
				numberEnd++;
			}
			tokens.push({ kind: 'literal', value: source.slice(index, numberEnd) });
			index = numberEnd;
			continue;
		}
		tokens.push({ kind: 'operator', value: character });
		index++;
	}
	return tokens;
}

function signature(tokens: ComparableToken[], renameIdentifiers: boolean): string {
	const identifiers = new Map<string, string>();
	let nextIdentifier = 0;
	return tokens
		.map((token) => {
			if (renameIdentifiers && token.kind === 'identifier') {
				if (!identifiers.has(token.value)) identifiers.set(token.value, `id${nextIdentifier++}`);
				return `${token.kind}:${identifiers.get(token.value)}`;
			}
			return `${token.kind}:${token.value}`;
		})
		.join('\x1f');
}

function changedText(lines: StructuralLine[]): string {
	return lines.map((line) => line.text).join('\n');
}

function hasSameReorderedLines(oldText: string, newText: string, path: string): boolean {
	const oldLines = oldText.split('\n').map((line) => line.trim()).filter(Boolean);
	const newLines = newText.split('\n').map((line) => line.trim()).filter(Boolean);
	if (oldLines.length < 2 || oldLines.length !== newLines.length) return false;
	const allLines = oldLines.concat(newLines);
	const isIncludeBlock = allLines.every((line) => /^#\s*(include|import)\b/.test(line));
	const isXmlPath = /\.(vcxproj|filters|xml|props|targets)$/i.test(path);
	const isXmlBlock = isXmlPath && allLines.every((line) => /^<\/?[A-Za-z_:][^>]*>$/.test(line));
	if (!isIncludeBlock && !isXmlBlock) return false;
	return oldLines.sort().join('\n') === newLines.sort().join('\n') && oldText !== newText;
}

function isConsistentIdentifierRename(oldTokens: Token[], newTokens: Token[]): boolean {
	if (oldTokens.length === 0 || oldTokens.length !== newTokens.length) return false;
	const forward = new Map<string, string>();
	const reverse = new Map<string, string>();
	const oldIdentifiers = new Set<string>();
	const newIdentifiers = new Set<string>();
	const changedOccurrences = new Map<string, number>();
	let hasChangedIdentifier = false;
	let hasUnchangedIdentifier = false;
	const declarationKeywords = new Set([
		'auto', 'bool', 'char', 'char16_t', 'char32_t', 'class', 'double', 'enum', 'float',
		'int', 'long', 'short', 'signed', 'struct', 'typedef', 'union', 'unsigned', 'using',
		'void', 'wchar_t'
	]);
	const hasDeclaration = oldTokens.some(
		(token) => token.kind === 'keyword' && declarationKeywords.has(token.value)
	);

	for (let index = 0; index < oldTokens.length; index++) {
		const oldToken = oldTokens[index]!;
		const newToken = newTokens[index]!;
		if (oldToken.kind !== newToken.kind) return false;
		if (oldToken.kind !== 'identifier') {
			if (oldToken.value !== newToken.value) return false;
			continue;
		}
		oldIdentifiers.add(oldToken.value);
		newIdentifiers.add(newToken.value);
		if (
			(forward.has(oldToken.value) && forward.get(oldToken.value) !== newToken.value) ||
			(reverse.has(newToken.value) && reverse.get(newToken.value) !== oldToken.value)
		) return false;
		forward.set(oldToken.value, newToken.value);
		reverse.set(newToken.value, oldToken.value);
		if (oldToken.value === newToken.value) hasUnchangedIdentifier = true;
		else {
			hasChangedIdentifier = true;
			changedOccurrences.set(oldToken.value, (changedOccurrences.get(oldToken.value) ?? 0) + 1);
		}
	}

	if (!hasChangedIdentifier) return false;
	const hasCollision = Array.from(forward.entries()).some(
		([source, target]) =>
			source !== target && (newIdentifiers.has(source) || oldIdentifiers.has(target))
	);
	if (hasCollision) return false;
	const hasRepeatedUse = Array.from(changedOccurrences.values()).some((count) => count > 1);
	return hasDeclaration || (hasUnchangedIdentifier && hasRepeatedUse);
}

function classifyBlock(block: ChangeBlock, path: string): MechanicalReason | null {
	const oldText = changedText(block.deletions);
	const newText = changedText(block.additions);
	const oldTokensWithComments = tokenize(oldText, false);
	const newTokensWithComments = tokenize(newText, false);
	const hasComments = oldTokensWithComments.concat(newTokensWithComments)
		.some((token) => token.kind === 'comment');
	const hasChangedCode = oldTokensWithComments.concat(newTokensWithComments)
		.some((token) => token.kind !== 'comment');
	if (hasComments && !hasChangedCode) return 'comments';
	if (block.deletions.length === 0 || block.additions.length === 0) return null;
	if (hasSameReorderedLines(oldText, newText, path)) return 'reorder';
	if (signature(oldTokensWithComments, false) === signature(newTokensWithComments, false)) {
		return 'formatting';
	}
	const oldTokens = tokenize(oldText, true);
	const newTokens = tokenize(newText, true);
	if (signature(oldTokens, false) === signature(newTokens, false) && hasComments) return 'comments';
	if (isConsistentIdentifierRename(oldTokens, newTokens)) return 'identifiers';
	return null;
}

function tokenMatchWeight(
	oldToken: ComparableToken,
	newToken: ComparableToken,
	allowIdentifierRename: boolean
): number {
	if (oldToken.kind !== newToken.kind) return 0;
	if (oldToken.value === newToken.value) return exactTokenMatchWeight;
	if (allowIdentifierRename && oldToken.kind === 'identifier') {
		return renamedIdentifierMatchWeight;
	}
	return 0;
}

function alignTokens(
	oldTokens: ComparableToken[],
	newTokens: ComparableToken[],
	allowIdentifierRename: boolean
): Array<[number, number]> {
	const columnCount = newTokens.length + 1;
	const directions = new Uint8Array((oldTokens.length + 1) * columnCount);
	let previousScores = new Uint32Array(columnCount);
	let currentScores = new Uint32Array(columnCount);

	for (let oldIndex = 1; oldIndex <= oldTokens.length; oldIndex++) {
		currentScores.fill(0);
		for (let newIndex = 1; newIndex <= newTokens.length; newIndex++) {
			const weight = tokenMatchWeight(
				oldTokens[oldIndex - 1]!,
				newTokens[newIndex - 1]!,
				allowIdentifierRename
			);
			const diagonal = weight > 0 ? previousScores[newIndex - 1]! + weight : 0;
			const above = previousScores[newIndex]!;
			const left = currentScores[newIndex - 1]!;
			const directionIndex = oldIndex * columnCount + newIndex;
			if (weight > 0 && diagonal >= above && diagonal >= left) {
				currentScores[newIndex] = diagonal;
				directions[directionIndex] = 1;
			} else if (above >= left) {
				currentScores[newIndex] = above;
				directions[directionIndex] = 2;
			} else {
				currentScores[newIndex] = left;
				directions[directionIndex] = 3;
			}
		}
		const swap = previousScores;
		previousScores = currentScores;
		currentScores = swap;
	}

	const pairs: Array<[number, number]> = [];
	let oldCursor = oldTokens.length;
	let newCursor = newTokens.length;
	while (oldCursor > 0 && newCursor > 0) {
		const direction = directions[oldCursor * columnCount + newCursor];
		if (direction === 1) {
			pairs.push([oldCursor - 1, newCursor - 1]);
			oldCursor--;
			newCursor--;
		} else if (direction === 2) oldCursor--;
		else newCursor--;
	}
	return pairs.reverse();
}

function createRenameEvidence(): RenameEvidence {
	return { forward: new Map(), reverse: new Map(), observedPathPairs: [] };
}

function addNestedCount(
	map: Map<string, Map<string, number>>,
	first: string,
	second: string
): void {
	if (!map.has(first)) map.set(first, new Map());
	const counts = map.get(first)!;
	counts.set(second, (counts.get(second) ?? 0) + 1);
}

function addRenameEvidence(
	evidence: RenameEvidence,
	oldIdentifier: string,
	newIdentifier: string
): void {
	addNestedCount(evidence.forward, oldIdentifier, newIdentifier);
	addNestedCount(evidence.reverse, newIdentifier, oldIdentifier);
}

function fileStem(path: string): string {
	const name = path.split(/[\\/]/).pop() ?? '';
	return name.replace(/\.[^.]+$/, '');
}

function renameFamily(file: AnalyzedFile): string {
	if (file.status !== 'R') return file.id;
	return `rename:${fileStem(file.file.oldPath)}->${fileStem(file.file.newPath)}`;
}

function collectBlockRenameEvidence(block: ChangeBlock, evidence: RenameEvidence): void {
	if (block.deletions.length === 0 || block.additions.length === 0) return;
	const oldLines = block.deletions
		.map((line) => {
			const tokens = tokenize(line.text, true);
			return { tokens, signature: signature(tokens, true) };
		})
		.filter((line) => line.tokens.length > 0);
	const newLines = block.additions
		.map((line) => {
			const tokens = tokenize(line.text, true);
			return { tokens, signature: signature(tokens, true) };
		})
		.filter((line) => line.tokens.length > 0);
	const linePairs = alignTokens(
		oldLines.map((line) => ({ kind: 'line', value: line.signature })),
		newLines.map((line) => ({ kind: 'line', value: line.signature })),
		false
	);
	if (linePairs.length > 0) {
		for (const [oldIndex, newIndex] of linePairs) {
			const oldTokens = oldLines[oldIndex]!.tokens;
			const newTokens = newLines[newIndex]!.tokens;
			oldTokens.forEach((oldToken, tokenIndex) => {
				const newToken = newTokens[tokenIndex];
				if (oldToken.kind === 'identifier' && newToken?.kind === 'identifier') {
					addRenameEvidence(evidence, oldToken.value, newToken.value);
				}
			});
		}
		return;
	}
	const oldTokens = tokenize(changedText(block.deletions), true);
	const newTokens = tokenize(changedText(block.additions), true);
	for (const [oldIndex, newIndex] of alignTokens(oldTokens, newTokens, true)) {
		const oldToken = oldTokens[oldIndex]!;
		const newToken = newTokens[newIndex]!;
		if (oldToken.kind === 'identifier' && newToken.kind === 'identifier') {
			addRenameEvidence(evidence, oldToken.value, newToken.value);
		}
	}
}

function hasObservedPair(
	evidence: RenameEvidence,
	oldIdentifier: string,
	newIdentifier: string
): boolean {
	return (evidence.forward.get(oldIdentifier)?.get(newIdentifier) ?? 0) > 0;
}

function chooseRenameMappings(evidence: RenameEvidence): Map<string, string> {
	const mappings = new Map<string, string>();
	const usedTargets = new Set<string>();
	for (const [source, target] of evidence.observedPathPairs) {
		if (hasObservedPair(evidence, source, target) && !usedTargets.has(target)) {
			mappings.set(source, target);
			usedTargets.add(target);
		}
	}
	for (const [oldIdentifier, targets] of evidence.forward) {
		if (mappings.has(oldIdentifier) || targets.has(oldIdentifier)) continue;
		const changedTargets = Array.from(targets.entries()).filter(
			([target, count]) => target !== oldIdentifier && count >= minimumRenameEvidence
		);
		if (changedTargets.length !== 1) continue;
		const newIdentifier = changedTargets[0]![0];
		const sources = evidence.reverse.get(newIdentifier) ?? new Map<string, number>();
		const changedSources = Array.from(sources.entries()).filter(
			([source, count]) => source !== newIdentifier && count >= minimumRenameEvidence
		);
		if (
			sources.has(newIdentifier) ||
			changedSources.length !== 1 ||
			usedTargets.has(newIdentifier) ||
			evidence.forward.has(newIdentifier) ||
			evidence.reverse.has(oldIdentifier)
		) continue;
		mappings.set(oldIdentifier, newIdentifier);
		usedTargets.add(newIdentifier);
	}
	return mappings;
}

function discardConflictingBlockRenames(files: AnalyzedFile[]): void {
	for (const file of files) {
		for (const block of file.blocks) {
			if (block.reason !== 'identifiers') continue;
			const oldTokens = tokenize(changedText(block.deletions), true);
			const newTokens = tokenize(changedText(block.additions), true);
			const conflicts = oldTokens.some((oldToken, index) => {
				const newToken = newTokens[index];
				if (oldToken.kind !== 'identifier' || newToken?.kind !== 'identifier') return false;
				const target = file.identifierMappings.get(oldToken.value);
				return target !== undefined && target !== newToken.value;
			});
			if (!conflicts) continue;
			block.reason = null;
			for (const line of block.deletions.concat(block.additions)) {
				if (line.mechanicalReason === 'identifiers') delete line.mechanicalReason;
			}
		}
	}
}

function mergeMappings(
	primary: Map<string, string>,
	secondary: Map<string, string>
): Map<string, string> {
	const merged = new Map(primary);
	const usedTargets = new Set(merged.values());
	for (const [source, target] of secondary) {
		if (!merged.has(source) && !usedTargets.has(target)) {
			merged.set(source, target);
			usedTargets.add(target);
		}
	}
	return merged;
}

function inferIdentifierMappings(files: AnalyzedFile[]): void {
	const globalEvidence = createRenameEvidence();
	const familyEvidence = new Map<string, RenameEvidence>();
	for (const file of files) {
		const family = renameFamily(file);
		if (!familyEvidence.has(family)) familyEvidence.set(family, createRenameEvidence());
		const localEvidence = familyEvidence.get(family)!;
		for (const block of file.blocks) {
			collectBlockRenameEvidence(block, localEvidence);
			collectBlockRenameEvidence(block, globalEvidence);
		}
		if (file.status === 'R') {
			const oldStem = fileStem(file.file.oldPath);
			const newStem = fileStem(file.file.newPath);
			if (
				/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(oldStem) &&
				/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(newStem) &&
				oldStem !== newStem
			) {
				localEvidence.observedPathPairs.push([oldStem, newStem]);
				globalEvidence.observedPathPairs.push([oldStem, newStem]);
			}
		}
	}
	const globalMappings = chooseRenameMappings(globalEvidence);
	for (const file of files) {
		const localMappings = chooseRenameMappings(familyEvidence.get(renameFamily(file))!);
		file.identifierMappings = mergeMappings(globalMappings, localMappings);
	}
}

function tokensForLines(
	lines: StructuralLine[],
	mappings: Map<string, string>
): MappedToken[] {
	const result: MappedToken[] = [];
	lines.forEach((line, lineIndex) => {
		for (const token of tokenize(line.text, true)) {
			result.push({
				kind: token.kind,
				value:
					token.kind === 'identifier' && mappings.has(token.value)
						? mappings.get(token.value)!
						: token.value,
				originalValue: token.value,
				lineIndex
			});
		}
	});
	return result;
}

function countTokensByLine(tokens: MappedToken[], lineCount: number): Uint32Array {
	const counts = new Uint32Array(lineCount);
	for (const token of tokens) {
		counts[token.lineIndex] = (counts[token.lineIndex] ?? 0) + 1;
	}
	return counts;
}

function hasSemanticAnchor(tokens: MappedToken[], lineIndex: number): boolean {
	return tokens.some((token) => token.lineIndex === lineIndex && token.kind !== 'operator');
}

function tokensAreEqual(first: ComparableToken, second: ComparableToken): boolean {
	return first.kind === second.kind && first.value === second.value;
}

function isAtomicValue(tokens: ComparableToken[]): boolean {
	return (
		tokens.length === 1 &&
		(tokens[0]!.kind === 'literal' ||
			tokens[0]!.kind === 'identifier' ||
			(tokens[0]!.kind === 'keyword' && /^(false|nullptr|true)$/.test(tokens[0]!.value)))
	);
}

function isQualifiedSymbol(tokens: ComparableToken[]): boolean {
	if (
		tokens.length < 4 ||
		tokens[0]!.kind !== 'identifier' ||
		tokens[tokens.length - 1]!.kind !== 'identifier'
	) return false;
	let index = 1;
	while (index < tokens.length) {
		if (
			tokens[index]?.kind !== 'operator' ||
			tokens[index]?.value !== ':' ||
			tokens[index + 1]?.kind !== 'operator' ||
			tokens[index + 1]?.value !== ':' ||
			tokens[index + 2]?.kind !== 'identifier'
		) return false;
		index += 3;
	}
	return true;
}

function typedConstantSubstitution(
	oldTokens: ComparableToken[],
	newTokens: ComparableToken[]
): { source: string; target: string; context: number } | null {
	let prefixLength = 0;
	while (
		prefixLength < oldTokens.length &&
		prefixLength < newTokens.length &&
		tokensAreEqual(oldTokens[prefixLength]!, newTokens[prefixLength]!)
	) prefixLength++;
	let suffixLength = 0;
	while (
		suffixLength < oldTokens.length - prefixLength &&
		suffixLength < newTokens.length - prefixLength &&
		tokensAreEqual(
			oldTokens[oldTokens.length - suffixLength - 1]!,
			newTokens[newTokens.length - suffixLength - 1]!
		)
	) suffixLength++;
	const oldMiddle = oldTokens.slice(prefixLength, oldTokens.length - suffixLength);
	const newMiddle = newTokens.slice(prefixLength, newTokens.length - suffixLength);
	if (prefixLength + suffixLength < 2 || !isAtomicValue(oldMiddle) || !isQualifiedSymbol(newMiddle)) {
		return null;
	}
	return {
		source: signature(oldMiddle, false),
		target: signature(newMiddle, false),
		context: prefixLength + suffixLength
	};
}

function typedConstantCandidates(
	block: ChangeBlock,
	identifierMappings: Map<string, string>,
	approvedMappings: Map<string, string> | null
): TypedConstantCandidate[] {
	const candidates: TypedConstantCandidate[] = [];
	block.deletions.forEach((oldLine, oldIndex) => {
		const oldTokens = tokensForLines([oldLine], identifierMappings);
		block.additions.forEach((newLine, newIndex) => {
			const substitution = typedConstantSubstitution(
				oldTokens,
				tokensForLines([newLine], new Map())
			);
			if (
				substitution &&
				(!approvedMappings || approvedMappings.get(substitution.source) === substitution.target)
			) {
				candidates.push({
					oldIndex,
					newIndex,
					...substitution,
					distance: Math.abs(oldIndex - newIndex)
				});
			}
		});
	});
	candidates.sort(
		(first, second) =>
			second.context - first.context ||
			first.distance - second.distance ||
			first.oldIndex - second.oldIndex ||
			first.newIndex - second.newIndex
	);
	const usedOldLines = new Set<number>();
	const usedNewLines = new Set<number>();
	return candidates.filter((candidate) => {
		if (usedOldLines.has(candidate.oldIndex) || usedNewLines.has(candidate.newIndex)) return false;
		usedOldLines.add(candidate.oldIndex);
		usedNewLines.add(candidate.newIndex);
		return true;
	});
}

function createSymbolEvidence(): SymbolEvidence {
	return { forward: new Map(), reverse: new Map() };
}

function collectBlockSymbolEvidence(
	block: ChangeBlock,
	identifierMappings: Map<string, string>,
	evidence: SymbolEvidence
): void {
	if (block.reason || block.deletions.length === 0 || block.additions.length === 0) return;
	for (const candidate of typedConstantCandidates(block, identifierMappings, null)) {
		addNestedCount(evidence.forward, candidate.source, candidate.target);
		addNestedCount(evidence.reverse, candidate.target, candidate.source);
	}
}

function chooseSymbolMappings(evidence: SymbolEvidence): Map<string, string> {
	const mappings = new Map<string, string>();
	const usedTargets = new Set<string>();
	for (const [source, targets] of evidence.forward) {
		const targetEntries = Array.from(targets.entries());
		if (targetEntries.length !== 1 || targetEntries[0]![1] < minimumSymbolEvidence) continue;
		const target = targetEntries[0]![0];
		const sources = evidence.reverse.get(target) ?? new Map<string, number>();
		if (sources.size !== 1 || usedTargets.has(target)) continue;
		mappings.set(source, target);
		usedTargets.add(target);
	}
	return mappings;
}

function symbolFamily(file: AnalyzedFile): string {
	return file.path.replace(/\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx)$/i, '');
}

function inferSymbolMappings(files: AnalyzedFile[]): void {
	const globalEvidence = createSymbolEvidence();
	const familyEvidence = new Map<string, SymbolEvidence>();
	for (const file of files) {
		const family = symbolFamily(file);
		if (!familyEvidence.has(family)) familyEvidence.set(family, createSymbolEvidence());
		for (const block of file.blocks) {
			collectBlockSymbolEvidence(block, file.identifierMappings, familyEvidence.get(family)!);
			collectBlockSymbolEvidence(block, file.identifierMappings, globalEvidence);
		}
	}
	const globalMappings = chooseSymbolMappings(globalEvidence);
	for (const file of files) {
		file.symbolMappings = mergeMappings(
			globalMappings,
			chooseSymbolMappings(familyEvidence.get(symbolFamily(file))!)
		);
	}
}

function mappedComments(
	text: string,
	mappings: Map<string, string>
): { changed: boolean; values: string[] } {
	let changed = false;
	const values = tokenize(text, false)
		.filter((token) => token.kind === 'comment')
		.map((token) =>
			token.value
				.replace(/[A-Za-z_$][A-Za-z0-9_$]*/g, (identifier) => {
					if (!mappings.has(identifier)) return identifier;
					changed = true;
					return mappings.get(identifier)!;
				})
				.replace(/\s+/g, ' ')
				.trim()
		);
	return { changed, values };
}

function commentsMatch(
	oldLine: StructuralLine,
	newLine: StructuralLine,
	mappings: Map<string, string>
): boolean {
	const oldComments = mappedComments(oldLine.text, mappings).values;
	const newComments = mappedComments(newLine.text, new Map()).values;
	return (
		oldComments.length === newComments.length &&
		oldComments.every((comment, index) => comment === newComments[index])
	);
}

function markUniqueMappedLines(block: ChangeBlock, mappings: Map<string, string>): void {
	type Match = { line: StructuralLine; tokens: MappedToken[]; commentRename: boolean };
	const oldBySignature = new Map<string, Match[]>();
	const newBySignature = new Map<string, Match[]>();
	const collect = (
		lines: StructuralLine[],
		lineMappings: Map<string, string>,
		target: Map<string, Match[]>
	): void => {
		for (const line of lines) {
			const tokens = tokensForLines([line], lineMappings);
			const comments = mappedComments(line.text, lineMappings);
			if (
				(tokens.length === 0 && comments.values.length === 0) ||
				(tokens.length > 0 && !hasSemanticAnchor(tokens, 0))
			) continue;
			const value = `${signature(tokens, false)}\x1e${comments.values.join('\x1d')}`;
			const matches = target.get(value) ?? [];
			matches.push({ line, tokens, commentRename: comments.changed });
			target.set(value, matches);
		}
	};
	collect(block.deletions, mappings, oldBySignature);
	collect(block.additions, new Map(), newBySignature);
	for (const [value, oldMatches] of oldBySignature) {
		const newMatches = newBySignature.get(value) ?? [];
		if (oldMatches.length !== 1 || newMatches.length !== 1) continue;
		const oldMatch = oldMatches[0]!;
		const newMatch = newMatches[0]!;
		const reason =
			oldMatch.tokens.some((token) => token.originalValue !== token.value) || oldMatch.commentRename
				? 'identifiers'
				: 'formatting';
		oldMatch.line.mechanicalReason ||= reason;
		newMatch.line.mechanicalReason ||= reason;
	}
}

function markTypedConstantLines(
	block: ChangeBlock,
	identifierMappings: Map<string, string>,
	symbolMappings: Map<string, string>
): void {
	for (const candidate of typedConstantCandidates(block, identifierMappings, symbolMappings)) {
		block.deletions[candidate.oldIndex]!.mechanicalReason = 'symbols';
		block.additions[candidate.newIndex]!.mechanicalReason = 'symbols';
	}
}

function markAlignedMechanicalLines(
	block: ChangeBlock,
	mappings: Map<string, string>,
	symbolMappings: Map<string, string>
): void {
	if (block.reason || block.deletions.length === 0 || block.additions.length === 0) return;
	markTypedConstantLines(block, mappings, symbolMappings);
	if (mappings.size === 0) return;
	markUniqueMappedLines(block, mappings);
	const oldTokens = tokensForLines(block.deletions, mappings);
	const newTokens = tokensForLines(block.additions, new Map());
	const pairs = alignTokens(oldTokens, newTokens, false);
	const oldTotals = countTokensByLine(oldTokens, block.deletions.length);
	const newTotals = countTokensByLine(newTokens, block.additions.length);
	const oldMatches = new Uint32Array(block.deletions.length);
	const newMatches = new Uint32Array(block.additions.length);
	const oldCounterparts = Array.from(
		{ length: block.deletions.length },
		() => new Set<number>()
	);
	const newCounterparts = Array.from(
		{ length: block.additions.length },
		() => new Set<number>()
	);
	const oldRenameLines = new Set<number>();
	const newRenameLines = new Set<number>();
	for (const [oldIndex, newIndex] of pairs) {
		const oldToken = oldTokens[oldIndex]!;
		const newToken = newTokens[newIndex]!;
		oldMatches[oldToken.lineIndex] = (oldMatches[oldToken.lineIndex] ?? 0) + 1;
		newMatches[newToken.lineIndex] = (newMatches[newToken.lineIndex] ?? 0) + 1;
		oldCounterparts[oldToken.lineIndex]!.add(newToken.lineIndex);
		newCounterparts[newToken.lineIndex]!.add(oldToken.lineIndex);
		if (oldToken.originalValue !== oldToken.value) {
			oldRenameLines.add(oldToken.lineIndex);
			newRenameLines.add(newToken.lineIndex);
		}
	}
	const oldFullyMatched = Array.from(
		oldTotals,
		(count, lineIndex) =>
			count > 0 && count === oldMatches[lineIndex] && hasSemanticAnchor(oldTokens, lineIndex)
	);
	const newFullyMatched = Array.from(
		newTotals,
		(count, lineIndex) =>
			count > 0 && count === newMatches[lineIndex] && hasSemanticAnchor(newTokens, lineIndex)
	);
	block.deletions.forEach((line, lineIndex) => {
		const counterparts = Array.from(oldCounterparts[lineIndex]!);
		if (
			oldFullyMatched[lineIndex] &&
			counterparts.length > 0 &&
			counterparts.every(
				(counterpart) =>
					newFullyMatched[counterpart] &&
					commentsMatch(line, block.additions[counterpart]!, mappings)
			)
		) {
			line.mechanicalReason ||=
				oldRenameLines.has(lineIndex) || counterparts.some((item) => newRenameLines.has(item))
					? 'identifiers'
					: 'formatting';
		}
	});
	block.additions.forEach((line, lineIndex) => {
		const counterparts = Array.from(newCounterparts[lineIndex]!);
		if (
			newFullyMatched[lineIndex] &&
			counterparts.length > 0 &&
			counterparts.every(
				(counterpart) =>
					oldFullyMatched[counterpart] &&
					commentsMatch(block.deletions[counterpart]!, line, mappings)
			)
		) {
			line.mechanicalReason ||=
				newRenameLines.has(lineIndex) || counterparts.some((item) => oldRenameLines.has(item))
					? 'identifiers'
					: 'formatting';
		}
	});
}

function classifyMovedBlocks(files: AnalyzedFile[]): void {
	const removals = new Map<string, ChangeBlock[]>();
	const additions = new Map<string, ChangeBlock[]>();
	const addCandidate = (
		map: Map<string, ChangeBlock[]>,
		value: string,
		block: ChangeBlock
	): void => {
		map.set(value, [...(map.get(value) ?? []), block]);
	};
	for (const file of files) {
		for (const block of file.blocks) {
			if (block.reason) continue;
			const isRemoval = block.deletions.length > 0 && block.additions.length === 0;
			const isAddition = block.additions.length > 0 && block.deletions.length === 0;
			if (!isRemoval && !isAddition) continue;
			const tokens = tokenize(changedText(isRemoval ? block.deletions : block.additions), true);
			if (tokens.length < 12) continue;
			addCandidate(isRemoval ? removals : additions, signature(tokens, false), block);
		}
	}
	for (const [value, removedBlocks] of removals) {
		const addedBlocks = additions.get(value) ?? [];
		if (removedBlocks.length === 1 && addedBlocks.length === 1) {
			removedBlocks[0]!.reason = 'move';
			addedBlocks[0]!.reason = 'move';
		}
	}
}

function isSimpleIfHeader(text: string): boolean {
	const tokens = tokenize(text, true);
	return (
		tokens.length >= 3 &&
		tokens[0]!.kind === 'keyword' &&
		tokens[0]!.value === 'if' &&
		tokens[1]!.kind === 'operator' &&
		tokens[1]!.value === '(' &&
		tokens[tokens.length - 1]!.kind === 'operator' &&
		tokens[tokens.length - 1]!.value === ')'
	);
}

function isSimpleStatement(text: string): boolean {
	const tokens = tokenize(text, true);
	const controlKeywords = new Set(['do', 'else', 'for', 'if', 'switch', 'while']);
	return (
		tokens.length > 0 &&
		!tokens.some(
			(token) => token.kind === 'operator' && (token.value === '{' || token.value === '}')
		) &&
		!(tokens[0]!.kind === 'keyword' && controlKeywords.has(tokens[0]!.value)) &&
		tokens[tokens.length - 1]!.kind === 'operator' &&
		tokens[tokens.length - 1]!.value === ';'
	);
}

function markSingleStatementBraceChanges(file: AnalyzedFile): void {
	for (const hunk of file.hunks) {
		for (let index = 0; index + 3 < hunk.lines.length; index++) {
			const header = hunk.lines[index]!;
			const openingBrace = hunk.lines[index + 1]!;
			const statement = hunk.lines[index + 2]!;
			const closingBrace = hunk.lines[index + 3]!;
			const changedKind = openingBrace.kind;
			if (
				header.kind === 'context' &&
				statement.kind === 'context' &&
				(changedKind === 'addition' || changedKind === 'deletion') &&
				closingBrace.kind === changedKind &&
				openingBrace.text.trim() === '{' &&
				closingBrace.text.trim() === '}' &&
				isSimpleIfHeader(header.text) &&
				isSimpleStatement(statement.text)
			) {
				openingBrace.mechanicalReason = 'braces';
				closingBrace.mechanicalReason = 'braces';
				index += 3;
			}
		}
	}
}

function markIncludeSeparatorChanges(file: AnalyzedFile): void {
	for (const hunk of file.hunks) {
		hunk.lines.forEach((line, index) => {
			if (line.kind === 'context' || line.text.trim() !== '') return;
			let previous = index - 1;
			while (previous >= 0 && hunk.lines[previous]!.text.trim() === '') previous--;
			let next = index + 1;
			while (next < hunk.lines.length && hunk.lines[next]!.text.trim() === '') next++;
			if (
				previous >= 0 &&
				next < hunk.lines.length &&
				/^\s*#\s*(include|import)\b/.test(hunk.lines[previous]!.text) &&
				/^\s*#\s*(include|import)\b/.test(hunk.lines[next]!.text)
			) line.mechanicalReason = 'formatting';
		});
	}
}

function renamedPathReferenceMappings(
	references: RenamedPathReference[]
): Map<string, string> {
	const candidates = new Map<string, Set<string>>();
	for (const reference of references) {
		if (!candidates.has(reference.source)) candidates.set(reference.source, new Set());
		candidates.get(reference.source)!.add(reference.target);
	}
	const mappings = new Map<string, string>();
	for (const [source, targets] of candidates) {
		if (targets.size === 1) mappings.set(source, Array.from(targets)[0]!);
	}
	return mappings;
}

function quotedPathReference(
	text: string
): { quote: string; path: string; shell: string } | null {
	const literals = tokenize(text, false).filter(
		(token) =>
			token.kind === 'literal' && (token.value.startsWith('"') || token.value.startsWith("'"))
	);
	if (literals.length !== 1) return null;
	const literal = literals[0]!.value;
	const start = text.indexOf(literal);
	return {
		quote: literal.charAt(0),
		path: literal.slice(1, -1).replace(/\\/g, '/'),
		shell: `${text.slice(0, start)}\x00${text.slice(start + literal.length)}`
	};
}

function markRenamedPathReferences(
	file: AnalyzedFile,
	mappings: Map<string, string>
): void {
	const blocks = file.blocks.filter((block) => !block.reason);
	const additions = blocks
		.flatMap((block) => block.additions)
		.map((line) => ({ line, reference: quotedPathReference(line.text), matchCount: 0 }));
	const deletions = blocks.flatMap((block) => block.deletions).map((line) => {
		const reference = quotedPathReference(line.text);
		const target = reference ? mappings.get(reference.path) : undefined;
		const matches = !target
			? []
			: additions.filter(
					(candidate) =>
						candidate.reference?.path === target &&
						candidate.reference.quote === reference!.quote &&
						candidate.reference.shell === reference!.shell
				);
		matches.forEach((candidate) => candidate.matchCount++);
		return { line, matches };
	});
	for (const candidate of deletions) {
		if (candidate.matches.length === 1 && candidate.matches[0]!.matchCount === 1) {
			candidate.line.mechanicalReason ||= 'rename';
			candidate.matches[0]!.line.mechanicalReason ||= 'rename';
		}
	}
}

function directRenamedPathReferences(files: AnalyzedFile[]): RenamedPathReference[] {
	return files.flatMap((file) => {
		if (file.status !== 'R') return [];
		const source = file.file.oldPath.replace(/\\/g, '/');
		const target = file.file.newPath.replace(/\\/g, '/');
		const sourceExtension = source.match(/\.[^./]+$/)?.[0].toLowerCase();
		const targetExtension = target.match(/\.[^./]+$/)?.[0].toLowerCase();
		return source !== target && sourceExtension && sourceExtension === targetExtension
			? [{ source, target }]
			: [];
	});
}

function finalizeFiles(files: AnalyzedFile[]): void {
	for (const file of files) {
		const counts: StructuralFile['counts'] = {
			behavior: 0,
			mechanical: 0,
			new: 0,
			deleted: 0
		};
		for (const block of file.blocks) {
			for (const line of block.deletions.concat(block.additions)) {
				const reason = block.reason ?? line.mechanicalReason;
				if (block.reason) line.mechanicalReason ||= block.reason;
				const category: StructuralCategory =
					file.status === 'A'
						? 'new'
						: file.status === 'D'
							? 'deleted'
							: reason
								? 'mechanical'
								: 'behavior';
				line.category = category;
				counts[category]++;
			}
		}
		file.counts = counts;
		file.changedLines = Object.values(counts).reduce((sum, count) => sum + count, 0);
		file.isPureRename = file.status === 'R' && file.changedLines === 0;
	}
}

function analyzeFiles(files: AnalyzedFile[], options: StructuralDiffOptions): void {
	inferIdentifierMappings(files);
	discardConflictingBlockRenames(files);
	inferSymbolMappings(files);
	const references = directRenamedPathReferences(files).concat(
		options.renamedPathReferences ?? []
	);
	const pathReferenceMappings = renamedPathReferenceMappings(references);
	for (const file of files) {
		for (const block of file.blocks) {
			markAlignedMechanicalLines(block, file.identifierMappings, file.symbolMappings);
		}
		markSingleStatementBraceChanges(file);
		markIncludeSeparatorChanges(file);
		markRenamedPathReferences(file, pathReferenceMappings);
	}
	classifyMovedBlocks(files);
	finalizeFiles(files);
}

function fileStatus(file: MrFile): StructuralFile['status'] {
	if (file.newFile) return 'A';
	if (file.deletedFile) return 'D';
	if (file.renamedFile) return 'R';
	return 'M';
}

function parseRange(value: string): { start: number; length: number } {
	const [start, length] = value.split(',');
	return { start: Number(start), length: length === undefined ? 1 : Number(length) };
}

function structuralLineId(
	path: string,
	kind: StructuralLineKind,
	oldNumber: number | null,
	newNumber: number | null,
	text: string
): string {
	return `line:${JSON.stringify([path, kind, oldNumber, newNumber, text])}`;
}

function splitBlocks(lines: StructuralLine[], fileId: string, hunkIndex: number, path: string): ChangeBlock[] {
	const blocks: ChangeBlock[] = [];
	let current: ChangeBlock | null = null;
	const flush = (): void => {
		if (!current) return;
		current.reason = classifyBlock(current, path);
		blocks.push(current);
		current = null;
	};
	for (const line of lines) {
		if (line.kind === 'context') {
			flush();
			continue;
		}
		if (!current) {
			current = {
				id: `${fileId}-hunk-${hunkIndex}-block-${blocks.length}`,
				deletions: [],
				additions: [],
				reason: null
			};
		}
		if (line.kind === 'deletion') current.deletions.push(line);
		else current.additions.push(line);
	}
	flush();
	return blocks;
}

function parseFile(file: MrFile, fileIndex: number): AnalyzedFile {
	const id = `file-${fileIndex}`;
	const status = fileStatus(file);
	const path = file.newPath || file.oldPath;
	const hunks: StructuralHunk[] = [];
	let current: StructuralHunk | null = null;
	let oldNumber = 0;
	let newNumber = 0;

	for (const rawLine of file.diff.split('\n')) {
		const match = rawLine.match(/^@@ -(\d+(?:,\d+)?) \+(\d+(?:,\d+)?) @@(.*)$/);
		if (match) {
			oldNumber = parseRange(match[1]!).start;
			newNumber = parseRange(match[2]!).start;
			current = { id: `${id}-hunk-${hunks.length}`, header: rawLine, lines: [] };
			hunks.push(current);
			continue;
		}
		if (!current) continue;

		const prefix = rawLine.charAt(0);
		const text = rawLine.slice(1);
		if (prefix === ' ') {
			const lineOldNumber = oldNumber++;
			const lineNewNumber = newNumber++;
			current.lines.push({
				id: structuralLineId(path, 'context', lineOldNumber, lineNewNumber, text),
				kind: 'context',
				oldNumber: lineOldNumber,
				newNumber: lineNewNumber,
				text,
				category: null
			});
		} else if (prefix === '-') {
			const lineOldNumber = oldNumber++;
			current.lines.push({
				id: structuralLineId(path, 'deletion', lineOldNumber, null, text),
				kind: 'deletion',
				oldNumber: lineOldNumber,
				newNumber: null,
				text,
				category: status === 'D' ? 'deleted' : 'behavior'
			});
		} else if (prefix === '+') {
			const lineNewNumber = newNumber++;
			current.lines.push({
				id: structuralLineId(path, 'addition', null, lineNewNumber, text),
				kind: 'addition',
				oldNumber: null,
				newNumber: lineNewNumber,
				text,
				category: status === 'A' ? 'new' : 'behavior'
			});
		}
	}

	const blocks = hunks.flatMap((hunk, hunkIndex) =>
		splitBlocks(hunk.lines, id, hunkIndex, path)
	);
	const counts: StructuralFile['counts'] = {
		behavior: 0,
		mechanical: 0,
		new: 0,
		deleted: 0
	};
	for (const block of blocks) {
		const category: StructuralCategory =
			status === 'A' ? 'new' : status === 'D' ? 'deleted' : block.reason ? 'mechanical' : 'behavior';
		for (const line of block.deletions.concat(block.additions)) {
			line.category = category;
			if (block.reason) line.mechanicalReason = block.reason;
			counts[category]++;
		}
	}

	return {
		id,
		file,
		path,
		status,
		hunks,
		counts,
		changedLines: 0,
		isPureRename: false,
		blocks,
		identifierMappings: new Map(),
		symbolMappings: new Map()
	};
}

export function classifyStructuralDiff(
	input: MrFile[],
	options: StructuralDiffOptions = {}
): StructuralDiff {
	const files = input.map(parseFile);
	analyzeFiles(files, options);
	const counts: StructuralDiff['counts'] = {
		behavior: 0,
		mechanical: 0,
		new: 0,
		deleted: 0
	};
	for (const file of files) {
		for (const category of Object.keys(counts) as StructuralCategory[]) {
			counts[category] += file.counts[category];
		}
	}
	const total = counts.behavior + counts.mechanical + counts.new + counts.deleted;
	return { files, counts, total };
}