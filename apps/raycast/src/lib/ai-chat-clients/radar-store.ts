import { LocalStorage } from "@raycast/api";
import { createRadarApplicationLoader, fetchRadarCatalogWithTimeout } from "./radar-catalog";
import { AI_CHAT_CLIENT_IDS } from "./types";

const radarUrl = "https://www.raggle.co/radar.json";
const radarCacheKey = "raggle-radar-applications";
const radarRequestTimeoutMs = 5_000;

export const loadRadarApplications = createRadarApplicationLoader({
  expectedSlugs: AI_CHAT_CLIENT_IDS,
  fetchCatalog() {
    return fetchRadarCatalogWithTimeout(async (signal) => {
      const response = await fetch(radarUrl, { headers: { Accept: "application/json" }, signal });
      if (!response.ok) throw new Error(`Could not load Raggle Radar (${response.status})`);
      return response.json();
    }, radarRequestTimeoutMs);
  },
  async readCache() {
    const cachedCatalog = await LocalStorage.getItem<string>(radarCacheKey);
    if (!cachedCatalog) return undefined;

    try {
      return JSON.parse(cachedCatalog) as unknown;
    } catch {
      return undefined;
    }
  },
  async writeCache(catalog) {
    await LocalStorage.setItem(radarCacheKey, JSON.stringify(catalog));
  },
});
