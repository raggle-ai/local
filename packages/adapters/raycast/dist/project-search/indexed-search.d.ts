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
export declare function searchIndexedItems<T, Q>(source: readonly T[], query: Q, options: IndexedSearchOptions<T, Q>, previous?: IndexedSearchCache<T, Q>): {
    items: T[];
    total: number;
    scanned: number;
    cache: {
        source: readonly T[];
        query: Q;
        candidates: T[];
    };
};
export {};
