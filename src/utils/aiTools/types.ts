import { Env } from '../../types';

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, any>;
}

export type ToolExecutor = (
    args: Record<string, any>,
    env: Env,
    userKey: string
) => Promise<any>;

