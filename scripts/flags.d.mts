export interface FlagUse {
  sets: string[];
  reads: string[];
  lists: string[];
}
export function flagNames(): string[];
export function scan(): Record<string, FlagUse>;
