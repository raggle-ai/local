import type { StandardProjectsSettings } from "./config";

export function needsTursoProjectSourceSetup(
  preferences: Pick<StandardProjectsSettings, "projectSource" | "tursoDatabaseUrl">,
) {
  return preferences.projectSource === "turso" && !preferences.tursoDatabaseUrl?.trim();
}
