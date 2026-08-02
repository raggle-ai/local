import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  realpathSync,
  statSync,
  type Dirent,
} from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { latestSessionForWorktree } from "@raggle-ai/local";
import { opencodePath } from "./app";
import type { AiChatClientId } from "./types.ts";

const maxSessionMetaBytes = 2 * 1024 * 1024;
const maxSessionTailBytes = 1024 * 1024;
const maxOpencodeSessionListBytes = 1024 * 1024 * 8;
const execFileAsync = promisify(execFile);

type SessionIndexEntry = {
  id?: string;
  updated_at?: string;
};

type SessionMetaLine = {
  type?: string;
  payload?: {
    id?: string;
    timestamp?: string;
    cwd?: string;
  };
};

type SessionLine = {
  timestamp?: string;
};

type OpencodeSessionListEntry = {
  id?: string;
  updated?: number;
  directory?: string;
};

export type SessionResolverResult = {
  sessionId: string;
  worktree?: string;
};

function codexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function safeRealpath(item: string) {
  try {
    return realpathSync(item);
  } catch {
    return path.resolve(item);
  }
}

function matchesWorktree(candidateWorktree: string, targetWorktree: string) {
  return candidateWorktree === targetWorktree || candidateWorktree.startsWith(`${targetWorktree}${path.sep}`);
}

function readJsonLines<T>(filePath: string) {
  try {
    if (!existsSync(filePath)) return [];

    return readFileSync(filePath, "utf8")
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as T];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

function readFirstLine(filePath: string) {
  let fd: number | undefined;
  try {
    fd = openSync(filePath, "r");
    const chunks: Buffer[] = [];
    let bytesReadTotal = 0;

    while (bytesReadTotal < maxSessionMetaBytes) {
      const buffer = Buffer.alloc(8192);
      const bytesRead = readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;

      const next = buffer.subarray(0, bytesRead);
      const newlineIndex = next.indexOf(10);
      if (newlineIndex >= 0) {
        chunks.push(next.subarray(0, newlineIndex));
        break;
      }

      chunks.push(next);
      bytesReadTotal += bytesRead;
    }

    return Buffer.concat(chunks).toString("utf8");
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function readSessionMeta(filePath: string) {
  const firstLine = readFirstLine(filePath);
  if (!firstLine) return undefined;

  try {
    const parsed = JSON.parse(firstLine) as SessionMetaLine;
    return parsed.type === "session_meta" ? parsed.payload : undefined;
  } catch {
    return undefined;
  }
}

function parseTimestampMs(timestamp?: string) {
  if (!timestamp) return undefined;

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function newestTimestampMs(...timestamps: Array<string | undefined>) {
  return Math.max(...timestamps.flatMap((timestamp) => parseTimestampMs(timestamp) ?? []));
}

function readLastSessionTimestamp(filePath: string) {
  let fd: number | undefined;
  try {
    const stat = statSync(filePath);
    const byteLength = Math.min(stat.size, maxSessionTailBytes);
    const buffer = Buffer.alloc(byteLength);
    fd = openSync(filePath, "r");
    readSync(fd, buffer, 0, byteLength, Math.max(0, stat.size - byteLength));

    const lines = buffer.toString("utf8").trim().split("\n").filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        const parsed = JSON.parse(lines[index]) as SessionLine;
        if (parsed.timestamp) return parsed.timestamp;
      } catch {
        // Keep scanning in case the tail starts mid-line.
      }
    }
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }

  return undefined;
}

function sessionFilesById(dirPath: string) {
  const filesById = new Map<string, string>();

  function visit(currentPath: string) {
    let entries: Dirent[];
    try {
      entries = readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;

      const match = entry.name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (match) filesById.set(match[1], entryPath);
    }
  }

  visit(dirPath);
  return filesById;
}

export function latestCodexSessionForWorktree(worktree: string): SessionResolverResult | undefined {
  const home = codexHome();
  const indexPath = path.join(home, "session_index.jsonl");
  const sessionsPath = path.join(home, "sessions");
  if (!existsSync(indexPath) || !existsSync(sessionsPath)) return undefined;

  const targetWorktree = safeRealpath(worktree);
  const indexedSessionsById = new Map(
    readJsonLines<SessionIndexEntry>(indexPath)
      .filter((entry): entry is SessionIndexEntry & { id: string } => Boolean(entry.id))
      .map((entry) => [entry.id, entry]),
  );
  const filesById = sessionFilesById(sessionsPath);
  let latestSession: { id: string; updatedAtMs: number } | undefined;

  for (const [id, filePath] of filesById.entries()) {
    const meta = readSessionMeta(filePath);
    if (meta?.id !== id || !meta.cwd) continue;

    const sessionWorktree = safeRealpath(meta.cwd);
    if (!matchesWorktree(sessionWorktree, targetWorktree)) continue;

    const updatedAtMs = newestTimestampMs(
      readLastSessionTimestamp(filePath),
      indexedSessionsById.get(id)?.updated_at,
      meta.timestamp,
    );
    if (!Number.isFinite(updatedAtMs)) continue;
    if (!latestSession || updatedAtMs > latestSession.updatedAtMs) latestSession = { id, updatedAtMs };
  }

  return latestSession ? { sessionId: latestSession.id, worktree: targetWorktree } : undefined;
}

async function readOpencodeSessionList() {
  const { stdout } = await execFileAsync(opencodePath(), ["session", "list", "--format", "json"], {
    maxBuffer: maxOpencodeSessionListBytes,
  });
  const parsed = JSON.parse(stdout) as unknown;
  return Array.isArray(parsed) ? (parsed as OpencodeSessionListEntry[]) : [];
}

export async function latestOpencodeSessionIdForWorktree(worktree: string): Promise<SessionResolverResult | undefined> {
  const targetWorktree = safeRealpath(worktree);

  try {
    const latestSession = (await readOpencodeSessionList()).reduce<
      { sessionId: string; updatedAtMs: number; worktree: string } | undefined
    >((latest, session) => {
      const updatedAtMs =
        typeof session.updated === "number" && Number.isFinite(session.updated) ? session.updated : undefined;
      if (!session.id || !session.directory || updatedAtMs === undefined) return latest;

      const sessionWorktree = safeRealpath(session.directory);
      if (!matchesWorktree(sessionWorktree, targetWorktree)) return latest;

      const candidate = { sessionId: session.id, updatedAtMs, worktree: sessionWorktree };
      if (!latest || candidate.updatedAtMs > latest.updatedAtMs) return candidate;
      return latest;
    }, undefined);

    if (latestSession) {
      return {
        sessionId: latestSession.sessionId,
        worktree: latestSession.worktree,
      };
    }
    return undefined;
  } catch {
    const session = await latestSessionForWorktree(worktree).catch(() => undefined);
    return session ? { sessionId: session.id, worktree: session.directory } : undefined;
  }
}

export const sessionResolvers: Partial<
  Record<
    AiChatClientId,
    (worktree: string) => SessionResolverResult | undefined | Promise<SessionResolverResult | undefined>
  >
> = {
  codex: latestCodexSessionForWorktree,
  opencode: latestOpencodeSessionIdForWorktree,
};
