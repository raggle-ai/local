import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as raycastApi from "@raycast/api";
import { extensionPaths } from "./config";
import { projectActionConfigFromSource } from "./project-action-plugin-config";
import type { ProjectActionConfig } from "@raggle-ai/local";
import type { ProjectActionContext, ProjectActionItem, ProjectActionModule } from "./project-actions";
import { projectActionsFromModule, resolveProjectActions } from "./project-actions";

const pluginCachePath = extensionPaths().pluginCachePath;
const indexFiles = ["index.ts", "index.tsx", "index.js", "index.mjs", "index.cjs"];
const pluginFileExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const compilerCacheVersion = "v10";
const requireFromExtension = createRequire(__filename);
const pluginApiPackage = "@raggle/plugins";
let typescript: typeof import("typescript") | undefined;

declare global {
  var __raggleRaycastApi: typeof raycastApi | undefined;
}

export type ProjectActionPluginDiagnostic = {
  plugin: string;
  sourceFilePath?: string;
  compiledFilePath?: string;
  actionCount: number;
  error?: string;
};

export type ProjectActionPluginLoadResult = {
  actions: ProjectActionItem[];
  diagnostics: ProjectActionPluginDiagnostic[];
};

type ImportedPlugin = {
  module: ProjectActionModule;
  sourceFilePath?: string;
  compiledFilePath?: string;
};

function isLocalPlugin(plugin: string) {
  return plugin.startsWith("/") || plugin.startsWith("file:");
}

function localPluginPath(plugin: string) {
  return plugin.startsWith("file:") ? fileURLToPath(plugin) : plugin;
}

function isTypeScriptPlugin(filePath: string) {
  return /\.tsx?$/.test(filePath);
}

function isImportUrl(specifier: string) {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(specifier);
}

function pluginCacheDirectory(filePath: string) {
  const hash = createHash("sha256").update(path.dirname(filePath)).digest("hex").slice(0, 12);
  const directory = path.join(pluginCachePath, hash);
  mkdirSync(directory, { recursive: true });

  return directory;
}

function compiledPluginPath(filePath: string) {
  const hash = pluginCompileHash(filePath);
  const cacheDirectory = pluginCacheDirectory(filePath);

  return path.join(
    cacheDirectory,
    `${path.basename(filePath).replace(/\.tsx?$/, "")}-${compilerCacheVersion}-${hash}.mjs`,
  );
}

function importSpecifiers(source: string) {
  const specifiers: string[] = [];
  const importPattern = /(?:from\s+["']|import\s*\(\s*["'])([^"']+)(["'])/g;
  let match: RegExpExecArray | null;

  while ((match = importPattern.exec(source))) {
    specifiers.push(match[1]);
  }

  return specifiers;
}

function pluginCompileHash(filePath: string, seen = new Set<string>()) {
  const resolvedFilePath = path.resolve(filePath);
  if (seen.has(resolvedFilePath)) return createHash("sha256").update(resolvedFilePath).digest("hex").slice(0, 12);

  seen.add(resolvedFilePath);

  const source = readFileSync(resolvedFilePath, "utf8");
  const hash = createHash("sha256")
    .update(compilerCacheVersion)
    .update("\0")
    .update(resolvedFilePath)
    .update("\0")
    .update(source);

  for (const specifier of importSpecifiers(source)) {
    const dependencyPath = resolveRelativePluginImport(resolvedFilePath, specifier);
    if (!dependencyPath) continue;

    hash.update("\0dependency\0");
    hash.update(path.resolve(dependencyPath));
    hash.update("\0");

    if (isTypeScriptPlugin(dependencyPath)) {
      hash.update(pluginCompileHash(dependencyPath, seen));
      continue;
    }

    try {
      const dependencyStat = statSync(dependencyPath);
      hash.update(String(dependencyStat.size));
      hash.update("\0");
      hash.update(String(dependencyStat.mtimeMs));
    } catch {
      // If a dependency disappears between resolution and hashing, let compilation fail later.
    }
  }

  return hash.digest("hex").slice(0, 12);
}

function resolveDirectoryIndex(directoryPath: string) {
  for (const fileName of indexFiles) {
    const filePath = path.join(directoryPath, fileName);
    if (existsSync(filePath)) return filePath;
  }

  return undefined;
}

function resolveLocalPluginPath(filePath: string) {
  const stat = statSync(filePath);
  if (!stat.isDirectory()) return filePath;

  const packageJsonPath = path.join(filePath, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { exports?: unknown; main?: unknown };
      const entry = typeof packageJson.main === "string" ? packageJson.main : undefined;
      if (entry) return path.resolve(filePath, entry);
    } catch {
      // Fall through to index file resolution.
    }
  }

  const indexFile = resolveDirectoryIndex(filePath);
  if (indexFile) return indexFile;

  throw new Error(`Plugin directory ${filePath} is missing package.json main or an index file`);
}

function localPluginDirectoryEntryPaths(directoryPath: string) {
  const entryPaths: string[] = [];

  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      const indexFile = resolveDirectoryIndex(entryPath);
      if (indexFile) entryPaths.push(indexFile);
      continue;
    }

    if (!entry.isFile() || indexFiles.includes(entry.name)) continue;
    if (pluginFileExtensions.has(path.extname(entry.name))) entryPaths.push(entryPath);
  }

  return entryPaths.sort((first, second) => first.localeCompare(second));
}

function expandProjectActionPlugin(plugin: string) {
  if (!isLocalPlugin(plugin)) return [plugin];

  const filePath = localPluginPath(plugin);
  if (!statSync(filePath).isDirectory()) return [plugin];

  return [plugin, ...localPluginDirectoryEntryPaths(filePath)];
}

function expandProjectActionPlugins(plugins: string[] | undefined) {
  return [...new Set((plugins ?? []).flatMap(expandProjectActionPlugin))];
}

function resolveRelativePluginImport(sourceFilePath: string, specifier: string) {
  if (!specifier.startsWith(".")) return undefined;

  const basePath = path.resolve(path.dirname(sourceFilePath), specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.mjs`,
    `${basePath}.js`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.mjs"),
    path.join(basePath, "index.js"),
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

function installRaycastPluginApi() {
  globalThis.__raggleRaycastApi = raycastApi;
}

function pluginApiShimPath(sourceFilePath: string) {
  const filePath = path.join(pluginCacheDirectory(sourceFilePath), "raggle-plugins-api.mjs");

  writeFileSync(
    filePath,
    `function raycastExport(name) {
  const api = globalThis.__raggleRaycastApi;
  if (!api || !(name in api)) {
    throw new Error(\`@raggle/plugins export "\${name}" is only available inside the Raggle plugin manager\`);
  }

  return api[name];
}

function raycastProxy(name) {
  return new Proxy(function raggleRaycastProxy() {}, {
    apply(_target, thisArg, args) {
      return Reflect.apply(raycastExport(name), thisArg, args);
    },
    construct(_target, args) {
      return Reflect.construct(raycastExport(name), args);
    },
    get(_target, property) {
      return raycastExport(name)[property];
    },
    has(_target, property) {
      return property in raycastExport(name);
    },
    ownKeys() {
      return Reflect.ownKeys(raycastExport(name));
    },
    getOwnPropertyDescriptor(_target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(raycastExport(name), property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
    set(_target, property, value) {
      raycastExport(name)[property] = value;
      return true;
    },
  });
}

export const Action = raycastProxy("Action");
export const ActionPanel = raycastProxy("ActionPanel");
export const Alert = raycastProxy("Alert");
export const Clipboard = raycastProxy("Clipboard");
export const Color = raycastProxy("Color");
export const Detail = raycastProxy("Detail");
export const Form = raycastProxy("Form");
export const Icon = raycastProxy("Icon");
export const Keyboard = raycastProxy("Keyboard");
export const List = raycastProxy("List");
export const Toast = raycastProxy("Toast");
export const closeMainWindow = raycastProxy("closeMainWindow");
export const confirmAlert = raycastProxy("confirmAlert");
export const getPreferenceValues = raycastProxy("getPreferenceValues");
export const launchCommand = raycastProxy("launchCommand");
export const open = raycastProxy("open");
export const openCommandPreferences = raycastProxy("openCommandPreferences");
export const openExtensionPreferences = raycastProxy("openExtensionPreferences");
export const popToRoot = raycastProxy("popToRoot");
export const showHUD = raycastProxy("showHUD");
export const showInFinder = raycastProxy("showInFinder");
export const showToast = raycastProxy("showToast");

export function defineProjectActions(factory) {
  return factory;
}

export function defineProjectConfig(config) {
  return config;
}

export async function resolveProjectActions(actions, context) {
  if (!actions) return [];
  return typeof actions === "function" ? actions(context) : actions;
}

export function projectActionsFromModule(module) {
  if (typeof module === "function" || Array.isArray(module)) return module;
  return module.projectActions ?? module.default;
}

export function projectConfigFromModule(module) {
  if (typeof module === "function" || Array.isArray(module)) return undefined;
  return module.projectConfig ?? module.config;
}
`,
    "utf8",
  );

  return filePath;
}

function packageDirectoryName(specifier: string) {
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;

  return parts[0];
}

function packageSubpath(specifier: string) {
  const packageName = packageDirectoryName(specifier);
  return specifier.slice(packageName.length).replace(/^\//, "");
}

function findPackageDirectory(startFilePath: string, packageName: string) {
  let directory = path.dirname(startFilePath);

  while (true) {
    const candidate = path.join(directory, "node_modules", packageName);
    if (existsSync(path.join(candidate, "package.json"))) return candidate;

    const parent = path.dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function packageExportPath(packageJson: Record<string, unknown>, subpath: string) {
  const exports = packageJson.exports;
  const key = subpath ? `./${subpath}` : ".";

  if (typeof exports === "string" && key === ".") return exports;
  if (!exports || typeof exports !== "object") return undefined;

  const value = (exports as Record<string, unknown>)[key];
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  return typeof record.import === "string"
    ? record.import
    : typeof record.default === "string"
      ? record.default
      : undefined;
}

function resolvePackageImportFromDirectory(directory: string, specifier: string) {
  const packageJson = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8")) as Record<string, unknown>;
  const subpath = packageSubpath(specifier);
  const exportPath = packageExportPath(packageJson, subpath);
  if (exportPath) return path.resolve(directory, exportPath);

  if (subpath) return path.resolve(directory, subpath);
  if (typeof packageJson.module === "string") return path.resolve(directory, packageJson.module);
  if (typeof packageJson.main === "string") return path.resolve(directory, packageJson.main);

  return resolveDirectoryIndex(directory);
}

function resolvePackageImport(sourceFilePath: string, specifier: string) {
  const packageName = packageDirectoryName(specifier);
  const directory = findPackageDirectory(sourceFilePath, packageName);
  if (!directory) return undefined;

  return resolvePackageImportFromDirectory(directory, specifier);
}

function resolveExtensionPackageImport(specifier: string) {
  const packageName = packageDirectoryName(specifier);
  const directory = findPackageDirectory(__filename, packageName);
  if (!directory) return undefined;

  return resolvePackageImportFromDirectory(directory, specifier);
}

function resolveBarePluginImport(sourceFilePath: string, specifier: string) {
  if (specifier.startsWith(".") || specifier.startsWith("node:") || isImportUrl(specifier)) return undefined;
  if (specifier === pluginApiPackage) return pluginApiShimPath(sourceFilePath);

  try {
    return createRequire(sourceFilePath).resolve(specifier);
  } catch {
    const packagePath = resolvePackageImport(sourceFilePath, specifier);
    if (packagePath) return packagePath;

    const extensionPackagePath = resolveExtensionPackageImport(specifier);
    if (extensionPackagePath) return extensionPackagePath;

    try {
      return requireFromExtension.resolve(specifier);
    } catch {
      return undefined;
    }
  }
}

function resolvePluginImport(sourceFilePath: string, specifier: string) {
  return resolveRelativePluginImport(sourceFilePath, specifier) ?? resolveBarePluginImport(sourceFilePath, specifier);
}

function rewritePluginOutput(outputText: string, sourceFilePath: string) {
  const outputWithSourceImportMeta = outputText.replace(
    /\bimport\.meta\.url\b/g,
    JSON.stringify(pathToFileURL(sourceFilePath).href),
  );

  return outputWithSourceImportMeta.replace(
    /(from\s+["']|import\s*\(\s*["'])([^"']+)(["'])/g,
    (match, prefix, specifier, suffix) => {
      const resolvedPath = resolvePluginImport(sourceFilePath, specifier);
      if (!resolvedPath) return match;

      const importPath = isTypeScriptPlugin(resolvedPath) ? compileTypeScriptPlugin(resolvedPath) : resolvedPath;
      return `${prefix}${pathToFileURL(importPath).href}${suffix}`;
    },
  );
}

function compileTypeScriptPlugin(filePath: string) {
  const outputPath = compiledPluginPath(filePath);

  try {
    statSync(outputPath);
    return outputPath;
  } catch {
    // Compile below when the cache entry does not exist.
  }

  const source = readFileSync(filePath, "utf8");
  const ts = (typescript ??= requireFromExtension("typescript") as typeof import("typescript"));
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  });

  writeFileSync(outputPath, rewritePluginOutput(output.outputText, filePath), "utf8");
  return outputPath;
}

async function importLocalPlugin(plugin: string) {
  const filePath = resolveLocalPluginPath(localPluginPath(plugin));
  const importPath = isTypeScriptPlugin(filePath) ? compileTypeScriptPlugin(filePath) : filePath;
  const url = pathToFileURL(importPath).href;
  installRaycastPluginApi();

  return {
    module: (await import(url)) as ProjectActionModule,
    sourceFilePath: filePath,
    compiledFilePath: importPath === filePath ? undefined : importPath,
  };
}

async function importPackagePlugin(plugin: string, projectListFile?: string) {
  const requireFromProjectList = packagePluginResolver(projectListFile);
  const resolvedPath = requireFromProjectList.resolve(plugin);
  installRaycastPluginApi();

  try {
    return {
      module: requireFromProjectList(plugin) as ProjectActionModule,
      sourceFilePath: resolvedPath,
    };
  } catch {
    return {
      module: (await import(pathToFileURL(resolvedPath).href)) as ProjectActionModule,
      sourceFilePath: resolvedPath,
    };
  }
}

async function importPlugin(plugin: string, projectListFile?: string): Promise<ImportedPlugin> {
  if (isLocalPlugin(plugin)) return importLocalPlugin(plugin);

  return importPackagePlugin(plugin, projectListFile);
}

function projectActionContextForPlugin(context: ProjectActionContext, plugin: string, importedPlugin: ImportedPlugin) {
  if (!importedPlugin.sourceFilePath) {
    return {
      ...context,
      pluginPath: plugin,
    };
  }

  const pluginDirectory = path.dirname(importedPlugin.sourceFilePath);

  return {
    ...context,
    pluginPath: plugin,
    pluginFilePath: importedPlugin.sourceFilePath,
    pluginDirectory,
    resolvePluginPath: (...segments: string[]) => path.resolve(pluginDirectory, ...segments),
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function packagePluginResolver(projectListFile?: string) {
  if (projectListFile && existsSync(projectListFile)) {
    return createRequire(projectListFile);
  }

  return requireFromExtension;
}

function readProjectActionPluginConfig(plugin: string, projectListFile?: string): ProjectActionConfig | undefined {
  let filePath: string;

  if (isLocalPlugin(plugin)) {
    filePath = resolveLocalPluginPath(localPluginPath(plugin));
  } else {
    filePath = packagePluginResolver(projectListFile).resolve(plugin);
  }

  return projectActionConfigFromSource(readFileSync(filePath, "utf8"));
}

export async function loadProjectActionPluginsWithDiagnostics(
  plugins: string[] | undefined,
  context: ProjectActionContext,
  projectListFile?: string,
): Promise<ProjectActionPluginLoadResult> {
  if (!plugins?.length) {
    return {
      actions: [],
      diagnostics: [],
    };
  }

  const results: { actions: ProjectActionItem[]; diagnostic: ProjectActionPluginDiagnostic }[] = [];

  for (const plugin of expandProjectActionPlugins(plugins)) {
    let importedPlugin: ImportedPlugin | undefined;

    try {
      importedPlugin = await importPlugin(plugin, projectListFile);
      const pluginContext = projectActionContextForPlugin(context, plugin, importedPlugin);
      const actions = await resolveProjectActions(projectActionsFromModule(importedPlugin.module), pluginContext);

      results.push({
        actions,
        diagnostic: {
          plugin,
          sourceFilePath: importedPlugin.sourceFilePath,
          compiledFilePath: importedPlugin.compiledFilePath,
          actionCount: actions.length,
        },
      });
    } catch (error) {
      results.push({
        actions: [],
        diagnostic: {
          plugin,
          sourceFilePath: importedPlugin?.sourceFilePath,
          compiledFilePath: importedPlugin?.compiledFilePath,
          actionCount: 0,
          error: errorMessage(error),
        },
      });
    }
  }

  return {
    actions: results
      .flatMap((result) => result.actions)
      .filter((action, index, actions) => actions.findIndex((candidate) => candidate.id === action.id) === index),
    diagnostics: results.map((result) => result.diagnostic),
  };
}

export async function loadProjectActionPlugins(
  plugins: string[] | undefined,
  context: ProjectActionContext,
  projectListFile?: string,
): Promise<ProjectActionItem[]> {
  const result = await loadProjectActionPluginsWithDiagnostics(plugins, context, projectListFile);
  return result.actions;
}

export async function loadProjectActionPluginConfigs(
  plugins: string[] | undefined,
  projectListFile?: string,
): Promise<ProjectActionConfig[]> {
  if (!plugins?.length) return [];

  const configs: (ProjectActionConfig | undefined)[] = [];

  for (const plugin of expandProjectActionPlugins(plugins)) {
    try {
      configs.push(readProjectActionPluginConfig(plugin, projectListFile));
    } catch (error) {
      console.warn(`Failed to load project action config from ${plugin}:`, error);
      configs.push(undefined);
    }
  }

  return configs.filter((config): config is ProjectActionConfig => Boolean(config));
}
