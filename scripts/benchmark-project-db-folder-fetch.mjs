import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { loadImportedRepositoriesFromRows, loadLocalProjects, scanCloneDirectoryRepositories } from "../dist/index.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultExportPath = path.join(packageRoot, "data", "projects-export.json");

function parseArgs(argv) {
  const options = {
    cloneDirectory: process.env.RAGGLE_CLONE_DIRECTORY,
    hostname: process.env.RAGGLE_DEVICE_HOSTNAME ?? os.hostname(),
    limit: undefined,
    force: false,
    cachePath: process.env.RAGGLE_CLONE_INDEX_CACHE,
    exportPath: defaultExportPath,
    subpathMarkers: [],
    configFiles: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--clone-directory" && next) {
      options.cloneDirectory = next;
      index += 1;
      continue;
    }

    if (arg === "--hostname" && next) {
      options.hostname = next;
      index += 1;
      continue;
    }

    if (arg === "--limit" && next) {
      const limit = Number.parseInt(next, 10);
      if (Number.isFinite(limit) && limit > 0) options.limit = limit;
      index += 1;
      continue;
    }

    if (arg === "--cache-path" && next) {
      options.cachePath = next;
      index += 1;
      continue;
    }

    if (arg === "--export-path" && next) {
      options.exportPath = next;
      index += 1;
      continue;
    }

    if (arg === "--subpath-marker" && next) {
      options.subpathMarkers.push(next);
      index += 1;
      continue;
    }

    if (arg === "--config-file" && next) {
      options.configFiles.push(next);
      index += 1;
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log(`Usage: npm run bench:projects-db -- [options]

Fetch projects from a Turso/libSQL database using PROJECTS_DB_URL and
PROJECTS_DB_TOKEN, then benchmark local folder discovery and project resolution.

Options:
  --clone-directory <path>  Folder containing local repository clones.
  --hostname <name>         Device hostname used to infer clone_directory.
  --limit <count>           Limit project rows fetched from Turso.
  --cache-path <path>       Optional clone index cache path.
  --export-path <path>      Where to write the fetched rows (default: data/projects-export.json).
  --subpath-marker <file>   Marker file that makes a folder an automatic subpath
                            root (repeatable), e.g. --subpath-marker _schema.json.
  --config-file <file>      Extra repo config file name checked before the
                            raggle.json + index.json defaults (repeatable).
  --force                   Ignore clone index cache and rescan.

The fetched rows are exported as JSON so bench:data can rerun folder
discovery from the local file without touching Turso.
`);
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function tursoPipelineUrl(input) {
  return input.replace(/^libsql:/, "https:").replace(/\/$/, "") + "/v2/pipeline";
}

function quoteSql(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function cellValue(cell) {
  return cell?.value ?? null;
}

function parseJsonCell(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function execute(endpoint, token, sql) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      requests: [{ type: "execute", stmt: { sql } }, { type: "close" }],
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Turso query failed with ${response.status}: ${JSON.stringify(body)}`);
  }

  return body.results[0].response.result;
}

async function inferCloneDirectory(endpoint, token, hostname) {
  const result = await execute(
    endpoint,
    token,
    [
      "select clone_directory from devices",
      `where hostname = ${quoteSql(hostname)} or name = ${quoteSql(hostname)}`,
      "order by updated_at desc limit 1",
    ].join(" "),
  );

  return cellValue(result.rows[0]?.[0]);
}

async function fetchProjectRows(endpoint, token, limit) {
  const limitClause = limit ? ` limit ${limit}` : "";
  const result = await execute(
    endpoint,
    token,
    [
      "select url, name, description, tags_json, folders_json, subpaths_json,",
      "all_subpath, clone_path_template, remove_path_from_name",
      "from projects",
      "where deleted_at is null or deleted_at = ''",
      `order by updated_at desc${limitClause}`,
    ].join(" "),
  );

  return result.rows.map((row) => ({
    url: cellValue(row[0]),
    name: cellValue(row[1]),
    description: cellValue(row[2]),
    tags: parseJsonCell(cellValue(row[3]), []),
    folders: parseJsonCell(cellValue(row[4]), []),
    subpaths: parseJsonCell(cellValue(row[5]), []),
    allSubpath: Boolean(cellValue(row[6])),
    clonePathTemplate: cellValue(row[7]),
    removePathFromName: Boolean(cellValue(row[8])),
  }));
}

function timed(label, callback) {
  const startedAt = performance.now();
  const value = callback();
  const durationMs = performance.now() - startedAt;
  return { label, durationMs, value };
}

async function timedAsync(label, callback) {
  const startedAt = performance.now();
  const value = await callback();
  const durationMs = performance.now() - startedAt;
  return { label, durationMs, value };
}

function roundMs(value) {
  return Number(value.toFixed(2));
}

function rate(count, durationMs) {
  if (!count || !durationMs) return 0;
  return Number((count / (durationMs / 1000)).toFixed(2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const endpoint = tursoPipelineUrl(requireEnv("PROJECTS_DB_URL"));
  const token = requireEnv("PROJECTS_DB_TOKEN");
  const host = new URL(endpoint).host;

  const deviceTiming = await timedAsync("inferCloneDirectory", () =>
    options.cloneDirectory
      ? Promise.resolve(options.cloneDirectory)
      : inferCloneDirectory(endpoint, token, options.hostname),
  );
  if (!deviceTiming.value?.trim()) {
    throw new Error("Could not infer clone directory. Pass --clone-directory or set RAGGLE_CLONE_DIRECTORY.");
  }
  const cloneDirectory = path.resolve(deviceTiming.value);

  const fetchTiming = await timedAsync("fetchProjects", () => fetchProjectRows(endpoint, token, options.limit));

  const exportPath = path.resolve(options.exportPath);
  mkdirSync(path.dirname(exportPath), { recursive: true });
  writeFileSync(
    exportPath,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        databaseHost: host,
        hostname: options.hostname,
        cloneDirectory,
        rows: fetchTiming.value,
      },
      null,
      2,
    ),
  );

  const normalizeTiming = timed("normalizeProjects", () => loadImportedRepositoriesFromRows(fetchTiming.value));
  const scanTiming = await timedAsync(
    "scanCloneDirectoryRepositories",
    async () => (await scanCloneDirectoryRepositories(cloneDirectory)).repositories,
  );
  const loadTiming = await timedAsync("loadLocalProjects", () =>
    loadLocalProjects(normalizeTiming.value, {
      cloneDirectory,
      force: options.force,
      cloneIndexCachePath: options.cachePath,
      scannedRepositories: scanTiming.value,
      subpathMarkerFiles: options.subpathMarkers.length ? options.subpathMarkers : undefined,
      projectConfigFiles: options.configFiles.length ? options.configFiles : undefined,
    }),
  );

  const clonedItems = loadTiming.value.filter((item) => item.isCloned);
  const subpathItems = loadTiming.value.filter((item) => item.relativePath);
  const mismatches = loadTiming.value.filter((item) => item.remoteMismatch);

  console.log(
    JSON.stringify(
      {
        ok: true,
        databaseHost: host,
        hostname: options.hostname,
        cloneDirectory,
        exportPath,
        timingsMs: {
          inferCloneDirectory: roundMs(deviceTiming.durationMs),
          fetchProjects: roundMs(fetchTiming.durationMs),
          normalizeProjects: roundMs(normalizeTiming.durationMs),
          scanCloneDirectoryRepositories: roundMs(scanTiming.durationMs),
          loadLocalProjects: roundMs(loadTiming.durationMs),
        },
        counts: {
          fetchedProjects: fetchTiming.value.length,
          normalizedProjects: normalizeTiming.value.length,
          scannedRepositories: scanTiming.value.length,
          localItems: loadTiming.value.length,
          clonedItems: clonedItems.length,
          subpathItems: subpathItems.length,
          remoteMismatches: mismatches.length,
        },
        throughput: {
          projectFetchesPerSecond: rate(fetchTiming.value.length, fetchTiming.durationMs),
          folderScansPerSecond: rate(scanTiming.value.length, scanTiming.durationMs),
          localItemsPerSecond: rate(loadTiming.value.length, loadTiming.durationMs),
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
