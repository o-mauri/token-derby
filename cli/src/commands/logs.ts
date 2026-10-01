import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { logFile } from '../paths.js';

const DEFAULT_TAIL_LINES = 50;

/** Reads `--tail [n]`, defaulting to 50 lines when the count is absent or unparseable. */
function tailCount(argv: string[]): number | null {
  const i = argv.indexOf('--tail');
  if (i === -1) return null;
  const n = Number(argv[i + 1]);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_TAIL_LINES;
}

export async function logsCommand(argv: string[]): Promise<number> {
  const file = logFile();

  if (!existsSync(file)) {
    console.log(`No log file yet — it appears at ${file} the first time a command runs.`);
    return 0;
  }

  console.log(file);

  const n = tailCount(argv);
  if (n === null) return 0;

  const lines = (await fs.readFile(file, 'utf8')).split('\n').filter(l => l.length > 0);
  console.log('');
  for (const line of lines.slice(-n)) console.log(line);
  return 0;
}
