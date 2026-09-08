// Counts real tokens produced through Pi. Pi persists normalized usage on each
// assistant message (plus compaction/branch-summary and optional tool usage) in
// ~/.pi/agent/sessions/**/*.jsonl. Each provider/model pair gets its own
// namespaced ModelKey, so arbitrary current and future Pi models can race
// without being mislabeled as Claude, Codex, or Gemini.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { piModelKey, type PiModelKey } from '@token-derby/shared';
import { piSessionsDir } from '../paths.js';
import { mapWithConcurrency, SCAN_CONCURRENCY } from './pool.js';
import { ScanCache, type FileFold } from './scan-cache.js';
import type { TokenTotals } from './transcripts.js';

export type PiUsageByModel = Map<PiModelKey, Map<string, TokenTotals>>;
export type PiScanOptions = { timeoutMs?: number };

type PiUsageEvent = {
  fingerprint: string;
  model: PiModelKey;
  input: number;
  output: number;
  // Foreground subagent results contain both aggregate usage and a native Pi
  // child session. Once native usage is observed, keep that choice across
  // cleanup; otherwise an unavailable child uses the aggregate as fallback.
  childSessionFile?: string;
  nativeSessionSeen?: boolean;
};

type PiFileState = {
  isSession: boolean;
  sessionId: string | null;
  parentSession: string | null;
  // Persisted after lineage resolution so multi-generation clones retain the
  // same root even after every intermediate ancestor has been cleaned up.
  lineageRoot: string | null;
  // Active requested model inherited at each tree entry. Keeping this in the
  // incremental fold makes summary/tool usage follow parentId correctly after
  // /tree forks rather than whichever branch was appended most recently.
  modelByEntry: Record<string, PiModelKey | null>;
  events: PiUsageEvent[];
};

const UNKNOWN_MODEL = piModelKey('unknown', 'unknown')!;
const inFlightScans = new Map<string, Promise<PiUsageByModel>>();

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Sum Pi usage by exact provider/model and stable session lineage.
 *
 * Session clones/forks copy entries verbatim and name their source in the v3
 * header's `parentSession`. The lineage root path remains available in that
 * header even after the source is deleted, so clone cleanup cannot relabel a
 * conversation and replay its pre-join usage. Nested subagent sessions are
 * rolled into their owning top-level conversation for the optional top-five
 * conversation cap.
 */
export async function sumPiByModelAndConversation(options: PiScanOptions = {}): Promise<PiUsageByModel> {
  const root = path.resolve(piSessionsDir());
  let scan = inFlightScans.get(root);
  if (!scan) {
    scan = scanPiRoot(root);
    inFlightScans.set(root, scan);
    void scan.then(
      () => { if (inFlightScans.get(root) === scan) inFlightScans.delete(root); },
      () => { if (inFlightScans.get(root) === scan) inFlightScans.delete(root); },
    );
  }
  return withTimeout(scan, options.timeoutMs);
}

async function scanPiRoot(root: string): Promise<PiUsageByModel> {
  try {
    await fs.stat(root);
  } catch (err: any) {
    // Pi is optional. A missing session root is an authoritative empty history.
    if (err?.code === 'ENOENT') return new Map();
    throw err;
  }
  // Errors after root discovery propagate so a partial scan cannot become a
  // trustworthy race baseline.
  const files = await listJsonlFiles(root);
  const cache = await ScanCache.open('pi');
  const states = await mapWithConcurrency(files, SCAN_CONCURRENCY, file =>
    cache.readIncremental(file, PI_FOLD),
  );

  const stateByFile = new Map(files.map((file, index) => [path.resolve(file), states[index]!]));
  // Resolve every current file before pruning deleted cache entries. A newly
  // seen descendant can therefore inherit an ancestor root, then carry that
  // root durably after the ancestor disappears.
  files.forEach((file, index) => {
    const state = states[index]!;
    if (state.isSession && !state.lineageRoot) {
      state.lineageRoot = lineageRootFor(path.resolve(file), root, stateByFile);
      cache.updateValue(file, state);
    }
  });

  const seen = new Set<string>();
  const byModel: PiUsageByModel = new Map();
  files.forEach((file, index) => {
    const state = states[index]!;
    if (!state.isSession) return; // ignores unrelated JSONL, including rendered subagent artifacts
    const conversation = conversationId(file, root, stateByFile);
    for (const event of state.events) {
      if (event.childSessionFile) {
        const childFile = resolveSessionReference(event.childSessionFile, file);
        if (stateByFile.get(childFile)?.isSession && !event.nativeSessionSeen) {
          event.nativeSessionSeen = true;
          cache.updateValue(file, state);
        }
        // Once observed, native multi-model attribution remains authoritative
        // after cleanup. If native history was already gone before our first
        // scan, retain the aggregate rather than dropping legitimate usage.
        if (event.nativeSessionSeen) continue;
      }
      // Copies are duplicates only inside one explicit lineage. Two unrelated
      // sessions that happen to persist the same IDs must remain independent.
      const identity = `${conversation}\u0000${event.fingerprint}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      let byConversation = byModel.get(event.model);
      if (!byConversation) {
        byConversation = new Map();
        byModel.set(event.model, byConversation);
      }
      const total = byConversation.get(conversation) ?? { input: 0, output: 0 };
      total.input += event.input;
      total.output += event.output;
      byConversation.set(conversation, total);
    }
  });
  // Conversation lineage and native-vs-aggregate choices affect accounting,
  // so unlike ordinary scan acceleration this metadata must commit before the
  // reading is trusted as a race baseline or heartbeat.
  await cache.save({ required: true });
  return byModel;
}

export async function sumPiTokensByModel(options: PiScanOptions = {}): Promise<Map<PiModelKey, TokenTotals>> {
  const byModelAndConversation = await sumPiByModelAndConversation(options);
  const out = new Map<PiModelKey, TokenTotals>();
  for (const [model, conversations] of byModelAndConversation) {
    const total = { input: 0, output: 0 };
    for (const usage of conversations.values()) {
      total.input += usage.input;
      total.output += usage.output;
    }
    out.set(model, total);
  }
  return out;
}

export async function listPiModelKeys(options: PiScanOptions = {}): Promise<PiModelKey[]> {
  return [...(await sumPiByModelAndConversation(options)).keys()].sort();
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number | undefined): Promise<T> {
  if (timeoutMs === undefined || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(
        new Error(`Pi token scan timed out after ${Math.round(timeoutMs / 1000)}s`),
        { code: 'ETIMEDOUT' },
      ));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

async function listJsonlFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  await collectJsonl(root, out);
  return out.sort();
}

async function collectJsonl(dir: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // pi-subagents writes display/event artifacts here in a different JSONL
      // format. Billable child usage is represented by standard child Pi
      // sessions or the child tool's own native logs, so parsing the rendered
      // artifacts would be both wasteful and prone to double-counting.
      if (entry.name !== 'subagent-artifacts') await collectJsonl(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      out.push(full);
    }
  }
}

function conversationId(
  file: string,
  root: string,
  stateByFile: ReadonlyMap<string, PiFileState>,
): string {
  const lineageRoot = lineageRootFor(path.resolve(file), path.resolve(root), stateByFile);
  return `pi/${createHash('sha256').update(`session:${lineageRoot}`).digest('base64url')}`;
}

function lineageRootFor(
  file: string,
  root: string,
  stateByFile: ReadonlyMap<string, PiFileState>,
): string {
  let current = file;
  const visited = new Set<string>();
  while (!visited.has(current)) {
    visited.add(current);
    const state = stateByFile.get(current);
    if (state?.lineageRoot) return state.lineageRoot;
    if (state?.parentSession) {
      current = resolveSessionReference(state.parentSession, current);
      continue;
    }
    const owner = ownerPathForSession(current, root);
    if (owner !== current) {
      current = owner;
      continue;
    }
    return current;
  }
  // Malformed cyclic lineage must still be deterministic.
  return [...visited].sort()[0]!;
}

function ownerPathForSession(file: string, root: string): string {
  const relative = path.relative(root, file);
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return file;
  const parts = relative.split(path.sep);
  const nested = parts.length > 2 && !parts[1]!.endsWith('.jsonl');
  return nested ? path.join(root, parts[0]!, `${parts[1]!}.jsonl`) : file;
}

function resolveSessionReference(reference: string, fromFile: string): string {
  return path.resolve(path.isAbsolute(reference) ? reference : path.join(path.dirname(fromFile), reference));
}

const PI_FOLD: FileFold<PiFileState> = {
  empty: () => ({
    isSession: false, sessionId: null, parentSession: null, lineageRoot: null, modelByEntry: {}, events: [],
  }),
  append: (acc, lines) => {
    let isSession = acc.isSession;
    let sessionId = acc.sessionId;
    let parentSession = acc.parentSession;
    let lineageRoot = acc.lineageRoot;
    const modelByEntry = { ...acc.modelByEntry };
    const events = [...acc.events];

    for (const line of lines) {
      if (!line.trim()) continue;
      let entry: any;
      try { entry = JSON.parse(line); } catch { continue; }

      if (entry?.type === 'session') {
        isSession = entry.version === 3;
        sessionId = isSession && typeof entry.id === 'string' ? entry.id : null;
        parentSession = isSession && typeof entry.parentSession === 'string' ? entry.parentSession : null;
        // A rewritten file is a new session even if it reuses the path.
        if (!isSession) lineageRoot = null;
        continue;
      }
      if (!isSession) continue;

      const parentModel = typeof entry?.parentId === 'string'
        ? modelByEntry[entry.parentId] ?? null
        : null;
      let activeModel = parentModel;
      if (entry?.type === 'model_change') {
        activeModel = typeof entry.provider === 'string' && typeof entry.modelId === 'string'
          ? piModelKey(entry.provider, entry.modelId)
          : null;
      } else if (entry?.type === 'message' && entry.message?.role === 'assistant') {
        // Keep requested model as branch state. `responseModel` describes only
        // the concrete model that produced this one routed response.
        activeModel = typeof entry.message.provider === 'string' && typeof entry.message.model === 'string'
          ? piModelKey(entry.message.provider, entry.message.model)
          : parentModel;
      }
      if (typeof entry?.id === 'string') modelByEntry[entry.id] = activeModel;

      if (entry?.type === 'message' && entry.message?.role === 'assistant' && entry.message.usage) {
        const responseModel = typeof entry.message.provider === 'string'
          && typeof entry.message.responseModel === 'string'
          && entry.message.responseModel.trim()
          ? piModelKey(entry.message.provider, entry.message.responseModel)
          : null;
        pushUsageEvent(events, entry, line, entry.message.usage, responseModel ?? activeModel);
      } else if (entry?.type === 'message' && entry.message?.role === 'toolResult' && entry.message.usage) {
        const results = childUsageResults(entry.message.details);
        if (results.length > 0) {
          results.forEach((result, index) => {
            pushUsageEvent(
              events,
              entry,
              line,
              result.usage,
              modelFromResult(result.model) ?? activeModel,
              `child:${index}:${result.runId ?? result.sessionFile ?? result.agent ?? ''}`,
              typeof result.sessionFile === 'string' ? result.sessionFile : undefined,
            );
          });
        } else {
          pushUsageEvent(events, entry, line, entry.message.usage, activeModel);
        }
      } else if ((entry?.type === 'compaction' || entry?.type === 'branch_summary') && entry.usage) {
        let usageModel = activeModel;
        // Pi generates a branch summary with the model active on the abandoned
        // branch, then attaches the entry at the navigation target. `fromId`
        // identifies that generating branch; parentId identifies only where
        // future context continues.
        if (entry.type === 'branch_summary' && typeof entry.fromId === 'string') {
          usageModel = modelByEntry[entry.fromId] ?? activeModel;
        }
        pushUsageEvent(events, entry, line, entry.usage, usageModel);
      }
    }

    return { isSession, sessionId, parentSession, lineageRoot, modelByEntry, events };
  },
};

function pushUsageEvent(
  events: PiUsageEvent[],
  entry: any,
  rawLine: string,
  usage: any,
  model: PiModelKey | null,
  fingerprintSuffix?: string,
  childSessionFile?: string,
): void {
  // Pi usage is normalized into disjoint buckets. Fresh input is uncached
  // input plus cache writes; cache reads are passive and excluded. Output
  // already includes reasoning where the provider reports it separately.
  const input = num(usage?.input) + num(usage?.cacheWrite);
  const output = num(usage?.output);
  if (input <= 0 && output <= 0) return;
  const base = usageFingerprint(entry, rawLine);
  events.push({
    fingerprint: fingerprintSuffix ? `${base}\u0000${fingerprintSuffix}` : base,
    model: model ?? UNKNOWN_MODEL,
    input,
    output,
    ...(childSessionFile ? { childSessionFile } : {}),
  });
}

function childUsageResults(details: any): any[] {
  if (!details || !Array.isArray(details.results)) return [];
  return details.results.filter((result: any) => result && typeof result === 'object' && result.usage);
}

function modelFromResult(value: unknown): PiModelKey | null {
  if (typeof value !== 'string') return null;
  const slash = value.indexOf('/');
  if (slash <= 0 || slash === value.length - 1) return null;
  // pi-subagents appends its thinking selector to the launch spec, not to the
  // provider's actual model ID persisted by the child.
  const model = value.slice(slash + 1).replace(/:(?:off|minimal|low|medium|high|xhigh|max)$/, '');
  return piModelKey(value.slice(0, slash), model);
}

function usageFingerprint(entry: any, rawLine: string): string {
  if (typeof entry?.id === 'string' && typeof entry?.timestamp === 'string') {
    const role = entry?.message?.role ?? '';
    return `${entry.id}\u0000${entry.timestamp}\u0000${entry.type ?? ''}\u0000${role}`;
  }
  return createHash('sha256').update(rawLine).digest('base64url');
}
