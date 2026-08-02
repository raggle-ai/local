import { z } from "zod";
import type { AiChatClientId, RadarApplication } from "./types.ts";

const radarTemplateVariableSchema = z.object({
  key: z.string(),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  format: z.string().optional(),
  encoding: z.enum(["none", "url-component"]).optional(),
});

const radarLauncherIntentSchema = z.enum([
  "open-project",
  "open-folder",
  "new-session",
  "resume-session",
  "fallback",
  "settings",
]);

const radarTemplateSchema = z.object({
  id: z.string(),
  label: z.string(),
  intent: radarLauncherIntentSchema,
  urlTemplate: z.string(),
  variables: z.array(radarTemplateVariableSchema).optional(),
});

const radarApplicationSchema = z.object({
  name: z.string(),
  slug: z.string(),
  category: z.literal("Application"),
  homepage: z.string(),
  platforms: z.array(z.string()),
  appNames: z.array(z.string()).optional(),
  bundleId: z.string().optional(),
  capabilities: z.object({
    opensProjectFolder: z.boolean(),
    canResumeProjectSession: z.boolean(),
    canStartNewProjectSession: z.boolean(),
  }),
  deeplinks: z.array(radarTemplateSchema).optional(),
  launchers: z.array(radarTemplateSchema.extend({ kind: z.literal("command") })).optional(),
});

const radarResponseSchema = z.object({
  collections: z.object({
    applications: z.array(radarApplicationSchema),
  }),
});

type RadarApplicationLoaderOptions = {
  expectedSlugs: readonly AiChatClientId[];
  fetchCatalog: () => Promise<unknown>;
  readCache: () => Promise<unknown>;
  writeCache: (catalog: unknown) => Promise<void>;
};

export async function fetchRadarCatalogWithTimeout<T>(
  fetchCatalog: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`Raggle Radar request timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );

  try {
    return await fetchCatalog(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

export function parseRadarApplications(catalog: unknown, expectedSlugs: readonly AiChatClientId[]): RadarApplication[] {
  const response = radarResponseSchema.parse(catalog);
  const bySlug = new Map(response.collections.applications.map((application) => [application.slug, application]));
  const missingSlugs = expectedSlugs.filter((slug) => !bySlug.has(slug));

  if (missingSlugs.length) {
    throw new Error(`Missing Radar applications: ${missingSlugs.join(", ")}`);
  }

  return expectedSlugs.map((slug) => ({ ...bySlug.get(slug), slug }) as RadarApplication);
}

export function createRadarApplicationLoader({
  expectedSlugs,
  fetchCatalog,
  readCache,
  writeCache,
}: RadarApplicationLoaderOptions) {
  let applicationsPromise: Promise<RadarApplication[]> | undefined;

  return function loadRadarApplications() {
    if (applicationsPromise) return applicationsPromise;

    const request = (async () => {
      try {
        const catalog = await fetchCatalog();
        const applications = parseRadarApplications(catalog, expectedSlugs);
        await writeCache(catalog).catch(() => undefined);
        return applications;
      } catch (remoteError) {
        const cachedCatalog = await readCache().catch(() => undefined);
        if (cachedCatalog !== undefined) {
          try {
            return parseRadarApplications(cachedCatalog, expectedSlugs);
          } catch {
            // Preserve the live request error when the fallback cache is unusable.
          }
        }
        throw remoteError;
      }
    })();
    applicationsPromise = request.catch((error) => {
      applicationsPromise = undefined;
      throw error;
    });

    return applicationsPromise;
  };
}
