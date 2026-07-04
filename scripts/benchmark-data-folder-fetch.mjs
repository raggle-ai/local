import { readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { loadImportedRepositoriesFromRows, loadLocalProjects, scanCloneDirectoryRepositories } from "../dist/index.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultExportPath = path.join(packageRoot, "data", "projects-export.json");

function parseArgs(argv) {
  const options = {
    exportPath: process.env.RAGGLE_PROJECTS_EXPORT ?? defaultExportPath,
    cloneDirectory: process.env.RAGGLE_CLONE_DIRECTORY,
    force: false,
    cachePath: process.env.RAGGLE_CLONE_INDEX_CACHE,
    iterations: 5,
    warmup: 1,
    verbose: false,
    subpathMarkers: [],
    configFiles: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--export-path" && next) {
      options.exportPath = next;
      index += 1;
      continue;
    }

    if (arg === "--clone-directory" && next) {
      options.cloneDirectory = next;
      index += 1;
      continue;
    }

    if (arg === "--cache-path" && next) {
      options.cachePath = next;
      index += 1;
      continue;
    }

    if (arg === "--iterations" && next) {
      const iterations = Number.parseInt(next, 10);
      if (Number.isFinite(iterations) && iterations > 0) options.iterations = iterations;
      index += 1;
      continue;
    }

    if (arg === "--warmup" && next) {
      const warmup = Number.parseInt(next, 10);
      if (Number.isFinite(warmup) && warmup >= 0) options.warmup = warmup;
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

    if (arg === "--verbose") {
      options.verbose = true;
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
  console.log(`Usage: npm run bench:data -- [options]

Benchmark local folder discovery and project resolution using project rows
previously exported by bench:projects-db (data/projects-export.json). No
network access is required. Runs warm, cold (clone index rebuilt), and
unshared-scan modes for several iterations each and reports per-phase
min/median/mean/max, including the library's internal [projects] phases.

Options:
  --export-path <path>      Exported rows JSON (default: data/projects-export.json).
  --clone-directory <path>  Override the clone directory stored in the export.
  --cache-path <path>       Optional clone index cache path.
  --iterations <count>      Timed iterations to run (default: 5).
  --warmup <count>          Untimed warmup iterations (default: 1).
  --subpath-marker <file>   Marker file that makes a folder an automatic subpath
                            root (repeatable), e.g. --subpath-marker _schema.json.
  --config-file <file>      Extra repo config file name checked before the
                            raggle.json + index.json defaults (repeatable).
  --force                   Ignore clone index cache and rescan.
  --verbose                 Show the library's [projects] log lines.
`);
}

function roundMs(value) {
  return Number(value.toFixed(2));
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;

  return {
    min: roundMs(sorted[0]),
    median: roundMs(median),
    mean: roundMs(mean),
    max: roundMs(sorted[sorted.length - 1]),
  };
}

function recordSample(store, label, durationMs) {
  const samples = store.get(label) ?? [];
  samples.push(durationMs);
  store.set(label, samples);
}

const internalLogPattern = /^\[projects\] (\S+) (\d+(?:\.\d+)?)ms/;

async function runIteration(rows, cloneDirectory, options, mode, outerSamples, internalSamples) {
  const originalInfo = console.info;
  console.info = (...args) => {
    const line = typeof args[0] === "string" ? args[0] : "";
    const match = internalLogPattern.exec(line);
    if (match && internalSamples) recordSample(internalSamples, match[1], Number(match[2]));
    if (options.verbose) originalInfo(...args);
  };

  try {
    const totalStartedAt = performance.now();

    const normalizeStartedAt = performance.now();
    const normalized = loadImportedRepositoriesFromRows(rows);
    recordSample(outerSamples, "normalizeProjects", performance.now() - normalizeStartedAt);

    const scanStartedAt = performance.now();
    const scanned = scanCloneDirectoryRepositories(cloneDirectory).repositories;
    recordSample(outerSamples, "scanCloneDirectoryRepositories", performance.now() - scanStartedAt);

    const loadStartedAt = performance.now();
    const items = await loadLocalProjects(normalized, {
      cloneDirectory,
      force: mode.force,
      cloneIndexCachePath: options.cachePath,
      scannedRepositories: mode.shareScan ? scanned : undefined,
      subpathMarkerFiles: options.subpathMarkers.length ? options.subpathMarkers : undefined,
      projectConfigFiles: options.configFiles.length ? options.configFiles : undefined,
    });
    recordSample(outerSamples, "loadLocalProjects", performance.now() - loadStartedAt);
    recordSample(outerSamples, "total", performance.now() - totalStartedAt);

    return { normalized, scanned, items };
  } finally {
    console.info = originalInfo;
  }
}

async function runMode(rows, cloneDirectory, options, mode) {
  const outerSamples = new Map();
  const internalSamples = new Map();
  let lastResult;
  for (let index = 0; index < options.iterations; index += 1) {
    lastResult = await runIteration(rows, cloneDirectory, options, mode, outerSamples, internalSamples);
  }

  return {
    lastResult,
    phasesMs: Object.fromEntries([...outerSamples.entries()].map(([label, samples]) => [label, summarize(samples)])),
    internalPhasesMs: Object.fromEntries(
      [...internalSamples.entries()].map(([label, samples]) => [label, summarize(samples)]),
    ),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const exportPath = path.resolve(options.exportPath);

  const readStartedAt = performance.now();
  let exportData;
  try {
    exportData = JSON.parse(readFileSync(exportPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Export file not found at ${exportPath}. Run npm run bench:projects-db first to create it.`);
    }
    throw error;
  }
  const readExportMs = performance.now() - readStartedAt;

  if (!Array.isArray(exportData.rows)) {
    throw new Error(`Export file at ${exportPath} has no rows array. Re-run npm run bench:projects-db.`);
  }

  const cloneDirectoryInput = options.cloneDirectory ?? exportData.cloneDirectory;
  if (!cloneDirectoryInput?.trim()) {
    throw new Error("Could not determine clone directory. Pass --clone-directory or set RAGGLE_CLONE_DIRECTORY.");
  }
  const cloneDirectory = path.resolve(cloneDirectoryInput);

  const warmMode = { name: "warm", force: options.force, shareScan: true };
  for (let index = 0; index < options.warmup; index += 1) {
    await runIteration(exportData.rows, cloneDirectory, options, warmMode, new Map(), undefined);
  }

  const modes = [
    // warm: clone index snapshot reusable, scan shared with loadLocalProjects.
    warmMode,
    // cold: clone index rebuilt every time, scan shared with loadLocalProjects.
    { name: "cold", force: true, shareScan: true },
    // unshared: warm caches but loadLocalProjects re-scans on its own (pre-improvement behavior).
    { name: "unshared", force: options.force, shareScan: false },
  ];

  const results = {};
  let lastResult;
  for (const mode of modes) {
    const modeResult = await runMode(exportData.rows, cloneDirectory, options, mode);
    lastResult = modeResult.lastResult;
    results[mode.name] = {
      phasesMs: modeResult.phasesMs,
      internalPhasesMs: modeResult.internalPhasesMs,
    };
  }

  const clonedItems = lastResult.items.filter((item) => item.isCloned);
  const subpathItems = lastResult.items.filter((item) => item.relativePath);
  const mismatches = lastResult.items.filter((item) => item.remoteMismatch);

  console.log(
    JSON.stringify(
      {
        ok: true,
        exportPath,
        exportedAt: exportData.exportedAt ?? null,
        cloneDirectory,
        iterationsPerMode: options.iterations,
        warmup: options.warmup,
        readExportMs: roundMs(readExportMs),
        modes: results,
        counts: {
          exportedProjects: exportData.rows.length,
          normalizedProjects: lastResult.normalized.length,
          scannedRepositories: lastResult.scanned.length,
          localItems: lastResult.items.length,
          clonedItems: clonedItems.length,
          subpathItems: subpathItems.length,
          remoteMismatches: mismatches.length,
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
