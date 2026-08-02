import { Action, ActionPanel, Icon } from "@raycast/api";
import { type ComponentProps } from "react";

/**
 * Props for LocalFileActions component
 */
type LocalFileActionsProps = {
  /** The file or folder path to perform actions on */
  filePath: string;
  /** Optional actions to show before the standard file actions */
  extraActions?: ComponentProps<typeof ActionPanel.Section>["children"];
  /** Optional title override for the "Copy File Path" action */
  copyTitle?: string;
  /** Optional title override for the "Open in Default App" action */
  openTitle?: string;
  /** Optional title override for the "Show in Finder" action */
  showInFinderTitle?: string;
};

/**
 * Shared file/folder actions that appear in a "File" section.
 * Provides:
 * - Copy File Path (Cmd+Shift+.)
 * - Open in Default App (Cmd+Shift+O)
 * - Show in Finder (Cmd+Shift+Enter)
 */
export function LocalFileActions({
  filePath,
  extraActions,
  copyTitle = "Copy File Path",
  openTitle = "Open in Default App",
  showInFinderTitle = "Show in Finder",
}: LocalFileActionsProps) {
  return (
    <ActionPanel.Section title="File">
      {extraActions}
      <Action.CopyToClipboard
        title={copyTitle}
        content={filePath}
        icon={Icon.Document}
        shortcut={{ modifiers: ["cmd", "shift"], key: "." }}
      />
      <Action.Open
        title={openTitle}
        target={filePath}
        icon={Icon.Document}
        shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
      />
      <Action.ShowInFinder
        title={showInFinderTitle}
        path={filePath}
        icon={Icon.Finder}
        shortcut={{ modifiers: ["cmd", "shift"], key: "return" }}
      />
    </ActionPanel.Section>
  );
}
