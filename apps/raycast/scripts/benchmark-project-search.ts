import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  buildProjectSearchIndex,
  evaluateProjectSearchEntry,
  parseProjectSearch,
  projectSearchCanNarrow,
  searchIndexedItems,
  type IndexedSearchCache,
  type ProjectSearchIndexEntry,
} from "@raggle-ai/raycast-adapter";
import { type StandardProject } from "../src/lib/standard-project-metadata.ts";

const datasetSizes = [100, 1_000, 10_000] as const;
const sampleCount = 25;
const resultLimit = 50;

type ParsedProjectSearch = ReturnType<typeof parseProjectSearch>;

function syntheticProjects(size: number): StandardProject[] {
  return Array.from({ length: size }, (_, index) => {
    const projectNumber = String(index).padStart(5, "0");
    const isSubpath = index % 5 === 4;
    const repositoryNumber = isSubpath ? String(index - 1).padStart(5, "0") : projectNumber;
    const repositoryRoot = `/src/project-${repositoryNumber}`;

    return {
      id: isSubpath ? `${repositoryRoot}:packages/web` : repositoryRoot,
      name: `Project ${projectNumber}`,
      worktree: isSubpath ? `${repositoryRoot}/packages/web` : repositoryRoot,
      repositoryRoot,
      remoteUrl: `https://github.com/example/project-${repositoryNumber}.git`,
      relativePath: isSubpath ? "packages/web" : undefined,
      isCloned: true,
      isFavorite: false,
      isSubpathRoot: false,
      relatedIds: [],
      keywords: ["project", projectNumber, index % 2 === 0 ? "frontend" : "backend"],
      latestSessionTitle: index % 10 === 0 ? `Review project ${projectNumber}` : undefined,
    } as StandardProject;
  });
}

function percentile(samples: number[], fraction: number) {
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))];
}

function measure(operation: () => void) {
  const samples: number[] = [];
  operation();

  for (let index = 0; index < sampleCount; index += 1) {
    const startedAt = performance.now();
    operation();
    samples.push(performance.now() - startedAt);
  }

  return {
    medianMs: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
  };
}

function searchOptions(index: ProjectSearchIndexEntry[]) {
  const order = new Map(index.map((entry, position) => [entry, position]));
  return {
    limit: resultLimit,
    evaluate: evaluateProjectSearchEntry,
    order: (entry: ProjectSearchIndexEntry) => order.get(entry) ?? Number.MAX_SAFE_INTEGER,
    canNarrow: projectSearchCanNarrow,
  };
}

function formatMs(value: number) {
  return value.toFixed(3);
}

console.log(`Project search benchmark (${sampleCount} measured runs, ${resultLimit}-result limit)`);
console.log("size\tindex median/p95\tbroad median/p95\texact median/p95\tnarrow median/p95\tnarrow scanned");

for (const size of datasetSizes) {
  const projects = syntheticProjects(size);
  let index: ProjectSearchIndexEntry[] = [];
  const indexTiming = measure(() => {
    index = buildProjectSearchIndex(projects);
  });
  assert.equal(index.length, size);

  const options = searchOptions(index);
  const broadQuery = parseProjectSearch("project");
  let broadResult = searchIndexedItems(index, broadQuery, options);
  const broadTiming = measure(() => {
    broadResult = searchIndexedItems(index, broadQuery, options);
  });
  assert.equal(broadResult.total, size);
  assert.equal(broadResult.items.length, Math.min(size, resultLimit));

  const targetNumber = String(Math.floor(size / 2)).padStart(5, "0");
  const exactQuery = parseProjectSearch(`project ${targetNumber}`);
  let exactResult = searchIndexedItems(index, exactQuery, options);
  const exactTiming = measure(() => {
    exactResult = searchIndexedItems(index, exactQuery, options);
  });
  assert.equal(exactResult.items[0]?.project.name, `Project ${targetNumber}`);

  const previousQuery = parseProjectSearch(`project ${targetNumber.slice(0, -1)}`);
  const previousResult = searchIndexedItems(index, previousQuery, options);
  let narrowCache: IndexedSearchCache<ProjectSearchIndexEntry, ParsedProjectSearch> = previousResult.cache;
  let narrowResult = searchIndexedItems(index, exactQuery, options, narrowCache);
  const narrowTiming = measure(() => {
    narrowResult = searchIndexedItems(index, exactQuery, options, narrowCache);
    narrowCache = previousResult.cache;
  });
  assert.ok(narrowResult.scanned < size);
  assert.equal(narrowResult.items[0]?.project.name, `Project ${targetNumber}`);

  console.log(
    [
      size,
      `${formatMs(indexTiming.medianMs)}/${formatMs(indexTiming.p95Ms)} ms`,
      `${formatMs(broadTiming.medianMs)}/${formatMs(broadTiming.p95Ms)} ms`,
      `${formatMs(exactTiming.medianMs)}/${formatMs(exactTiming.p95Ms)} ms`,
      `${formatMs(narrowTiming.medianMs)}/${formatMs(narrowTiming.p95Ms)} ms`,
      `${narrowResult.scanned}/${size}`,
    ].join("\t"),
  );
}
