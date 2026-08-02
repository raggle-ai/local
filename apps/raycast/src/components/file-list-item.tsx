import { Action, ActionPanel, Icon, List } from "@raycast/api";
import type { ComponentProps } from "react";
import { EnhancedListActionPanel } from "./enhanced-list";

type FileListItemProps = Omit<ComponentProps<typeof List.Item>, "actions"> & {
  onSelect: ComponentProps<typeof ActionPanel>["children"];
  onCommandSelect?: ComponentProps<typeof ActionPanel>["children"];
  actions?: ComponentProps<typeof ActionPanel>["children"];
  filePath?: string;
};

export function FileListItem({ onSelect, onCommandSelect, actions, filePath, ...itemProps }: FileListItemProps) {
  return (
    <List.Item
      {...itemProps}
      actions={
        <EnhancedListActionPanel onSelect={onSelect} onCommandSelect={onCommandSelect}>
          {actions}
          {filePath ? (
            <ActionPanel.Section title="File">
              <Action.CopyToClipboard
                title="Copy File Path"
                content={filePath}
                icon={Icon.Document}
                shortcut={{ modifiers: ["cmd", "shift"], key: "." }}
              />
              <Action.Open
                title="Open in Default App"
                target={filePath}
                icon={Icon.Document}
                shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
              />
              <Action.ShowInFinder
                title="Show in Finder"
                path={filePath}
                icon={Icon.Finder}
                shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
              />
            </ActionPanel.Section>
          ) : null}
        </EnhancedListActionPanel>
      }
    />
  );
}
