import { z } from 'zod';
import { getSetting, setSetting } from '../settings/app_settings';
import type { TaskName } from './tasks';

export const TaskModelOverrideSchema = z.object({
	task: z.string(),
	endpoint: z.string().url().optional(),
	model: z.string().min(1).optional(),
	headers: z.record(z.string()).optional()
});

export type TaskModelOverride = z.infer<typeof TaskModelOverrideSchema>;

export const TaskConfigSchema = z.object({
	overrides: z.array(TaskModelOverrideSchema).default([])
});

export type TaskConfig = z.infer<typeof TaskConfigSchema>;

const KEY = 'llm.task_config';

export async function getTaskConfig(): Promise<TaskConfig> {
	const value = await getSetting<unknown>(KEY);
	if (!value) return { overrides: [] };
	const parsed = TaskConfigSchema.safeParse(value);
	return parsed.success ? parsed.data : { overrides: [] };
}

export async function setTaskConfig(config: TaskConfig): Promise<void> {
	await setSetting(KEY, config);
}

export async function getTaskOverride(task: TaskName): Promise<TaskModelOverride | null> {
	const config = await getTaskConfig();
	return config.overrides.find((o) => o.task === task) ?? null;
}
