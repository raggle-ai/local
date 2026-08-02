import { Action, ActionPanel, Form, Icon, useNavigation } from "@raycast/api";
import { readdirSync } from "node:fs";
import { useState } from "react";
import { projectTitle } from "../lib/project";
import { type Project } from "../lib/project-store";

type AddSubpathFormProps = {
  item: Project & { repositoryRoot?: string };
  onSubmit: (subpath: string, options?: { createFolder?: boolean }) => Promise<boolean>;
};

const newFolderSubpathOption = "__new-folder__";

function projectRepositoryRoot(item: Project & { repositoryRoot?: string }) {
  return typeof item.repositoryRoot === "string" ? item.repositoryRoot : item.worktree;
}

function firstLayerDirectoryOptions(rootPath: string) {
  try {
    return readdirSync(rootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

export function AddSubpathForm({ item, onSubmit }: AddSubpathFormProps) {
  const { pop } = useNavigation();
  const rootPath = projectRepositoryRoot(item);
  const options = firstLayerDirectoryOptions(rootPath);
  const [subpath, setSubpath] = useState(options[0] ?? newFolderSubpathOption);
  const [newFolderName, setNewFolderName] = useState("");
  const isNewFolder = subpath === newFolderSubpathOption;

  async function handleSubmit() {
    const submittedSubpath = isNewFolder ? newFolderName : subpath;
    if (!submittedSubpath) return;

    if (await onSubmit(submittedSubpath, { createFolder: isNewFolder })) {
      pop();
    }
  }

  return (
    <Form
      navigationTitle="Add Subpath"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add Subpath" icon={Icon.Check} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description title="Project" text={`${projectTitle(item)}\n${rootPath}`} />
      <Form.Dropdown
        id="subpath"
        title="Subpath Parent"
        value={subpath}
        onChange={setSubpath}
        info="Choose a first-level folder whose child directories should be included as projects."
        storeValue={false}
      >
        <Form.Dropdown.Item value={newFolderSubpathOption} title="New Folder" />
        {options.map((option) => (
          <Form.Dropdown.Item key={option} value={option} title={option} />
        ))}
      </Form.Dropdown>
      {isNewFolder ? (
        <Form.TextField
          id="newFolderName"
          title="Folder Name"
          value={newFolderName}
          onChange={setNewFolderName}
          placeholder="new-folder"
          storeValue={false}
        />
      ) : null}
    </Form>
  );
}
