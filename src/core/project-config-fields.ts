export function normalizeTags(input: unknown) {
  const tags = new Set<string>();

  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item !== "string") continue;
      const value = item.trim();
      if (value) tags.add(value);
    }
    return [...tags];
  }

  if (input && typeof input === "object") {
    for (const [key, value] of Object.entries(input)) {
      const nextKey = key.trim();
      if (nextKey && value !== false && value !== null) tags.add(nextKey);
      if (typeof value === "string") {
        const nextValue = value.trim();
        if (nextValue) tags.add(nextValue);
      }
    }
  }

  return [...tags];
}

export function normalizeFolders(input: unknown) {
  const folders = new Set<string>();
  if (!Array.isArray(input)) return [];

  for (const item of input) {
    if (typeof item !== "string") continue;
    const normalized = item
      .trim()
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean)
      .join("/");
    if (normalized) folders.add(normalized);
  }

  return [...folders];
}
