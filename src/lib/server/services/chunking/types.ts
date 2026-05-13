export interface DiffLine {
	type: 'add' | 'del' | 'context';
	content: string;
	oldLine?: number;
	newLine?: number;
}

export interface MovedFrom {
	file: string;
	startLine: number;
	endLine: number;
	matchRatio: number;
}

export interface Hunk {
	id: string;
	file: string;
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
	lines: DiffLine[];
	changeType: 'add' | 'modify' | 'delete' | 'rename';
	renamedFrom?: string;
	binary: boolean;
	addedLines: number;
	removedLines: number;
	movedFrom?: MovedFrom;
}

export interface Chunk {
	id: string;
	index: number;
	title: string;
	rationale: string;
	hunks: Hunk[];
	estimatedMinutes: number;
	primaryFiles: string[];
	tags: ('test' | 'impl')[];
	complexity: number;
	languages: string[];
	modules: string[];
}
