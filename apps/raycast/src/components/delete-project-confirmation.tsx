import { Action, ActionPanel, Detail, Icon, useNavigation } from "@raycast/api";
import { useState } from "react";
import { type RaycastProject } from "@raggle-ai/raycast-adapter";

type DeleteProjectConfirmationProps = {
  item: RaycastProject;
  onDeleteProject: (project: RaycastProject) => Promise<boolean>;
};

function codeBlock(value: string) {
  return `\`${value.replace(/`/g, "\\`")}\``;
}

export function DeleteProjectConfirmation({ item, onDeleteProject }: DeleteProjectConfirmationProps) {
  const { pop } = useNavigation();
  const [isDeleting, setIsDeleting] = useState(false);
  const projectTitle = item.name ?? item.worktree;
  const markdown = `
<div align="center">

# Delete ${projectTitle}?

This removes the project from Raggle's project source.

${codeBlock(item.remoteUrl)}

${codeBlock(item.worktree)}

</div>
`;

  async function confirmDelete() {
    setIsDeleting(true);
    const deleted = await onDeleteProject(item);
    setIsDeleting(false);
    if (deleted) pop();
  }

  return (
    <Detail
      isLoading={isDeleting}
      navigationTitle={`Delete ${projectTitle}`}
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action
            title="Confirm Delete Project"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            shortcut={{ modifiers: ["cmd", "shift"], key: "delete" }}
            onAction={confirmDelete}
          />
          <Action title="Cancel" icon={Icon.XMarkCircle} shortcut={{ modifiers: ["cmd"], key: "." }} onAction={pop} />
          <Action.CopyToClipboard title="Copy Repository URL" content={item.remoteUrl} icon={Icon.Clipboard} />
        </ActionPanel>
      }
    />
  );
}
