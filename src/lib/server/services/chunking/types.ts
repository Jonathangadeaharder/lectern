export interface DiffLine {
	type: 'add' | 'del' | 'context';
	content: string;
	oldLine?: number;
	newLine?: number;
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
}
