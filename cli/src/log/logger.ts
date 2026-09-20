import * as fs from 'node:fs';
import { logDir, logFile } from '../paths.js';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

// Logging is always on, so a credential must never be able to reach the file by
// accident. Call sites avoid passing them; this is the second line of defence.
const SECRET_KEY = /token|secret|authorization|credential|password/i;

export function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = SECRET_KEY.test(key) ? '[redacted]' : value;
  }
  return out;
}

export function formatLine(at: Date, level: LogLevel, event: string, fields?: Record<string, unknown>): string {
  const body = fields && Object.keys(fields).length > 0 ? ` ${JSON.stringify(redact(fields))}` : '';
  return `${at.toISOString()} ${level.padEnd(5)} ${event}${body}\n`;
}

const MAX_BYTES = 2_000_000;
/** token-derby.log plus .1 .. .4 — capped at roughly 10MB in total. */
const MAX_FILES = 5;

// Size of the current file, tracked in-process so a stat isn't needed per line.
let currentBytes: number | null = null;
// Debug logging must never be the reason a command fails. One write failure
// (unwritable home, full disk) retires the logger for the rest of the process
// rather than throwing, or retrying a doomed syscall on every heartbeat.
let disabled = false;

function rotate(): void {
  const base = logFile();
  fs.rmSync(`${base}.${MAX_FILES - 1}`, { force: true });
  for (let i = MAX_FILES - 2; i >= 1; i--) {
    if (fs.existsSync(`${base}.${i}`)) fs.renameSync(`${base}.${i}`, `${base}.${i + 1}`);
  }
  if (fs.existsSync(base)) fs.renameSync(base, `${base}.1`);
  currentBytes = 0;
}

function write(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
  if (disabled) return;
  try {
    append(level, event, fields);
  } catch {
    disabled = true;
  }
}

function append(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
  const line = formatLine(new Date(), level, event, fields);
  const bytes = Buffer.byteLength(line);
  fs.mkdirSync(logDir(), { recursive: true });
  if (currentBytes === null) {
    currentBytes = fs.existsSync(logFile()) ? fs.statSync(logFile()).size : 0;
  }
  // A single line larger than the budget rolls once and then stays put, rather
  // than rolling an empty file on every subsequent write.
  if (currentBytes > 0 && currentBytes + bytes > MAX_BYTES) rotate();
  fs.appendFileSync(logFile(), line, 'utf8');
  currentBytes += bytes;
}

export function logInfo(event: string, fields?: Record<string, unknown>): void {
  write('INFO', event, fields);
}

export function logWarn(event: string, fields?: Record<string, unknown>): void {
  write('WARN', event, fields);
}

export function logError(event: string, fields?: Record<string, unknown>): void {
  write('ERROR', event, fields);
}

export function _resetLoggerForTests(): void {
  currentBytes = null;
  disabled = false;
}
