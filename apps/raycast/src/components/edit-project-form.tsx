import { Action, ActionPanel, Form, Icon } from "@raycast/api";
import { useNavigation } from "@raycast/api";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { type JSX, useEffect, useState } from "react";
import { normalizeRepositoryUrl, repositoryName } from "@raggle-ai/local";

export type EditProjectFormValues = {
  name: string;
  description: string;
  iconColor: string;
  startupCommand: string;
  file?: string[];
  url: string;
  tags: string;
  folders: string[];
  subpaths: string;
};

type EditProjectFormFields = Partial<{
  name: boolean;
  description: boolean;
  iconColor: boolean;
  startupCommand: boolean;
  file: boolean;
  url: boolean;
  tags: boolean;
  folders: boolean;
  subpaths: boolean;
}>;

type EditProjectFormChangeValues = Pick<EditProjectFormValues, "url" | "name">;

type EditProjectFormProps = {
  navigationTitle: string;
  submitTitle: string;
  description?: string;
  initialValues: EditProjectFormValues;
  defaultCloneDirectory?: string;
  fields: EditProjectFormFields;
  extraFieldsAfterName?: (values: EditProjectFormChangeValues) => JSX.Element | null;
  onValuesChange?: (values: EditProjectFormChangeValues) => void;
  onSubmit: (values: EditProjectFormValues) => Promise<boolean>;
};

function getRepositoryNameFromUrl(url: string) {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return "";

  try {
    return repositoryName(normalizeRepositoryUrl(trimmedUrl));
  } catch {
    return "";
  }
}

function deriveLocalProjectPath(url: string, defaultCloneDirectory?: string, folderName?: string) {
  const repository = folderName?.trim() || getRepositoryNameFromUrl(url);
  if (!defaultCloneDirectory) return repository;
  if (!repository) return defaultCloneDirectory;
  return path.join(defaultCloneDirectory, repository);
}

const ignoredFolderNames = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".vercel",
  "target",
  "vendor",
]);
const folderDiscoveryDelayMs = 250;
const maxDiscoveredFolders = 500;
const maxFolderDiscoveryDepth = 3;

async function readProjectFolders(rootPath: string) {
  const folders = new Set<string>();
  const queue = [{ directory: rootPath, depth: 0 }];

  while (queue.length && folders.size < maxDiscoveredFolders) {
    const current = queue.shift();
    if (!current || current.depth >= maxFolderDiscoveryDepth) continue;

    let entries;
    try {
      entries = await readdir(current.directory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || ignoredFolderNames.has(entry.name)) continue;

      const nextPath = path.join(current.directory, entry.name);
      const relativePath = path.relative(rootPath, nextPath).split(path.sep).join("/");
      folders.add(relativePath);
      if (folders.size >= maxDiscoveredFolders) break;
      queue.push({ directory: nextPath, depth: current.depth + 1 });
    }
  }

  return [...folders].sort((left, right) => left.localeCompare(right));
}

export function EditProjectForm({
  navigationTitle,
  submitTitle,
  description,
  initialValues,
  defaultCloneDirectory,
  fields,
  extraFieldsAfterName,
  onValuesChange,
  onSubmit,
}: EditProjectFormProps) {
  const { pop } = useNavigation();
  const initialDerivedName = getRepositoryNameFromUrl(initialValues.url);
  const initialName = initialValues.name || initialDerivedName;
  const [url, setUrl] = useState(initialValues.url);
  const [name, setName] = useState(initialName);
  const [folders, setFolders] = useState(initialValues.folders);
  const [discoveredFolders, setDiscoveredFolders] = useState<string[]>([]);
  const [isNameCustomized, setIsNameCustomized] = useState(initialName !== initialDerivedName);
  const repositoryNameFromUrl = getRepositoryNameFromUrl(url);
  const derivedLocalProjectPath = deriveLocalProjectPath(url, defaultCloneDirectory, name);
  const localProjectPath = derivedLocalProjectPath;
  const shouldLoadFolderOptions = Boolean(repositoryNameFromUrl && localProjectPath.trim());

  useEffect(() => {
    let isCancelled = false;

    if (!shouldLoadFolderOptions) {
      setDiscoveredFolders([]);
      return () => {
        isCancelled = true;
      };
    }

    async function loadFolderOptions() {
      const discoveredFolders = await readProjectFolders(localProjectPath);
      if (isCancelled) return;
      setDiscoveredFolders(discoveredFolders);
    }

    const timeout = setTimeout(() => {
      void loadFolderOptions();
    }, folderDiscoveryDelayMs);

    return () => {
      isCancelled = true;
      clearTimeout(timeout);
    };
  }, [localProjectPath, shouldLoadFolderOptions]);

  const folderOptions = [...new Set([...folders, ...discoveredFolders])].sort((left, right) =>
    left.localeCompare(right),
  );

  async function handleSubmit(values: EditProjectFormValues) {
    const derivedName = getRepositoryNameFromUrl(url);
    const nextName = isNameCustomized ? name : derivedName;

    if (
      await onSubmit({
        ...values,
        url,
        name: nextName,
        folders,
      })
    ) {
      pop();
    }
  }

  function handleUrlChange(nextUrl: string) {
    setUrl(nextUrl);
    const nextName = isNameCustomized ? name : getRepositoryNameFromUrl(nextUrl);

    if (!isNameCustomized) {
      setName(nextName);
    }

    onValuesChange?.({ url: nextUrl, name: nextName });
  }

  function handleNameChange(nextName: string) {
    setName(nextName);
    setIsNameCustomized(nextName !== getRepositoryNameFromUrl(url));
    onValuesChange?.({ url, name: nextName });
  }

  return (
    <Form
      navigationTitle={navigationTitle}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={submitTitle} onSubmit={handleSubmit} icon={Icon.Check} />
        </ActionPanel>
      }
    >
      {description ? <Form.Description title={navigationTitle} text={description} /> : null}
      {description ? <Form.Separator /> : null}

      {fields.url ? (
        <Form.TextField id="url" title="Repository URL" value={url} onChange={handleUrlChange} storeValue={false} />
      ) : null}
      {fields.name ? (
        <Form.TextField id="name" title="Name" value={name} onChange={handleNameChange} storeValue={false} />
      ) : null}
      {fields.description ? (
        <Form.TextArea
          id="description"
          title="Description"
          defaultValue={initialValues.description}
          storeValue={false}
        />
      ) : null}
      {extraFieldsAfterName?.({ url, name })}
      {fields.tags ? (
        <Form.TextArea
          id="tags"
          title="Tags"
          defaultValue={initialValues.tags}
          placeholder="frontend, client\ninternal"
          info="Comma or newline separated tags"
          storeValue={false}
        />
      ) : null}
      {fields.folders ? (
        <Form.TagPicker
          id="folders"
          title="Folders"
          value={folders}
          onChange={setFolders}
          info={
            shouldLoadFolderOptions
              ? "Select relative folders discovered in the local project"
              : "Folders are available after the repository URL and Clone Directory preference are set"
          }
          storeValue={false}
        >
          {folderOptions.map((folder) => (
            <Form.TagPicker.Item key={folder} value={folder} title={folder} />
          ))}
        </Form.TagPicker>
      ) : null}
      {fields.subpaths ? (
        <Form.TextArea
          id="subpaths"
          title="Subpath Parents"
          defaultValue={initialValues.subpaths}
          placeholder="projects\npackages"
          info="Comma or newline separated relative folders whose child directories should be included"
          storeValue={false}
        />
      ) : null}

      {fields.iconColor ? (
        <Form.TextField id="iconColor" title="Icon Color" defaultValue={initialValues.iconColor} storeValue={false} />
      ) : null}
      {fields.startupCommand ? (
        <Form.TextArea
          id="startupCommand"
          title="Startup Command"
          defaultValue={initialValues.startupCommand}
          storeValue={false}
        />
      ) : null}
      {fields.file ? (
        <Form.FilePicker
          id="file"
          title="Icon File"
          allowMultipleSelection={false}
          canChooseDirectories={false}
          canChooseFiles={true}
          value={initialValues.file ?? []}
          storeValue={false}
        />
      ) : null}
    </Form>
  );
}
