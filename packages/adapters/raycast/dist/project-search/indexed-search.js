"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchIndexedItems = searchIndexedItems;
function isBetter(left, right) {
    return left.score > right.score || (left.score === right.score && left.order < right.order);
}
function isWorse(left, right) {
    return isBetter(right, left);
}
function moveWorstDown(heap, startIndex) {
    let index = startIndex;
    while (true) {
        const leftIndex = index * 2 + 1;
        const rightIndex = leftIndex + 1;
        let worstIndex = index;
        if (leftIndex < heap.length && isWorse(heap[leftIndex], heap[worstIndex]))
            worstIndex = leftIndex;
        if (rightIndex < heap.length && isWorse(heap[rightIndex], heap[worstIndex]))
            worstIndex = rightIndex;
        if (worstIndex === index)
            return;
        [heap[index], heap[worstIndex]] = [heap[worstIndex], heap[index]];
        index = worstIndex;
    }
}
function moveWorstUp(heap, startIndex) {
    let index = startIndex;
    while (index > 0) {
        const parentIndex = Math.floor((index - 1) / 2);
        if (!isWorse(heap[index], heap[parentIndex]))
            return;
        [heap[index], heap[parentIndex]] = [heap[parentIndex], heap[index]];
        index = parentIndex;
    }
}
function addRankedItem(heap, rankedItem, limit) {
    if (heap.length < limit) {
        heap.push(rankedItem);
        moveWorstUp(heap, heap.length - 1);
    }
    else if (isBetter(rankedItem, heap[0])) {
        heap[0] = rankedItem;
        moveWorstDown(heap, 0);
    }
}
function sortRankedItems(heap) {
    return heap.sort((left, right) => (isBetter(left, right) ? -1 : isBetter(right, left) ? 1 : 0));
}
function boundedRank(items, query, options) {
    const limit = Math.max(0, options.limit ?? items.length);
    if (limit === 0)
        return [];
    const heap = [];
    for (const item of items) {
        const rankedItem = { item, score: options.score(item, query), order: options.order(item) };
        addRankedItem(heap, rankedItem, limit);
    }
    return sortRankedItems(heap);
}
function evaluateAndRank(items, query, options) {
    const limit = Math.max(0, options.limit ?? items.length);
    const candidates = [];
    const heap = [];
    for (const item of items) {
        const score = options.evaluate(item, query);
        if (score === undefined)
            continue;
        candidates.push(item);
        if (limit > 0)
            addRankedItem(heap, { item, score, order: options.order(item) }, limit);
    }
    return { candidates, rankedItems: sortRankedItems(heap) };
}
function usesEvaluator(options) {
    return options.evaluate !== undefined;
}
function searchIndexedItems(source, query, options, previous) {
    const canReuseCandidates = previous?.source === source && Boolean(options.canNarrow?.(previous.query, query));
    const candidatesToScan = canReuseCandidates ? previous.candidates : source;
    let candidates;
    let rankedItems;
    if (usesEvaluator(options)) {
        ({ candidates, rankedItems } = evaluateAndRank(candidatesToScan, query, options));
    }
    else {
        candidates = candidatesToScan.filter((item) => options.matches(item, query));
        rankedItems = boundedRank(candidates, query, options);
    }
    return {
        items: rankedItems.map((rankedItem) => rankedItem.item),
        total: candidates.length,
        scanned: candidatesToScan.length,
        cache: { source, query, candidates },
    };
}
