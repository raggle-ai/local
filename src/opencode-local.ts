import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type SqlValue = string | number | bigint | Uint8Array | null;

type QueryClient = {
  all<T>(query: string, args?: SqlValue[]): Promise<T[]>;
  run(query: string, args?: SqlValue[]): Promise<void>;
};

type DatabaseLike = {
  prepare(query: string): {
    all(...args: SqlValue[]): unknown;
    run(...args: SqlValue[]): unknown;
  };
};

type DatabaseSyncConstructor = new (file: string) => DatabaseLike;

type ProjectRow = {
  id: string;
  worktree: string;
  name?: string | null;
  worktree_name?: string | null;
  latest_session_title?: string | null;
  icon_color?: string | null;
  startup_command?: string | null;
  time_updated?: number | null;
  sandbox_count?: number | null;
  has_icon?: number | null;
};

export type VisibleProjectRow = ProjectRow & {
  kind: "project" | "session_only";
};

type SessionDirectoryRow = {
  id: string;
  directory: string;
  worktree_name?: string | null;
  latest_session_title?: string | null;
  time_updated?: number | null;
};

export type LatestSessionRow = {
  id: string;
  directory: string;
  time_updated?: number | null;
};

type DesktopProject = {
  id?: string;
  worktree?: string;
  name?: string;
  icon?: {
    url?: string;
    override?: string;
    color?: string;
  };
  commands?: {
    start?: string;
  };
  time?: {
    updated?: number;
  };
  sandboxes?: string[];
};

type DesktopState = {
  opened: string[];
  synced: Map<string, DesktopProject>;
};

let databaseSyncCtor: DatabaseSyncConstructor | undefined;

function trimToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function titleCaseWord(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function humanizeProjectName(value: string) {
  const normalized = value
    .split(/[\s_-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return normalized.length ? normalized.map(titleCaseWord).join(" ") : value;
}

function basenameFromWorktree(worktree: string) {
  return (
    worktree
      .split(/[\\/]+/)
      .filter(Boolean)
      .at(-1) ?? worktree
  );
}

function getProjectDisplayName(project: { worktree: string; name?: string | null; worktree_name?: string | null }) {
  return (
    trimToNull(project.name) ??
    trimToNull(project.worktree_name) ??
    humanizeProjectName(basenameFromWorktree(project.worktree))
  );
}

function normalizeWorktreeKey(worktree: string) {
  const trimmed = worktree.trim();
  if (!trimmed) return trimmed;
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith(`~${path.sep}`)) return path.resolve(os.homedir(), trimmed.slice(2));
  return path.resolve(trimmed);
}

function isSameOrChildDirectory(candidate: string, parent: string) {
  const candidateKey = normalizeWorktreeKey(candidate);
  const parentKey = normalizeWorktreeKey(parent);
  return candidateKey === parentKey || candidateKey.startsWith(`${parentKey}${path.sep}`);
}

function opencodeDataPath() {
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "opencode");
}

function legacyMacDataPath() {
  return path.join(os.homedir(), "Library", "Application Support", "opencode");
}

function safeChannel(input: string) {
  return input.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function fallbackDatabasePath() {
  const file = process.env.OPENCODE_DB;
  if (file) return file === ":memory:" || path.isAbsolute(file) ? file : path.join(opencodeDataPath(), file);

  const channel = process.env.OPENCODE_CHANNEL ?? "latest";
  const filename =
    ["latest", "beta"].includes(channel) || process.env.OPENCODE_DISABLE_CHANNEL_DB === "true"
      ? "opencode.db"
      : `opencode-${safeChannel(channel)}.db`;
  const candidates =
    process.platform === "darwin"
      ? [path.join(opencodeDataPath(), filename), path.join(legacyMacDataPath(), filename)]
      : [path.join(opencodeDataPath(), filename)];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function desktopStatePaths() {
  if (process.platform !== "darwin") return [];

  const base = path.join(os.homedir(), "Library", "Application Support");
  return [
    path.join(base, "ai.opencode.desktop", "opencode.global.dat"),
    path.join(base, "ai.opencode.desktop.dev", "opencode.global.dat"),
  ];
}

function opencodeWorktreeRoots() {
  const roots = [path.join(opencodeDataPath(), "worktree"), path.join(legacyMacDataPath(), "worktree")];
  return [...new Set(roots.map((root) => path.resolve(root)))];
}

function isOpencodeWorktreeDirectory(directory: string) {
  const resolved = path.resolve(directory);
  return opencodeWorktreeRoots().some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
}

function newerProject(a: DesktopProject, b: DesktopProject) {
  return (b.time?.updated ?? 0) > (a.time?.updated ?? 0) ? b : a;
}

function maxNumber(...values: Array<number | null | undefined>) {
  const filtered = values.filter((value): value is number => typeof value === "number");
  return filtered.length ? Math.max(...filtered) : undefined;
}

function hasDesktopIcon(project?: DesktopProject) {
  return project?.icon?.url || project?.icon?.override ? 1 : 0;
}

function mergedName(project: Pick<ProjectRow, "worktree" | "name" | "worktree_name">, synced?: DesktopProject) {
  return getProjectDisplayName({
    ...project,
    worktree_name: project.worktree_name ?? synced?.name ?? null,
  });
}

function visibleFromProject(project: ProjectRow, synced?: DesktopProject): VisibleProjectRow {
  return {
    ...project,
    name: mergedName(project, synced),
    worktree_name: project.worktree_name ?? trimToNull(synced?.name),
    icon_color: project.icon_color ?? synced?.icon?.color,
    startup_command: project.startup_command ?? trimToNull(synced?.commands?.start),
    time_updated: maxNumber(project.time_updated, synced?.time?.updated),
    sandbox_count: maxNumber(project.sandbox_count, synced?.sandboxes?.length) ?? 0,
    has_icon: maxNumber(project.has_icon, hasDesktopIcon(synced)) ?? 0,
    kind: "project",
  };
}

function visibleFromSessionOnly(row: SessionDirectoryRow, synced?: DesktopProject): VisibleProjectRow {
  return {
    id: row.id,
    worktree: row.directory,
    name: mergedName(
      {
        worktree: row.directory,
        name: null,
        worktree_name: row.worktree_name,
      },
      synced,
    ),
    worktree_name: row.worktree_name ?? trimToNull(synced?.name),
    latest_session_title: row.latest_session_title,
    icon_color: synced?.icon?.color,
    startup_command: trimToNull(synced?.commands?.start),
    time_updated: maxNumber(row.time_updated, synced?.time?.updated),
    sandbox_count: synced?.sandboxes?.length ?? 0,
    has_icon: hasDesktopIcon(synced),
    kind: "session_only",
  };
}

function visibleFromDesktopOnly(worktree: string, synced?: DesktopProject): VisibleProjectRow {
  return {
    id: synced?.id?.trim() || `desktop:${worktree}`,
    worktree,
    name: mergedName({ worktree, name: null, worktree_name: null }, synced),
    worktree_name: trimToNull(synced?.name),
    latest_session_title: null,
    icon_color: synced?.icon?.color,
    startup_command: trimToNull(synced?.commands?.start),
    time_updated: synced?.time?.updated,
    sandbox_count: synced?.sandboxes?.length ?? 0,
    has_icon: hasDesktopIcon(synced),
    kind: "project",
  };
}

function sqlLiteral(value: SqlValue) {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (value instanceof Uint8Array) return `x'${Buffer.from(value).toString("hex")}'`;
  return `'${value.replace(/'/g, "''")}'`;
}

function bind(query: string, args: SqlValue[]) {
  let index = 0;
  return query.replace(/\?/g, () => sqlLiteral(args[index++] ?? null));
}

function createSqliteCliDatabase(file: string) {
  const read = async (query: string, args: SqlValue[]) => {
    const { stdout } = await execFileAsync("sqlite3", ["-json", file, bind(query, args)]);
    const output = stdout.trim();
    return output ? JSON.parse(output) : [];
  };

  const write = async (query: string, args: SqlValue[]) => {
    await execFileAsync("sqlite3", [file, bind(query, args)]);
  };

  return {
    prepare(query: string) {
      return {
        all(...args: SqlValue[]) {
          return read(query, args);
        },
        run(...args: SqlValue[]) {
          return write(query, args);
        },
      };
    },
    close() {
      return undefined;
    },
  };
}

async function getDatabaseSync() {
  if (!databaseSyncCtor) {
    try {
      ({ DatabaseSync: databaseSyncCtor } = await import("node:sqlite"));
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      const message = error instanceof Error ? error.message : String(error ?? "");
      const missingNodeSqlite =
        message.includes("node:sqlite") &&
        (message.includes("No such built-in module") ||
          message.includes("Cannot find module") ||
          message.includes("Cannot find package"));
      if (code !== "ERR_UNKNOWN_BUILTIN_MODULE" && code !== "ERR_MODULE_NOT_FOUND" && !missingNodeSqlite) {
        throw error;
      }

      databaseSyncCtor = class SqliteCliDatabase implements DatabaseLike {
        private readonly database;

        constructor(file: string) {
          this.database = createSqliteCliDatabase(file);
        }

        prepare(query: string) {
          return this.database.prepare(query);
        }
      };
    }
  }

  return databaseSyncCtor;
}

async function createQueryClient(): Promise<QueryClient> {
  const DatabaseSync = await getDatabaseSync();
  if (!DatabaseSync) {
    throw new Error("Could not load a SQLite client");
  }
  const database = new DatabaseSync(fallbackDatabasePath());

  return {
    async all<T>(query: string, args: SqlValue[] = []) {
      return (await database.prepare(query).all(...args)) as T[];
    },
    async run(query: string, args: SqlValue[] = []) {
      await database.prepare(query).run(...args);
    },
  };
}

function queryVisibleProjects(query: QueryClient) {
  return query.all<ProjectRow>(
    [
      "select id, worktree, name,",
      "(select nullif(w.name, '') from workspace w where w.directory = project.worktree order by rowid desc limit 1) as worktree_name,",
      "(select nullif(s.title, '') from session s where s.project_id = project.id and coalesce(s.directory, project.worktree) = project.worktree and s.parent_id is null and s.time_archived is null order by coalesce(s.time_updated, s.time_created) desc limit 1) as latest_session_title,",
      "icon_color, json_extract(commands, '$.start') as startup_command,",
      "time_updated, coalesce(json_array_length(sandboxes), 0) as sandbox_count,",
      "case when icon_url is not null and icon_url != '' then 1 else 0 end as has_icon",
      "from project",
      "where worktree != '/'",
      "order by coalesce(time_updated, 0) desc, coalesce(name, worktree) asc",
    ].join(" "),
  );
}

function querySessionOnlyProjects(query: QueryClient) {
  return query
    .all<SessionDirectoryRow>(
      [
        "select min(id) as id, directory,",
        "(select nullif(w.name, '') from workspace w where w.directory = s1.directory order by rowid desc limit 1) as worktree_name,",
        "(select nullif(s2.title, '') from session s2 where s2.directory = s1.directory and s2.parent_id is null and s2.time_archived is null order by coalesce(s2.time_updated, s2.time_created) desc limit 1) as latest_session_title,",
        "max(coalesce(time_updated, time_created)) as time_updated",
        "from session s1",
        "where directory != '/'",
        "and parent_id is null",
        "and time_archived is null",
        "and not exists (select 1 from project p where p.worktree = s1.directory)",
        "group by directory",
        "order by max(coalesce(time_updated, time_created)) desc, directory asc",
      ].join(" "),
    )
    .then((rows) => rows.filter((row) => !isOpencodeWorktreeDirectory(row.directory)));
}

function readDesktopProjects(): DesktopState {
  const opened: string[] = [];
  const synced = new Map<string, DesktopProject>();

  for (const file of desktopStatePaths()) {
    if (!existsSync(file)) continue;

    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, string> & {
        server?: string;
      };
      const server = raw.server ? JSON.parse(raw.server) : undefined;

      for (const worktree of (server?.projects?.local ?? [])
        .map((item: { worktree?: string }) => item.worktree?.trim())
        .filter((item: string | undefined): item is string => Boolean(item && item !== "/"))) {
        opened.push(worktree);
      }

      const globalSync = raw["globalSync.project"] ? JSON.parse(raw["globalSync.project"]) : undefined;
      for (const project of globalSync?.value ?? []) {
        const worktree = project.worktree?.trim();
        if (!worktree || worktree === "/") continue;

        const key = normalizeWorktreeKey(worktree);
        const existing = synced.get(key);
        synced.set(key, existing ? newerProject(existing, project) : project);
      }
    } catch {
      // Ignore unreadable desktop state files.
    }
  }

  return { opened: [...new Set(opened)], synced };
}

export async function listVisibleProjects() {
  const query = await createQueryClient();
  const [desktop, projects, sessionOnly] = await Promise.all([
    Promise.resolve(readDesktopProjects()),
    queryVisibleProjects(query),
    querySessionOnlyProjects(query),
  ]);

  const projectByWorktree = new Map(projects.map((project) => [normalizeWorktreeKey(project.worktree), project]));
  const sessionOnlyByDirectory = new Map(sessionOnly.map((row) => [normalizeWorktreeKey(row.directory), row]));
  const visible: VisibleProjectRow[] = [];
  const seen = new Set<string>();

  const push = (worktree: string) => {
    const key = normalizeWorktreeKey(worktree);
    if (seen.has(key)) return;

    const project = projectByWorktree.get(key);
    if (project) {
      visible.push(visibleFromProject(project, desktop.synced.get(key)));
      seen.add(key);
      return;
    }

    const sessionProject = sessionOnlyByDirectory.get(key);
    if (sessionProject) {
      visible.push(visibleFromSessionOnly(sessionProject, desktop.synced.get(key)));
      seen.add(key);
      return;
    }

    visible.push(visibleFromDesktopOnly(desktop.synced.get(key)?.worktree ?? worktree, desktop.synced.get(key)));
    seen.add(key);
  };

  for (const worktree of desktop.opened) push(worktree);

  const remaining = [
    ...projects.map((project) =>
      visibleFromProject(project, desktop.synced.get(normalizeWorktreeKey(project.worktree))),
    ),
    ...sessionOnly.map((row) => visibleFromSessionOnly(row, desktop.synced.get(normalizeWorktreeKey(row.directory)))),
  ]
    .filter((project) => !seen.has(normalizeWorktreeKey(project.worktree)))
    .sort(
      (a, b) =>
        (b.time_updated ?? 0) - (a.time_updated ?? 0) || (a.name ?? a.worktree).localeCompare(b.name ?? b.worktree),
    );

  return [...visible, ...remaining];
}

export async function latestSessionForWorktree(worktree: string) {
  const query = await createQueryClient();
  const worktreeKey = normalizeWorktreeKey(worktree);
  const sessions = await query.all<LatestSessionRow>(
    [
      "select id, directory, coalesce(time_updated, time_created) as time_updated",
      "from session",
      "where directory != '/'",
      "and (directory = ? or directory like ?)",
      "and parent_id is null",
      "and time_archived is null",
      "order by coalesce(time_updated, time_created) desc, id desc",
    ].join(" "),
    [worktreeKey, `${worktreeKey}${path.sep}%`],
  );

  return sessions.find((session) => isSameOrChildDirectory(session.directory, worktree));
}

export async function saveProjectIcon(worktree: string, icon: string) {
  const query = await createQueryClient();
  await query.run("update project set icon_url = ? where worktree = ?", [icon, worktree]);
}
