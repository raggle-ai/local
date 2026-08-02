import {
  normalizeRepositoryUrl,
  readImportedRepositoryRows,
  writeImportedRepositoryRows,
  type AddProjectValues,
  projectRowFromValues,
} from "@raggle-ai/local";
import { type StandardProjectsSettings } from "./config";
import { readTursoProjectRows, upsertTursoProjectRow } from "./project-source/turso-source";

type SaveNewProjectSettings = StandardProjectsSettings & {
  cloneDirectory: string;
  projectListFile: string;
};

export async function saveNewProject(settings: SaveNewProjectSettings, values: AddProjectValues) {
  const rows =
    settings.projectSource === "turso"
      ? await readTursoProjectRows(settings)
      : readImportedRepositoryRows(settings.projectListFile);
  const newRow = projectRowFromValues(values);
  const normalizedUrl = newRow.url;

  if (rows.some((row) => normalizeRepositoryUrl(row.url) === normalizedUrl)) {
    throw new Error(`Repository ${normalizedUrl} already exists`);
  }

  if (settings.projectSource === "turso") {
    await upsertTursoProjectRow(settings, newRow);
  } else {
    rows.push(newRow);
    writeImportedRepositoryRows(settings.projectListFile, rows);
  }

  return { row: newRow, normalizedUrl };
}
