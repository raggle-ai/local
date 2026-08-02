import { Action, ActionPanel, Keyboard, List } from "@raycast/api";
import shortcutItems from "./shortcuts.json";

type ShortcutItem = {
  id: string;
  title: string;
  subtitle: string;
  shortcut: Keyboard.Shortcut;
  section: string;
};

const projectShortcuts = shortcutItems as ShortcutItem[];

const modifierGlyphs: Record<Keyboard.KeyModifier, string> = {
  cmd: "⌘",
  ctrl: "⌃",
  opt: "⌥",
  shift: "⇧",
  alt: "⌥",
  windows: "⊞",
};

const keyGlyphs: Partial<Record<Keyboard.KeyEquivalent, string>> = {
  return: "↵",
  delete: "⌫",
  arrowUp: "↑",
  arrowDown: "↓",
  arrowLeft: "←",
  arrowRight: "→",
};

function shortcutLabel(shortcut: Keyboard.Shortcut) {
  const platformShortcut = "modifiers" in shortcut ? shortcut : shortcut.macOS;

  return [
    ...platformShortcut.modifiers.map((modifier) => modifierGlyphs[modifier]),
    keyGlyphs[platformShortcut.key] ?? platformShortcut.key.toUpperCase(),
  ].join(" ");
}

export function Shortcuts() {
  const sections = [...new Set(projectShortcuts.map((item) => item.section))];

  return (
    <List navigationTitle="Project Shortcuts" searchBarPlaceholder="Search shortcuts">
      {sections.map((section) => {
        const items = projectShortcuts.filter((item) => item.section === section);

        return (
          <List.Section key={section} title={section} subtitle={String(items.length)}>
            {items.map((item) => {
              const label = shortcutLabel(item.shortcut);

              return (
                <List.Item
                  key={item.id}
                  title={item.title}
                  subtitle={item.subtitle}
                  accessories={[{ tag: label }]}
                  actions={
                    <ActionPanel>
                      <Action.CopyToClipboard title="Copy Shortcut" content={label} />
                    </ActionPanel>
                  }
                />
              );
            })}
          </List.Section>
        );
      })}
    </List>
  );
}
