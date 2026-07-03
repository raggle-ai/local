"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareLocalRepositoryCandidatePreference = compareLocalRepositoryCandidatePreference;
exports.sortLocalRepositoryCandidates = sortLocalRepositoryCandidates;
const node_path_1 = __importDefault(require("node:path"));
const git_repository_1 = require("./git-repository");
const primaryBranchNames = new Set(["main", "master"]);
function isPrimaryBranch(branch) {
    return branch ? primaryBranchNames.has(branch) : false;
}
function isLikelyGeneratedWorktreeName(name) {
    return /(?:^|[-_])(?:pr|pull|worktree|wt)[-_]?\d+$/i.test(name);
}
function candidatePreferenceScore(candidate) {
    const basename = node_path_1.default.basename(candidate.worktree).toLowerCase();
    const remoteRepositoryName = (0, git_repository_1.repositoryName)(candidate.remoteUrl).toLowerCase();
    return [
        isPrimaryBranch(candidate.currentBranch) ? 0 : 1,
        basename === remoteRepositoryName ? 0 : 1,
        isLikelyGeneratedWorktreeName(basename) ? 1 : 0,
    ];
}
function compareLocalRepositoryCandidatePreference(a, b) {
    const aScore = candidatePreferenceScore(a);
    const bScore = candidatePreferenceScore(b);
    for (let index = 0; index < aScore.length; index += 1) {
        const diff = aScore[index] - bScore[index];
        if (diff !== 0)
            return diff;
    }
    return a.worktree.localeCompare(b.worktree);
}
function sortLocalRepositoryCandidates(candidates) {
    return [...candidates].sort((a, b) => {
        const repositoryKeyCompare = (0, git_repository_1.repositoryLookupKey)(a.remoteUrl).localeCompare((0, git_repository_1.repositoryLookupKey)(b.remoteUrl));
        if (repositoryKeyCompare !== 0)
            return repositoryKeyCompare;
        return compareLocalRepositoryCandidatePreference(a, b);
    });
}
