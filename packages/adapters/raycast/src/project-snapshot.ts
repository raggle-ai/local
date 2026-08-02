import { environment } from "@raycast/api";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { RaycastProject } from "./index";

const defaultRaggleExtensionName = "raggle";
const snapshotFilename = "standard-projects-snapshot.json";

export type RaggleProjectSnapshotOptions = {
  currentSupportPath?: string;
  raggleExtensionName?: string;
  snapshotPath?: string;
};

type RaggleProjectSnapshot = {
  items?: unknown;
};

function isRaycastProject(value: unknown): value is RaycastProject {
  if (!value || typeof value !== "object") return false;

  const project = value as Partial<RaycastProject>;
  return (
    typeof project.id === "string" &&
    typeof project.worktree === "string" &&
    typeof project.remoteUrl === "string" &&
    typeof project.repositoryRoot === "string"
  );
}

export function raggleProjectSnapshotPath(options: RaggleProjectSnapshotOptions = {}) {
  if (options.snapshotPath) return options.snapshotPath;

  const currentSupportPath = options.currentSupportPath ?? environment.supportPath;
  const raggleExtensionName = options.raggleExtensionName ?? defaultRaggleExtensionName;
  const extensionsPath = path.dirname(currentSupportPath);
  const raggleSupportPath =
    path.basename(currentSupportPath) === raggleExtensionName
      ? currentSupportPath
      : path.join(extensionsPath, raggleExtensionName);

  return path.join(raggleSupportPath, snapshotFilename);
}

export function readRaggleProjectSnapshot(options: RaggleProjectSnapshotOptions = {}) {
  const snapshotPath = raggleProjectSnapshotPath(options);
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as RaggleProjectSnapshot;

  if (!Array.isArray(snapshot.items)) {
    throw new Error(`Invalid Raggle project snapshot: ${snapshotPath}`);
  }

  const projects = snapshot.items.filter(isRaycastProject);
  if (projects.length !== snapshot.items.length) {
    throw new Error(`Invalid project entry in Raggle project snapshot: ${snapshotPath}`);
  }

  return projects;
}
