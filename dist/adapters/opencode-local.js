"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listVisibleProjects = listVisibleProjects;
exports.latestSessionForWorktree = latestSessionForWorktree;
exports.saveProjectIcon = saveProjectIcon;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_util_1 = require("node:util");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
let databaseSyncCtor;
function trimToNull(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}
function titleCaseWord(value) {
    return value ? value[0].toUpperCase() + value.slice(1) : value;
}
function humanizeProjectName(value) {
    const normalized = value
        .split(/[\s_-]+/)
        .map((part) => part.trim())
        .filter(Boolean);
    return normalized.length ? normalized.map(titleCaseWord).join(" ") : value;
}
function basenameFromWorktree(worktree) {
    return (worktree
        .split(/[\\/]+/)
        .filter(Boolean)
        .at(-1) ?? worktree);
}
function getProjectDisplayName(project) {
    return (trimToNull(project.name) ??
        trimToNull(project.worktree_name) ??
        humanizeProjectName(basenameFromWorktree(project.worktree)));
}
function normalizeWorktreeKey(worktree) {
    const trimmed = worktree.trim();
    if (!trimmed)
        return trimmed;
    if (trimmed === "~")
        return node_os_1.default.homedir();
    if (trimmed.startsWith(`~${node_path_1.default.sep}`))
        return node_path_1.default.resolve(node_os_1.default.homedir(), trimmed.slice(2));
    return node_path_1.default.resolve(trimmed);
}
function isSameOrChildDirectory(candidate, parent) {
    const candidateKey = normalizeWorktreeKey(candidate);
    const parentKey = normalizeWorktreeKey(parent);
    return candidateKey === parentKey || candidateKey.startsWith(`${parentKey}${node_path_1.default.sep}`);
}
function opencodeDataPath() {
    return node_path_1.default.join(process.env.XDG_DATA_HOME ?? node_path_1.default.join(node_os_1.default.homedir(), ".local", "share"), "opencode");
}
function legacyMacDataPath() {
    return node_path_1.default.join(node_os_1.default.homedir(), "Library", "Application Support", "opencode");
}
function safeChannel(input) {
    return input.replace(/[^a-zA-Z0-9._-]/g, "-");
}
function fallbackDatabasePath() {
    const file = process.env.OPENCODE_DB;
    if (file)
        return file === ":memory:" || node_path_1.default.isAbsolute(file) ? file : node_path_1.default.join(opencodeDataPath(), file);
    const channel = process.env.OPENCODE_CHANNEL ?? "latest";
    const filename = ["latest", "beta"].includes(channel) || process.env.OPENCODE_DISABLE_CHANNEL_DB === "true"
        ? "opencode.db"
        : `opencode-${safeChannel(channel)}.db`;
    const candidates = process.platform === "darwin"
        ? [node_path_1.default.join(opencodeDataPath(), filename), node_path_1.default.join(legacyMacDataPath(), filename)]
        : [node_path_1.default.join(opencodeDataPath(), filename)];
    return candidates.find((candidate) => (0, node_fs_1.existsSync)(candidate)) ?? candidates[0];
}
function desktopStatePaths() {
    if (process.platform !== "darwin")
        return [];
    const base = node_path_1.default.join(node_os_1.default.homedir(), "Library", "Application Support");
    return [
        node_path_1.default.join(base, "ai.opencode.desktop", "opencode.global.dat"),
        node_path_1.default.join(base, "ai.opencode.desktop.dev", "opencode.global.dat"),
    ];
}
function opencodeWorktreeRoots() {
    const roots = [node_path_1.default.join(opencodeDataPath(), "worktree"), node_path_1.default.join(legacyMacDataPath(), "worktree")];
    return [...new Set(roots.map((root) => node_path_1.default.resolve(root)))];
}
function isOpencodeWorktreeDirectory(directory) {
    const resolved = node_path_1.default.resolve(directory);
    return opencodeWorktreeRoots().some((root) => resolved === root || resolved.startsWith(`${root}${node_path_1.default.sep}`));
}
function newerProject(a, b) {
    return (b.time?.updated ?? 0) > (a.time?.updated ?? 0) ? b : a;
}
function maxNumber(...values) {
    const filtered = values.filter((value) => typeof value === "number");
    return filtered.length ? Math.max(...filtered) : undefined;
}
function hasDesktopIcon(project) {
    return project?.icon?.url || project?.icon?.override ? 1 : 0;
}
function mergedName(project, synced) {
    return getProjectDisplayName({
        ...project,
        worktree_name: project.worktree_name ?? synced?.name ?? null,
    });
}
function visibleFromProject(project, synced) {
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
function visibleFromSessionOnly(row, synced) {
    return {
        id: row.id,
        worktree: row.directory,
        name: mergedName({
            worktree: row.directory,
            name: null,
            worktree_name: row.worktree_name,
        }, synced),
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
function visibleFromDesktopOnly(worktree, synced) {
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
function sqlLiteral(value) {
    if (value === null)
        return "null";
    if (typeof value === "number" || typeof value === "bigint")
        return String(value);
    if (value instanceof Uint8Array)
        return `x'${Buffer.from(value).toString("hex")}'`;
    return `'${value.replace(/'/g, "''")}'`;
}
function bind(query, args) {
    let index = 0;
    return query.replace(/\?/g, () => sqlLiteral(args[index++] ?? null));
}
function createSqliteCliDatabase(file) {
    const read = async (query, args) => {
        const { stdout } = await execFileAsync("sqlite3", ["-json", file, bind(query, args)]);
        const output = stdout.trim();
        return output ? JSON.parse(output) : [];
    };
    const write = async (query, args) => {
        await execFileAsync("sqlite3", [file, bind(query, args)]);
    };
    return {
        prepare(query) {
            return {
                all(...args) {
                    return read(query, args);
                },
                run(...args) {
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
            ({ DatabaseSync: databaseSyncCtor } = await Promise.resolve().then(() => __importStar(require("node:sqlite"))));
        }
        catch (error) {
            const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
            const message = error instanceof Error ? error.message : String(error ?? "");
            const missingNodeSqlite = message.includes("node:sqlite") &&
                (message.includes("No such built-in module") ||
                    message.includes("Cannot find module") ||
                    message.includes("Cannot find package"));
            if (code !== "ERR_UNKNOWN_BUILTIN_MODULE" && code !== "ERR_MODULE_NOT_FOUND" && !missingNodeSqlite) {
                throw error;
            }
            databaseSyncCtor = class SqliteCliDatabase {
                constructor(file) {
                    this.database = createSqliteCliDatabase(file);
                }
                prepare(query) {
                    return this.database.prepare(query);
                }
            };
        }
    }
    return databaseSyncCtor;
}
async function createQueryClient() {
    const DatabaseSync = await getDatabaseSync();
    if (!DatabaseSync) {
        throw new Error("Could not load a SQLite client");
    }
    const database = new DatabaseSync(fallbackDatabasePath());
    return {
        async all(query, args = []) {
            return (await database.prepare(query).all(...args));
        },
        async run(query, args = []) {
            await database.prepare(query).run(...args);
        },
    };
}
function queryVisibleProjects(query) {
    return query.all([
        "select id, worktree, name,",
        "(select nullif(w.name, '') from workspace w where w.directory = project.worktree order by rowid desc limit 1) as worktree_name,",
        "(select nullif(s.title, '') from session s where s.project_id = project.id and coalesce(s.directory, project.worktree) = project.worktree and s.parent_id is null and s.time_archived is null order by coalesce(s.time_updated, s.time_created) desc limit 1) as latest_session_title,",
        "icon_color, json_extract(commands, '$.start') as startup_command,",
        "time_updated, coalesce(json_array_length(sandboxes), 0) as sandbox_count,",
        "case when icon_url is not null and icon_url != '' then 1 else 0 end as has_icon",
        "from project",
        "where worktree != '/'",
        "order by coalesce(time_updated, 0) desc, coalesce(name, worktree) asc",
    ].join(" "));
}
function querySessionOnlyProjects(query) {
    return query
        .all([
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
    ].join(" "))
        .then((rows) => rows.filter((row) => !isOpencodeWorktreeDirectory(row.directory)));
}
function readDesktopProjects() {
    const opened = [];
    const synced = new Map();
    for (const file of desktopStatePaths()) {
        if (!(0, node_fs_1.existsSync)(file))
            continue;
        try {
            const raw = JSON.parse((0, node_fs_1.readFileSync)(file, "utf8"));
            const server = raw.server ? JSON.parse(raw.server) : undefined;
            for (const worktree of (server?.projects?.local ?? [])
                .map((item) => item.worktree?.trim())
                .filter((item) => Boolean(item && item !== "/"))) {
                opened.push(worktree);
            }
            const globalSync = raw["globalSync.project"] ? JSON.parse(raw["globalSync.project"]) : undefined;
            for (const project of globalSync?.value ?? []) {
                const worktree = project.worktree?.trim();
                if (!worktree || worktree === "/")
                    continue;
                const key = normalizeWorktreeKey(worktree);
                const existing = synced.get(key);
                synced.set(key, existing ? newerProject(existing, project) : project);
            }
        }
        catch {
            // Ignore unreadable desktop state files.
        }
    }
    return { opened: [...new Set(opened)], synced };
}
async function listVisibleProjects() {
    const query = await createQueryClient();
    const [desktop, projects, sessionOnly] = await Promise.all([
        Promise.resolve(readDesktopProjects()),
        queryVisibleProjects(query),
        querySessionOnlyProjects(query),
    ]);
    const projectByWorktree = new Map(projects.map((project) => [normalizeWorktreeKey(project.worktree), project]));
    const sessionOnlyByDirectory = new Map(sessionOnly.map((row) => [normalizeWorktreeKey(row.directory), row]));
    const visible = [];
    const seen = new Set();
    const push = (worktree) => {
        const key = normalizeWorktreeKey(worktree);
        if (seen.has(key))
            return;
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
    for (const worktree of desktop.opened)
        push(worktree);
    const remaining = [
        ...projects.map((project) => visibleFromProject(project, desktop.synced.get(normalizeWorktreeKey(project.worktree)))),
        ...sessionOnly.map((row) => visibleFromSessionOnly(row, desktop.synced.get(normalizeWorktreeKey(row.directory)))),
    ]
        .filter((project) => !seen.has(normalizeWorktreeKey(project.worktree)))
        .sort((a, b) => (b.time_updated ?? 0) - (a.time_updated ?? 0) || (a.name ?? a.worktree).localeCompare(b.name ?? b.worktree));
    return [...visible, ...remaining];
}
async function latestSessionForWorktree(worktree) {
    const query = await createQueryClient();
    const worktreeKey = normalizeWorktreeKey(worktree);
    const sessions = await query.all([
        "select id, directory, coalesce(time_updated, time_created) as time_updated",
        "from session",
        "where directory != '/'",
        "and (directory = ? or directory like ?)",
        "and parent_id is null",
        "and time_archived is null",
        "order by coalesce(time_updated, time_created) desc, id desc",
    ].join(" "), [worktreeKey, `${worktreeKey}${node_path_1.default.sep}%`]);
    return sessions.find((session) => isSameOrChildDirectory(session.directory, worktree));
}
async function saveProjectIcon(worktree, icon) {
    const query = await createQueryClient();
    await query.run("update project set icon_url = ? where worktree = ?", [icon, worktree]);
}
