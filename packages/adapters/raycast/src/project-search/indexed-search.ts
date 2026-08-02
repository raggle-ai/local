export type IndexedSearchCache<T, Q> = {
  source: readonly T[];
  query: Q;
  candidates: T[];
};

type IndexedSearchOptionsBase<T, Q> = {
  limit?: number;
  order: (item: T) => number;
  canNarrow?: (previousQuery: Q, nextQuery: Q) => boolean;
};

type MatchAndScoreSearchOptions<T, Q> = IndexedSearchOptionsBase<T, Q> & {
  matches: (item: T, query: Q) => boolean;
  score: (item: T, query: Q) => number;
  evaluate?: never;
};

type EvaluatedSearchOptions<T, Q> = IndexedSearchOptionsBase<T, Q> & {
  evaluate: (item: T, query: Q) => number | undefined;
  matches?: never;
  score?: never;
};

export type IndexedSearchOptions<T, Q> = MatchAndScoreSearchOptions<T, Q> | EvaluatedSearchOptions<T, Q>;

type RankedItem<T> = {
  item: T;
  score: number;
  order: number;
};

function isBetter<T>(left: RankedItem<T>, right: RankedItem<T>) {
  return left.score > right.score || (left.score === right.score && left.order < right.order);
}

function isWorse<T>(left: RankedItem<T>, right: RankedItem<T>) {
  return isBetter(right, left);
}

function moveWorstDown<T>(heap: RankedItem<T>[], startIndex: number) {
  let index = startIndex;

  while (true) {
    const leftIndex = index * 2 + 1;
    const rightIndex = leftIndex + 1;
    let worstIndex = index;

    if (leftIndex < heap.length && isWorse(heap[leftIndex], heap[worstIndex])) worstIndex = leftIndex;
    if (rightIndex < heap.length && isWorse(heap[rightIndex], heap[worstIndex])) worstIndex = rightIndex;
    if (worstIndex === index) return;

    [heap[index], heap[worstIndex]] = [heap[worstIndex], heap[index]];
    index = worstIndex;
  }
}

function moveWorstUp<T>(heap: RankedItem<T>[], startIndex: number) {
  let index = startIndex;

  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    if (!isWorse(heap[index], heap[parentIndex])) return;
    [heap[index], heap[parentIndex]] = [heap[parentIndex], heap[index]];
    index = parentIndex;
  }
}

function addRankedItem<T>(heap: RankedItem<T>[], rankedItem: RankedItem<T>, limit: number) {
  if (heap.length < limit) {
    heap.push(rankedItem);
    moveWorstUp(heap, heap.length - 1);
  } else if (isBetter(rankedItem, heap[0])) {
    heap[0] = rankedItem;
    moveWorstDown(heap, 0);
  }
}

function sortRankedItems<T>(heap: RankedItem<T>[]) {
  return heap.sort((left, right) => (isBetter(left, right) ? -1 : isBetter(right, left) ? 1 : 0));
}

function boundedRank<T, Q>(items: T[], query: Q, options: MatchAndScoreSearchOptions<T, Q>) {
  const limit = Math.max(0, options.limit ?? items.length);
  if (limit === 0) return [];

  const heap: RankedItem<T>[] = [];
  for (const item of items) {
    const rankedItem = { item, score: options.score(item, query), order: options.order(item) };
    addRankedItem(heap, rankedItem, limit);
  }

  return sortRankedItems(heap);
}

function evaluateAndRank<T, Q>(items: readonly T[], query: Q, options: EvaluatedSearchOptions<T, Q>) {
  const limit = Math.max(0, options.limit ?? items.length);
  const candidates: T[] = [];
  const heap: RankedItem<T>[] = [];

  for (const item of items) {
    const score = options.evaluate(item, query);
    if (score === undefined) continue;

    candidates.push(item);
    if (limit > 0) addRankedItem(heap, { item, score, order: options.order(item) }, limit);
  }

  return { candidates, rankedItems: sortRankedItems(heap) };
}

function usesEvaluator<T, Q>(options: IndexedSearchOptions<T, Q>): options is EvaluatedSearchOptions<T, Q> {
  return options.evaluate !== undefined;
}

export function searchIndexedItems<T, Q>(
  source: readonly T[],
  query: Q,
  options: IndexedSearchOptions<T, Q>,
  previous?: IndexedSearchCache<T, Q>,
) {
  const canReuseCandidates = previous?.source === source && Boolean(options.canNarrow?.(previous.query, query));
  const candidatesToScan = canReuseCandidates ? previous.candidates : source;
  let candidates: T[];
  let rankedItems: RankedItem<T>[];

  if (usesEvaluator(options)) {
    ({ candidates, rankedItems } = evaluateAndRank(candidatesToScan, query, options));
  } else {
    candidates = candidatesToScan.filter((item) => options.matches(item, query));
    rankedItems = boundedRank(candidates, query, options);
  }

  return {
    items: rankedItems.map((rankedItem) => rankedItem.item),
    total: candidates.length,
    scanned: candidatesToScan.length,
    cache: { source, query, candidates } satisfies IndexedSearchCache<T, Q>,
  };
}
