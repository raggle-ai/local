"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_RAGGLE_DATABASE_URL = void 0;
exports.normalizeRepositoryReference = normalizeRepositoryReference;
exports.readRemoteRepositoryConfig = readRemoteRepositoryConfig;
const web_1 = require("@libsql/client/web");
const project_config_fields_1 = require("../core/project-config-fields");
const project_subpaths_1 = require("../core/project-subpaths");
const import_1 = require("./import");
const git_repository_1 = require("./git-repository");
exports.DEFAULT_RAGGLE_DATABASE_URL = "libsql://raggle-raycast-projects-anduimagui.aws-eu-west-1.turso.io";
function parseJson(input) {
    if (!input)
        return [];
    try {
        return JSON.parse(input);
    }
    catch {
        return [];
    }
}
function normalizeRepositoryReference(input) {
    const reference = input.trim();
    if (/^[^\s/:]+\/[^\s/]+$/.test(reference))
        return (0, git_repository_1.normalizeRepositoryUrl)(`https://github.com/${reference}`);
    return (0, git_repository_1.normalizeRepositoryUrl)(reference);
}
async function readRemoteRepositoryConfig(options) {
    const repository = normalizeRepositoryReference(options.repository);
    const client = (0, web_1.createClient)({
        url: options.databaseUrl?.trim() || exports.DEFAULT_RAGGLE_DATABASE_URL,
        authToken: options.authToken?.trim() || undefined,
    });
    try {
        const result = await client.execute({
            sql: `select url, name, description, tags_json, folders_json, subpaths_json, clone_path_template,
        all_subpath, remove_path_from_name
        from projects
        where url = ? and deleted_at is null
        limit 1`,
            args: [repository],
        });
        const row = result.rows[0];
        if (!row)
            return undefined;
        const clonePathTemplate = (0, import_1.normalizeClonePathTemplate)(row.clone_path_template);
        return {
            repository: (0, git_repository_1.normalizeRepositoryUrl)(row.url),
            source: "remote-database",
            ...(row.name ? { name: row.name } : {}),
            ...(row.description ? { description: row.description } : {}),
            tags: (0, project_config_fields_1.normalizeTags)(parseJson(row.tags_json)),
            folders: (0, project_config_fields_1.normalizeFolders)(parseJson(row.folders_json)),
            subpaths: (0, project_subpaths_1.normalizeSubpaths)(parseJson(row.subpaths_json)),
            allSubpaths: Boolean(row.all_subpath),
            ...(clonePathTemplate ? { clonePathTemplate } : {}),
            removePathFromName: Boolean(row.remove_path_from_name),
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("HTTP status 401")) {
            throw new Error("Remote database authentication failed. Set TURSO_AUTH_TOKEN.");
        }
        throw error;
    }
    finally {
        client.close();
    }
}
