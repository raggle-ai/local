"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProjectActionPluginDirectories = resolveProjectActionPluginDirectories;
exports.applyProjectActionPlugins = applyProjectActionPlugins;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
function resolveProjectActionPluginDirectories(projectActionDirectories) {
    return projectActionDirectories.map((projectActionDirectory) => {
        const pluginsDirectory = node_path_1.default.join(projectActionDirectory, "plugins");
        return (0, node_fs_1.existsSync)(pluginsDirectory) ? pluginsDirectory : projectActionDirectory;
    });
}
function applyProjectActionPlugins(repositories, projectActionDirectories) {
    const plugins = resolveProjectActionPluginDirectories(projectActionDirectories);
    if (!plugins.length)
        return repositories;
    return repositories.map((repository) => ({
        ...repository,
        plugins: [...new Set([...plugins, ...repository.plugins])],
    }));
}
