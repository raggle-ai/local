import path from "node:path";
import { repositoryLookupKey, repositoryName } from "./git-repository";

const primaryBranchNames = new Set(["main", "master"]);

export type LocalRepositoryCandidate = {
  worktree: string;
  remoteUrl: string;
  currentBranch?: string;
};

function isPrimaryBranch(branch?: string) {
  return branch ? primaryBranchNames.has(branch) : false;
}

function isLikelyGeneratedWorktreeName(name: string) {
  return /(?:^|[-_])(?:pr|pull|worktree|wt)[-_]?\d+$/i.test(name);
}

function candidatePreferenceScore(candidate: LocalRepositoryCandidate) {
  const basename = path.basename(candidate.worktree).toLowerCase();
  const remoteRepositoryName = repositoryName(candidate.remoteUrl).toLowerCase();

  return [
    isPrimaryBranch(candidate.currentBranch) ? 0 : 1,
    basename === remoteRepositoryName ? 0 : 1,
    isLikelyGeneratedWorktreeName(basename) ? 1 : 0,
  ];
}

export function compareLocalRepositoryCandidatePreference(a: LocalRepositoryCandidate, b: LocalRepositoryCandidate) {
  const aScore = candidatePreferenceScore(a);
  const bScore = candidatePreferenceScore(b);

  for (let index = 0; index < aScore.length; index += 1) {
    const diff = aScore[index] - bScore[index];
    if (diff !== 0) return diff;
  }

  return a.worktree.localeCompare(b.worktree);
}

export function sortLocalRepositoryCandidates<T extends LocalRepositoryCandidate>(candidates: T[]) {
  return [...candidates].sort((a, b) => {
    const repositoryKeyCompare = repositoryLookupKey(a.remoteUrl).localeCompare(repositoryLookupKey(b.remoteUrl));
    if (repositoryKeyCompare !== 0) return repositoryKeyCompare;

    return compareLocalRepositoryCandidatePreference(a, b);
  });
}
