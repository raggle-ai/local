import { Action, ActionPanel, Icon } from "@raycast/api";
import { useLocalStorage } from "@raycast/utils";
import React, { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchIndexedItems, type IndexedSearchCache, type IndexedSearchOptions } from "@raggle-ai/raycast-adapter";
import {
  recordRecentSelection,
  resetRecentSelection,
  sortNonFavouritesByRecentSelection,
} from "../lib/enhanced-list-order";

type EnhancedListActionPanelProps = {
  onSelect: ComponentProps<typeof ActionPanel>["children"];
  onCommandSelect?: ComponentProps<typeof ActionPanel>["children"];
  children?: ComponentProps<typeof ActionPanel>["children"];
};

export function EnhancedListActionPanel({
  onSelect,
  onCommandSelect,
  children,
}: EnhancedListActionPanelProps): React.JSX.Element {
  return (
    <ActionPanel>
      {onSelect}
      {onCommandSelect}
      {children}
    </ActionPanel>
  );
}

export function normalizeForSearch(text: string): string {
  return text.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

export function fuzzyMatch(query: string, target: string): boolean {
  if (!query.trim()) return true;

  const normalizedQuery = normalizeForSearch(query);
  const normalizedTarget = normalizeForSearch(target);
  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  const compactTarget = normalizedTarget.replace(/\s+/g, "");
  const queryWords = normalizedQuery.split(" ").filter((word) => word.length > 0);

  if (queryWords.length === 0) return true;
  if (compactQuery && compactTarget.includes(compactQuery)) return true;

  return queryWords.every((word) => normalizedTarget.includes(word));
}

export interface SearchFieldConfig<T> {
  getSearchText: (item: T) => string;
  getSecondaryText?: (item: T) => string | undefined;
  getWeight?: (item: T, searchText?: string) => number;
  filterItem?: (item: T, searchText: string) => boolean;
  transformSearchText?: (searchText: string) => string;
}

export interface UseSearchResult<T> {
  searchText: string;
  setSearchText: (text: string) => void;
  filteredItems: T[];
  isSearching: boolean;
  clearSearch: () => void;
}

export interface UseSearchOptions<T> extends SearchFieldConfig<T> {
  initialSearchText?: string;
  debounceMs?: number;
}

export function useIndexedSearch<T, Q>(source: readonly T[], query: Q, options: IndexedSearchOptions<T, Q>) {
  const cacheRef = useRef<IndexedSearchCache<T, Q> | undefined>(undefined);
  const result = useMemo(() => searchIndexedItems(source, query, options, cacheRef.current), [options, query, source]);

  useEffect(() => {
    cacheRef.current = result.cache;
  }, [result.cache]);

  return result;
}

export function useSearch<T>(
  items: T[],
  {
    getSearchText,
    getSecondaryText,
    getWeight,
    filterItem,
    transformSearchText,
    initialSearchText = "",
    debounceMs = 0,
  }: UseSearchOptions<T>,
): UseSearchResult<T> {
  const [searchText, setSearchText] = useState(initialSearchText);
  const [debouncedSearchText, setDebouncedSearchText] = useState(initialSearchText);

  const clearSearch = useCallback(() => {
    setSearchText("");
  }, []);

  useEffect(() => {
    if (debounceMs <= 0) return;

    const timer = setTimeout(() => setDebouncedSearchText(searchText), debounceMs);
    return () => clearTimeout(timer);
  }, [debounceMs, searchText]);

  const activeSearchText = debounceMs > 0 ? debouncedSearchText : searchText;
  const filteredItems = useMemo(() => {
    const nextItems = filterItem ? items.filter((item) => filterItem(item, activeSearchText)) : items;
    const effectiveSearchText = transformSearchText ? transformSearchText(activeSearchText) : activeSearchText;

    if (!effectiveSearchText.trim()) return nextItems;

    return nextItems
      .map((item) => {
        const primaryText = getSearchText(item);
        const secondaryText = getSecondaryText?.(item);
        const weight = getWeight?.(item, effectiveSearchText) ?? 0;

        if (fuzzyMatch(effectiveSearchText, primaryText)) {
          return { item, match: true, weight: weight + 2 } as const;
        }

        if (secondaryText && fuzzyMatch(effectiveSearchText, secondaryText)) {
          return { item, match: true, weight: weight + 1 } as const;
        }

        return { item, match: false, weight } as const;
      })
      .filter((result): result is { item: T; match: true; weight: number } => result.match)
      .sort((a, b) => b.weight - a.weight)
      .map((result) => result.item);
  }, [activeSearchText, filterItem, getSearchText, getSecondaryText, getWeight, items, transformSearchText]);

  return {
    searchText,
    setSearchText,
    filteredItems,
    isSearching: searchText.trim().length > 0,
    clearSearch,
  };
}

export function fuzzyFilter<T>(
  items: T[],
  query: string,
  config: SearchFieldConfig<T>,
  options?: { includeNonMatching?: boolean },
): T[] {
  if (!query.trim()) return items;

  return items
    .map((item) => {
      const primaryText = config.getSearchText(item);
      const secondaryText = config.getSecondaryText?.(item);
      const weight = config.getWeight?.(item, query) ?? 0;

      if (fuzzyMatch(query, primaryText)) {
        return { item, match: true, weight: weight + 2 } as const;
      }

      if (secondaryText && fuzzyMatch(query, secondaryText)) {
        return { item, match: true, weight: weight + 1 } as const;
      }

      return { item, match: false, weight } as const;
    })
    .filter((result) => result.match || options?.includeNonMatching)
    .sort((a, b) => b.weight - a.weight)
    .map((result) => result.item);
}

export function createFuzzyFilterer<T>(config: SearchFieldConfig<T>) {
  return (items: T[], query: string) => fuzzyFilter(items, query, config);
}

export interface SearchableFields {
  name: string;
  description: string;
  category: string;
}

export function filterBySearchAndCategory<T extends SearchableFields>(
  items: T[],
  options: {
    searchText?: string;
    selectedCategory?: string;
    disableSearchWhen?: boolean;
  },
): T[] {
  const { searchText = "", selectedCategory = "", disableSearchWhen = false } = options;
  let filtered = selectedCategory ? items.filter((item) => item.category === selectedCategory) : [...items];

  if (searchText.trim() && !disableSearchWhen) {
    filtered = filtered.filter(
      (item) =>
        fuzzyMatch(searchText, item.name) ||
        fuzzyMatch(searchText, item.description) ||
        fuzzyMatch(searchText, item.category),
    );
  }

  return filtered;
}

type UseEnhancedListFavouritesOptions<T> = {
  storageKey: string;
  getItemKey: (item: T) => string;
  initialFavourites?: string[];
};

type UseEnhancedListFavouritesResult<T> = {
  favourites: string[];
  recentSelections: string[];
  isLoading: boolean;
  pendingFavouriteKeys: string[];
  orderedFavourites: T[];
  nonFavourites: T[];
  isFavourite: (itemKey: string) => boolean;
  toggleFavourite: (itemKey: string) => void;
  moveFavouriteUp: (itemKey: string) => boolean;
  moveFavouriteDown: (itemKey: string) => boolean;
  moveItemToBottom: (itemKey: string) => void;
  recordSelection: (itemKey: string) => void;
  createToggleFavoriteAction: (item: T) => React.JSX.Element;
  createMoveToBottomAction: (item: T) => React.JSX.Element;
};

export function useEnhancedListFavourites<T>(
  items: T[],
  { storageKey, getItemKey, initialFavourites }: UseEnhancedListFavouritesOptions<T>,
): UseEnhancedListFavouritesResult<T> {
  const migratedInitialFavourites = useRef(false);
  const { value, setValue, isLoading: favouritesLoading } = useLocalStorage<string[]>(storageKey, []);
  const {
    value: recentSelections,
    setValue: setRecentSelections,
    isLoading: recentSelectionsLoading,
  } = useLocalStorage<string[]>(`${storageKey}-recent-selections`, []);
  const favourites = value ?? [];
  const recentSelectionOrder = recentSelections ?? [];

  useEffect(() => {
    if (migratedInitialFavourites.current || favourites.length > 0 || !initialFavourites?.length) return;
    setValue(initialFavourites);
    migratedInitialFavourites.current = true;
  }, [favourites.length, initialFavourites, setValue]);

  const favouriteSet = useMemo(() => new Set(favourites), [favourites]);
  const itemsByKey = useMemo(() => new Map(items.map((item) => [getItemKey(item), item])), [getItemKey, items]);

  const pendingFavouriteKeys = useMemo(
    () => favourites.filter((itemKey) => !itemsByKey.has(itemKey)),
    [favourites, itemsByKey],
  );

  const orderedFavourites = useMemo(
    () =>
      items
        .filter((item) => favouriteSet.has(getItemKey(item)))
        .sort((a, b) => favourites.indexOf(getItemKey(a)) - favourites.indexOf(getItemKey(b))),
    [favourites, favouriteSet, getItemKey, items],
  );

  const nonFavourites = useMemo(() => {
    return sortNonFavouritesByRecentSelection(items, favourites, recentSelectionOrder, getItemKey);
  }, [favourites, getItemKey, items, recentSelectionOrder]);

  const toggleFavourite = (itemKey: string) => {
    if (favouriteSet.has(itemKey)) {
      setValue(favourites.filter((name) => name !== itemKey));
      return;
    }

    setValue([...favourites, itemKey]);
  };

  const moveFavouriteUp = (itemKey: string) => {
    const currentIndex = favourites.indexOf(itemKey);
    if (currentIndex <= 0) return false;

    const nextFavourites = [...favourites];
    [nextFavourites[currentIndex - 1], nextFavourites[currentIndex]] = [
      nextFavourites[currentIndex],
      nextFavourites[currentIndex - 1],
    ];
    setValue(nextFavourites);
    return true;
  };

  const moveFavouriteDown = (itemKey: string) => {
    const currentIndex = favourites.indexOf(itemKey);
    if (currentIndex === -1 || currentIndex >= favourites.length - 1) return false;

    const nextFavourites = [...favourites];
    [nextFavourites[currentIndex], nextFavourites[currentIndex + 1]] = [
      nextFavourites[currentIndex + 1],
      nextFavourites[currentIndex],
    ];
    setValue(nextFavourites);
    return true;
  };

  const recordSelection = (itemKey: string) => {
    setRecentSelections(recordRecentSelection(recentSelectionOrder, itemKey));
  };

  const moveItemToBottom = (itemKey: string) => {
    setRecentSelections(resetRecentSelection(recentSelectionOrder, itemKey));
  };

  const createToggleFavoriteAction = (item: T): React.JSX.Element => {
    const itemKey = getItemKey(item);
    const isFav = favouriteSet.has(itemKey);
    return (
      <Action
        title={isFav ? "Unfavorite" : "Favorite"}
        icon={isFav ? Icon.StarDisabled : Icon.Star}
        shortcut={{ modifiers: ["cmd", "shift"], key: "l" }}
        onAction={() => toggleFavourite(itemKey)}
      />
    );
  };

  const createMoveToBottomAction = (item: T): React.JSX.Element => {
    const itemKey = getItemKey(item);
    return (
      <Action
        title="Move to Bottom"
        icon={Icon.EyeDisabled}
        shortcut={{ modifiers: ["cmd", "shift"], key: "h" }}
        onAction={() => moveItemToBottom(itemKey)}
      />
    );
  };

  return {
    favourites,
    recentSelections: recentSelectionOrder,
    isLoading: favouritesLoading || recentSelectionsLoading,
    pendingFavouriteKeys,
    orderedFavourites,
    nonFavourites,
    isFavourite: (itemKey: string) => favouriteSet.has(itemKey),
    toggleFavourite,
    moveFavouriteUp,
    moveFavouriteDown,
    moveItemToBottom,
    recordSelection,
    createToggleFavoriteAction,
    createMoveToBottomAction,
  };
}
