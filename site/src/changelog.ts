import data from './changelog.json';

export type Component = 'site' | 'cli';

export interface ChangelogEntry {
  version: string;   // e.g. "2.12.1"
  date: string;      // ISO "YYYY-MM-DD"
  component: Component;
  changes: string[]; // user-facing bullet lines, at least one
}

export const CHANGELOG = data as ChangelogEntry[];
