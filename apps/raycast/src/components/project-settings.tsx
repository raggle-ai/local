import {
  Action,
  ActionPanel,
  Form,
  Icon,
  type Keyboard,
  List,
  Toast,
  openExtensionPreferences,
  showToast,
  useNavigation,
} from "@raycast/api";
import { existsSync } from "node:fs";
import path from "node:path";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  defaultOpenInTargetForType,
  isDefaultOpenInTargetForType,
  multiOpenInShortcutForIndex,
  type DefaultOpenInAppType,
  type OpenInShortcutSetting,
  type OpenInTarget,
} from "../config/open-in-apps";
import { saveStandardProjectsSettings, type ProjectSourceType, type StandardProjectsSettings } from "../lib/config";
import { readImportedRepositoryRows, writeImportedRepositoryRows } from "@raggle-ai/local";
import {
  appPathFromOpenInTarget,
  appTarget,
  installedOpenInOptions,
  openInOptionForTarget,
  openInOptions,
} from "../lib/open-in";
import {
  importTursoProjectRows,
  readTursoProjectRows,
  testTursoProjectSource,
} from "../lib/project-source/turso-source";
import { GitSettingsForm, gitSettingsSummary } from "./git-settings";

const customOpenInPickerValue = "__choose_custom_open_in_app__";

type ProjectSettingsState = {
  projectSource?: ProjectSourceType;
  projectListFile: string;
  cloneDirectory: string;
  projectActionsDirectory?: string[];
  openInTarget: OpenInTarget;
  defaultTerminalTarget?: OpenInTarget;
  defaultIdeTarget?: OpenInTarget;
  defaultAiClientTarget?: OpenInTarget;
  defaultDocumentsTarget?: OpenInTarget;
  defaultGitDiffTarget?: OpenInTarget;
  multiOpenInTargets?: OpenInTarget[];
  multiOpenInShortcuts?: OpenInShortcutSetting[];
  gitCloneAccount?: string;
  gitPullRequestAuthors?: string[];
  tursoDatabaseUrl?: string;
  tursoAuthToken?: string;
};

type ProjectSettingsProps = {
  initialSettings: ProjectSettingsState;
  initialPane?: "turso";
  onSaved: (settings: StandardProjectsSettings) => void;
};

type SaveProjectSettings = (settings: ProjectSettingsState) => Promise<void>;

function defaultAppOptionsForType(type: DefaultOpenInAppType, selectedTarget: OpenInTarget) {
  const installedOptions = installedOpenInOptions().filter((option) =>
    isDefaultOpenInTargetForType(option.target, type),
  );
  const selectedOption = openInOptionForTarget(selectedTarget);
  const fallbackOptions = openInOptions.filter((option) => isDefaultOpenInTargetForType(option.target, type));

  return [
    ...installedOptions,
    ...(installedOptions.some((option) => option.target === selectedOption.target) ? [] : [selectedOption]),
    ...fallbackOptions.filter((option) => !installedOptions.some((installed) => installed.target === option.target)),
  ];
}

function openInOptionsForValue(openInTarget: OpenInTarget | typeof customOpenInPickerValue) {
  return openInOptionsForValues(openInTarget === customOpenInPickerValue ? [] : [openInTarget]);
}

function openInOptionsForValues(openInTargets: OpenInTarget[]) {
  const installedOptions = installedOpenInOptions();
  const selectedOpenInOptions = openInTargets.map(openInOptionForTarget);

  return [
    ...installedOptions,
    ...selectedOpenInOptions.filter(
      (selectedOption) => !installedOptions.some((option) => option.target === selectedOption.target),
    ),
  ];
}

function settingsTitle(value: string | undefined, fallback: string) {
  return value?.trim() ? value : fallback;
}

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

const shortcutAliases: Record<string, Keyboard.KeyEquivalent> = {
  enter: "return",
  esc: "escape",
  del: "delete",
  backspace: "delete",
  up: "arrowUp",
  down: "arrowDown",
  left: "arrowLeft",
  right: "arrowRight",
};

const keyEquivalents = new Set<Keyboard.KeyEquivalent>([
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  ".",
  ",",
  ";",
  "=",
  "+",
  "-",
  "[",
  "]",
  "{",
  "}",
  "/",
  "\\",
  "'",
  "`",
  "^",
  "@",
  "$",
  "return",
  "delete",
  "deleteForward",
  "tab",
  "arrowUp",
  "arrowDown",
  "arrowLeft",
  "arrowRight",
  "pageUp",
  "pageDown",
  "home",
  "end",
  "space",
  "escape",
]);

type OpenInShortcutRow = {
  id: string;
  target: OpenInTarget;
  shortcutText: string;
};

function parseShortcut(input: string): Keyboard.Shortcut | undefined {
  const parts = input
    .trim()
    .toLowerCase()
    .replace(/⌘/g, "cmd")
    .replace(/⌥/g, "opt")
    .replace(/⌃/g, "ctrl")
    .replace(/⇧/g, "shift")
    .split(/[+\s]+/)
    .filter(Boolean);

  const modifiers: Keyboard.KeyModifier[] = [];
  let key: Keyboard.KeyEquivalent | undefined;

  for (const part of parts) {
    if (part === "command") {
      modifiers.push("cmd");
      continue;
    }
    if (part === "option") {
      modifiers.push("opt");
      continue;
    }
    if (part === "control") {
      modifiers.push("ctrl");
      continue;
    }
    if (part === "cmd" || part === "ctrl" || part === "opt" || part === "shift" || part === "alt") {
      modifiers.push(part);
      continue;
    }

    const candidate = shortcutAliases[part] ?? part;
    if (keyEquivalents.has(candidate as Keyboard.KeyEquivalent)) {
      key = candidate as Keyboard.KeyEquivalent;
    }
  }

  if (!key || !modifiers.length) return undefined;

  return { modifiers: [...new Set(modifiers)], key };
}

function shortcutSettingsFromRows(rows: OpenInShortcutRow[]) {
  return rows.map((row) => {
    const shortcut = parseShortcut(row.shortcutText);
    return shortcut ? { target: row.target, shortcut } : undefined;
  });
}

function shortcutRowsFromSettings(settings: ProjectSettingsState): OpenInShortcutRow[] {
  const configuredShortcuts = settings.multiOpenInShortcuts?.length
    ? settings.multiOpenInShortcuts
    : settings.multiOpenInTargets
        ?.map((target, index) => {
          const shortcut = multiOpenInShortcutForIndex(index);
          return shortcut ? { target, shortcut } : undefined;
        })
        .filter((item): item is OpenInShortcutSetting => Boolean(item));

  return (configuredShortcuts ?? []).map((item, index) => ({
    id: `${index}-${item.target}`,
    target: item.target,
    shortcutText: shortcutLabel(item.shortcut),
  }));
}

function shortcutSummary(shortcuts: OpenInShortcutSetting[] | undefined) {
  if (!shortcuts?.length) return "No shortcut apps";

  return shortcuts
    .map((item) => `${shortcutLabel(item.shortcut)} ${openInOptionForTarget(item.target).title}`)
    .join("\n");
}

export function ProjectSettings({ initialSettings, initialPane, onSaved }: ProjectSettingsProps) {
  const { push } = useNavigation();
  const [settings, setSettings] = useState<ProjectSettingsState>(initialSettings);
  const didOpenInitialPane = useRef(false);
  const openInOption = openInOptionForTarget(settings.openInTarget);
  const defaultTerminalOption = openInOptionForTarget(defaultOpenInTargetForType(settings, "terminal"));
  const defaultIdeOption = openInOptionForTarget(defaultOpenInTargetForType(settings, "ide"));
  const defaultAiClientOption = openInOptionForTarget(defaultOpenInTargetForType(settings, "aiClient"));
  const defaultDocumentsOption = openInOptionForTarget(defaultOpenInTargetForType(settings, "documents"));
  const defaultGitDiffOption = openInOptionForTarget(defaultOpenInTargetForType(settings, "gitDiff"));

  async function saveSettings(nextSettings: ProjectSettingsState) {
    await saveStandardProjectsSettings(nextSettings);
    setSettings(nextSettings);
    onSaved(nextSettings);
    await showToast({ style: Toast.Style.Success, title: "Project settings saved" });
  }

  useEffect(() => {
    if (didOpenInitialPane.current || initialPane !== "turso") return;

    didOpenInitialPane.current = true;
    push(<TursoSettingsForm settings={settings} onSave={saveSettings} />);
  }, [initialPane, push, settings, saveSettings]);

  return (
    <List navigationTitle="Project Settings" searchBarPlaceholder="Search settings...">
      <List.Section title="Settings">
        <List.Item
          title="Open In"
          subtitle={`${openInOption.title} / ${defaultTerminalOption.title} / ${defaultIdeOption.title} / ${defaultAiClientOption.title} / ${defaultDocumentsOption.title} / ${defaultGitDiffOption.title}`}
          icon={openInOption.icon}
          accessories={[
            { text: "Default opener" },
            { text: "Default apps" },
            ...(settings.multiOpenInShortcuts?.length
              ? [{ tag: `${settings.multiOpenInShortcuts.length} shortcuts` }]
              : []),
          ]}
          actions={
            <SettingsActionPanel
              onOpen={() => push(<OpenInSettingsForm settings={settings} onSave={saveSettings} />)}
            />
          }
        />
        <List.Item
          title="Projects"
          subtitle={settingsTitle(settings.projectListFile, "Choose source, list file, and clone directory")}
          icon={Icon.Folder}
          accessories={[{ text: settings.projectSource === "turso" ? "Turso" : "JSON" }]}
          actions={
            <SettingsActionPanel
              onOpen={() => push(<ProjectSourceSettingsForm settings={settings} onSave={saveSettings} />)}
            />
          }
        />
        <List.Item
          title="Project Actions"
          subtitle={`${settings.projectActionsDirectory?.length ?? 0} folder${
            settings.projectActionsDirectory?.length === 1 ? "" : "s"
          }`}
          icon={Icon.Hammer}
          actions={
            <SettingsActionPanel
              onOpen={() => push(<ProjectActionsSettingsForm settings={settings} onSave={saveSettings} />)}
            />
          }
        />
        <List.Item
          title="Git"
          subtitle={gitSettingsSummary(settings)}
          icon={Icon.Code}
          accessories={[{ text: "Clone" }, { text: "Pull requests" }]}
          actions={
            <SettingsActionPanel onOpen={() => push(<GitSettingsForm settings={settings} onSave={saveSettings} />)} />
          }
        />
        <List.Item
          title="Turso"
          subtitle={settings.tursoDatabaseUrl?.trim() ? settings.tursoDatabaseUrl : "Database not configured"}
          icon={Icon.Network}
          accessories={[{ text: settings.projectSource === "turso" ? "Active" : "Optional" }]}
          actions={
            <SettingsActionPanel onOpen={() => push(<TursoSettingsForm settings={settings} onSave={saveSettings} />)} />
          }
        />
      </List.Section>
    </List>
  );
}

function SettingsActionPanel({ onOpen }: { onOpen: () => void }) {
  return (
    <ActionPanel>
      <Action title="Open" icon={Icon.ArrowRight} onAction={onOpen} />
      <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
    </ActionPanel>
  );
}

function ProjectSourceSettingsForm({
  settings,
  onSave,
}: {
  settings: ProjectSettingsState;
  onSave: SaveProjectSettings;
}) {
  const { pop } = useNavigation();
  const [projectSource, setProjectSource] = useState<ProjectSourceType>(settings.projectSource ?? "json-file");
  const [projectListFile, setProjectListFile] = useState<string[]>(
    settings.projectListFile ? [settings.projectListFile] : [],
  );
  const [cloneDirectory, setCloneDirectory] = useState<string[]>(
    settings.cloneDirectory ? [settings.cloneDirectory] : [],
  );

  async function handleSubmit() {
    const nextProjectListFile = projectListFile[0];
    const nextCloneDirectory = cloneDirectory[0];

    if (projectSource === "json-file" && (!nextProjectListFile || !existsSync(nextProjectListFile))) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid projects list file",
        message: "Choose an existing file.",
      });
      return;
    }

    if (!nextCloneDirectory || !existsSync(nextCloneDirectory)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid starting point",
        message: "Choose an existing folder.",
      });
      return;
    }

    await onSave({
      ...settings,
      projectSource,
      projectListFile: nextProjectListFile,
      cloneDirectory: nextCloneDirectory,
    });
    pop();
  }

  return (
    <Form
      navigationTitle="Projects"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Projects Settings" icon={Icon.Check} onSubmit={handleSubmit} />
          <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="projectSource"
        title="Project Source"
        value={projectSource}
        onChange={(value) => setProjectSource(value as ProjectSourceType)}
      >
        <Form.Dropdown.Item value="json-file" title="JSON File" icon={Icon.Document} />
        <Form.Dropdown.Item value="turso" title="Turso/libSQL" icon={Icon.Network} />
      </Form.Dropdown>
      <Form.FilePicker
        id="projectListFile"
        title="Projects List File"
        allowMultipleSelection={false}
        canChooseDirectories={false}
        canChooseFiles={true}
        value={projectListFile}
        onChange={setProjectListFile}
        info="JSON file containing imported repositories."
      />
      <Form.FilePicker
        id="cloneDirectory"
        title="Clone Directory"
        allowMultipleSelection={false}
        canChooseDirectories={true}
        canChooseFiles={false}
        value={cloneDirectory}
        onChange={setCloneDirectory}
        info="Projects clone into a repository folder inside this directory."
      />
    </Form>
  );
}

function OpenInSettingsForm({ settings, onSave }: { settings: ProjectSettingsState; onSave: SaveProjectSettings }) {
  const { pop } = useNavigation();
  const [openInTarget, setOpenInTarget] = useState<OpenInTarget | typeof customOpenInPickerValue>(
    openInOptionForTarget(settings.openInTarget).target,
  );
  const [defaultTerminal, setDefaultTerminal] = useState<OpenInTarget>(
    defaultOpenInTargetForType(settings, "terminal"),
  );
  const [defaultIde, setDefaultIde] = useState<OpenInTarget>(defaultOpenInTargetForType(settings, "ide"));
  const [defaultAiClient, setDefaultAiClient] = useState<OpenInTarget>(
    defaultOpenInTargetForType(settings, "aiClient"),
  );
  const [defaultDocuments, setDefaultDocuments] = useState<OpenInTarget>(
    defaultOpenInTargetForType(settings, "documents"),
  );
  const [defaultGitDiff, setDefaultGitDiff] = useState<OpenInTarget>(defaultOpenInTargetForType(settings, "gitDiff"));
  const initialCustomOpenInApp = appPathFromOpenInTarget(settings.openInTarget);
  const [customOpenInApp, setCustomOpenInApp] = useState<string[]>(
    initialCustomOpenInApp ? [initialCustomOpenInApp] : [],
  );
  const isChoosingCustomOpenInApp = openInTarget === customOpenInPickerValue;
  const currentOpenInTarget = openInTarget === customOpenInPickerValue ? settings.openInTarget : openInTarget;
  const [shortcutRows, setShortcutRows] = useState<OpenInShortcutRow[]>(shortcutRowsFromSettings(settings));
  const shortcutTargets = shortcutRows.map((row) => row.target);
  const multiOpenInOptions = openInOptionsForValues([
    ...(openInTarget === customOpenInPickerValue ? [] : [openInTarget]),
    ...shortcutTargets,
  ]);
  const currentShortcutSettings = shortcutSettingsFromRows(shortcutRows).filter((item): item is OpenInShortcutSetting =>
    Boolean(item),
  );

  function addShortcutRow() {
    const shortcut = multiOpenInShortcutForIndex(shortcutRows.length);
    setShortcutRows([
      ...shortcutRows,
      {
        id: `${Date.now()}`,
        target: currentOpenInTarget,
        shortcutText: shortcut ? shortcutLabel(shortcut) : "",
      },
    ]);
  }

  function removeShortcutRow(rowId: string) {
    setShortcutRows(shortcutRows.filter((row) => row.id !== rowId));
  }

  function updateShortcutRow(rowId: string, updates: Partial<OpenInShortcutRow>) {
    setShortcutRows(shortcutRows.map((row) => (row.id === rowId ? { ...row, ...updates } : row)));
  }

  async function handleSubmit() {
    const customAppPath = customOpenInApp[0];
    if (customAppPath && path.extname(customAppPath) !== ".app") {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid custom app",
        message: "Choose a macOS .app bundle.",
      });
      return;
    }

    if (openInTarget === customOpenInPickerValue && !customAppPath) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Choose a custom app",
        message: "Select a macOS .app bundle.",
      });
      return;
    }

    const nextMultiOpenInShortcuts = shortcutSettingsFromRows(shortcutRows);
    const invalidShortcutIndex = nextMultiOpenInShortcuts.findIndex((shortcut) => !shortcut);
    if (invalidShortcutIndex !== -1) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Invalid shortcut ${invalidShortcutIndex + 1}`,
        message: "Use a shortcut like cmd+opt+1 or cmd+shift+o.",
      });
      return;
    }

    const validMultiOpenInShortcuts = nextMultiOpenInShortcuts.filter((item): item is OpenInShortcutSetting =>
      Boolean(item),
    );

    await onSave({
      ...settings,
      openInTarget: openInTarget === customOpenInPickerValue ? appTarget(customAppPath) : openInTarget,
      defaultTerminalTarget: defaultTerminal,
      defaultIdeTarget: defaultIde,
      defaultAiClientTarget: defaultAiClient,
      defaultDocumentsTarget: defaultDocuments,
      defaultGitDiffTarget: defaultGitDiff,
      multiOpenInTargets: [...new Set(validMultiOpenInShortcuts.map((item) => item.target))],
      multiOpenInShortcuts: validMultiOpenInShortcuts,
    });
    pop();
  }

  return (
    <Form
      navigationTitle="Open In"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Settings" icon={Icon.Check} onSubmit={handleSubmit} />
          <Action
            title="Add Shortcut App"
            icon={Icon.Plus}
            shortcut={{ modifiers: ["cmd"], key: "n" }}
            onAction={addShortcutRow}
          />
          {shortcutRows.length ? (
            <Action
              title="Remove Last Shortcut App"
              icon={Icon.Minus}
              shortcut={{ modifiers: ["cmd"], key: "delete" }}
              onAction={() => removeShortcutRow(shortcutRows.at(-1)?.id ?? "")}
            />
          ) : null}
          <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="openInTarget"
        title="Default Opener"
        value={openInTarget}
        onChange={(value) => setOpenInTarget(value as OpenInTarget | typeof customOpenInPickerValue)}
      >
        {openInOptionsForValue(openInTarget).map((option) => (
          <Form.Dropdown.Item key={option.target} value={option.target} title={option.title} icon={option.icon} />
        ))}
        <Form.Dropdown.Item value={customOpenInPickerValue} title="Choose Custom App..." icon={Icon.Plus} />
      </Form.Dropdown>
      <Form.Dropdown
        id="defaultTerminalTarget"
        title="Default Terminal"
        value={defaultTerminal}
        onChange={(value) => setDefaultTerminal(value as OpenInTarget)}
      >
        {defaultAppOptionsForType("terminal", defaultTerminal).map((option) => (
          <Form.Dropdown.Item key={option.target} value={option.target} title={option.title} icon={option.icon} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown
        id="defaultIdeTarget"
        title="Default IDE / Code"
        value={defaultIde}
        onChange={(value) => setDefaultIde(value as OpenInTarget)}
      >
        {defaultAppOptionsForType("ide", defaultIde).map((option) => (
          <Form.Dropdown.Item key={option.target} value={option.target} title={option.title} icon={option.icon} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown
        id="defaultAiClientTarget"
        title="Default AI Client"
        value={defaultAiClient}
        onChange={(value) => setDefaultAiClient(value as OpenInTarget)}
      >
        {defaultAppOptionsForType("aiClient", defaultAiClient).map((option) => (
          <Form.Dropdown.Item key={option.target} value={option.target} title={option.title} icon={option.icon} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown
        id="defaultDocumentsTarget"
        title="Default Documents"
        value={defaultDocuments}
        onChange={(value) => setDefaultDocuments(value as OpenInTarget)}
      >
        {defaultAppOptionsForType("documents", defaultDocuments).map((option) => (
          <Form.Dropdown.Item key={option.target} value={option.target} title={option.title} icon={option.icon} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown
        id="defaultGitDiffTarget"
        title="Default Git Diff"
        value={defaultGitDiff}
        onChange={(value) => setDefaultGitDiff(value as OpenInTarget)}
      >
        {defaultAppOptionsForType("gitDiff", defaultGitDiff).map((option) => (
          <Form.Dropdown.Item key={option.target} value={option.target} title={option.title} icon={option.icon} />
        ))}
      </Form.Dropdown>
      <Form.Separator />
      <Form.Description title="Shortcut Apps" text={shortcutSummary(currentShortcutSettings)} />
      {shortcutRows.map((row, index) => (
        <Fragment key={row.id}>
          {index > 0 ? <Form.Separator /> : null}
          <Form.TextField
            id={`${row.id}-shortcut`}
            title={`Shortcut ${index + 1}`}
            placeholder="cmd+opt+1"
            value={row.shortcutText}
            onChange={(value) => updateShortcutRow(row.id, { shortcutText: value })}
          />
          <Form.Dropdown
            id={`${row.id}-target`}
            title={`App ${index + 1}`}
            value={row.target}
            onChange={(value) => updateShortcutRow(row.id, { target: value as OpenInTarget })}
          >
            {multiOpenInOptions.map((option) => (
              <Form.Dropdown.Item key={option.target} value={option.target} title={option.title} icon={option.icon} />
            ))}
          </Form.Dropdown>
          <Form.Description title="Remove" text="Use Cmd+Delete to remove the last row." />
        </Fragment>
      ))}
      {isChoosingCustomOpenInApp ? (
        <Form.FilePicker
          id="customOpenInApp"
          title="Custom App"
          allowMultipleSelection={false}
          canChooseDirectories={true}
          canChooseFiles={false}
          value={customOpenInApp}
          onChange={(value) => {
            setCustomOpenInApp(value);
            const customAppPath = value[0];
            if (customAppPath) {
              setOpenInTarget(appTarget(customAppPath));
            }
          }}
          info="Choose a .app bundle."
        />
      ) : null}
    </Form>
  );
}

function ProjectActionsSettingsForm({
  settings,
  onSave,
}: {
  settings: ProjectSettingsState;
  onSave: SaveProjectSettings;
}) {
  const { pop } = useNavigation();
  const [projectActionsDirectory, setProjectActionsDirectory] = useState<string[]>(
    settings.projectActionsDirectory ?? [],
  );

  async function handleSubmit() {
    const invalidProjectActionsDirectory = projectActionsDirectory.find((folder) => !existsSync(folder));
    if (invalidProjectActionsDirectory) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid project actions folder",
        message: "Choose existing folders.",
      });
      return;
    }

    await onSave({ ...settings, projectActionsDirectory });
    pop();
  }

  return (
    <Form
      navigationTitle="Project Actions"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Project Actions Settings" icon={Icon.Check} onSubmit={handleSubmit} />
          {projectActionsDirectory.map((folder) => (
            <Action.Open key={folder} title="Open Project Actions Folder" icon={Icon.Folder} target={folder} />
          ))}
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="projectActionsDirectory"
        title="Project Actions Folders"
        allowMultipleSelection={true}
        canChooseDirectories={true}
        canChooseFiles={false}
        value={projectActionsDirectory}
        onChange={setProjectActionsDirectory}
        info="Folders containing a plugins directory or plugin index file."
      />
    </Form>
  );
}

function TursoSettingsForm({ settings, onSave }: { settings: ProjectSettingsState; onSave: SaveProjectSettings }) {
  const { pop } = useNavigation();
  const [tursoDatabaseUrl, setTursoDatabaseUrl] = useState(settings.tursoDatabaseUrl ?? "");
  const [tursoAuthToken, setTursoAuthToken] = useState(settings.tursoAuthToken ?? "");

  function currentSettings(): ProjectSettingsState {
    return {
      ...settings,
      tursoDatabaseUrl: tursoDatabaseUrl.trim() || undefined,
      tursoAuthToken: tursoAuthToken.trim() || undefined,
    };
  }

  async function handleSubmit() {
    if (settings.projectSource === "turso" && !tursoDatabaseUrl.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Missing Turso database",
        message: "Enter a Turso database name or URL.",
      });
      return;
    }

    await onSave(currentSettings());
    pop();
  }

  return (
    <Form
      navigationTitle="Turso"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Turso Settings" icon={Icon.Check} onSubmit={handleSubmit} />
          <Action
            title="Test Turso Connection"
            icon={Icon.Network}
            onAction={async () => {
              const toast = await showToast({ style: Toast.Style.Animated, title: "Testing Turso connection" });
              try {
                await testTursoProjectSource(currentSettings());
                toast.style = Toast.Style.Success;
                toast.title = "Turso connection works";
              } catch (error) {
                toast.style = Toast.Style.Failure;
                toast.title = "Turso connection failed";
                toast.message = error instanceof Error ? error.message : String(error);
              }
            }}
          />
          <Action
            title="Import JSON into Turso"
            icon={Icon.Upload}
            onAction={async () => {
              const toast = await showToast({
                style: Toast.Style.Animated,
                title: "Importing projects into Turso",
              });
              try {
                const currentProjectListFile = settings.projectListFile;
                if (!currentProjectListFile || !existsSync(currentProjectListFile)) {
                  throw new Error("Choose an existing projects list file before importing.");
                }

                await importTursoProjectRows(currentSettings(), readImportedRepositoryRows(currentProjectListFile));
                toast.style = Toast.Style.Success;
                toast.title = "Imported projects into Turso";
              } catch (error) {
                toast.style = Toast.Style.Failure;
                toast.title = "Could not import projects";
                toast.message = error instanceof Error ? error.message : String(error);
              }
            }}
          />
          <Action
            title="Export Turso to JSON"
            icon={Icon.Download}
            onAction={async () => {
              const toast = await showToast({ style: Toast.Style.Animated, title: "Exporting Turso projects" });
              try {
                const currentProjectListFile = settings.projectListFile;
                if (!currentProjectListFile || !existsSync(currentProjectListFile)) {
                  throw new Error("Choose an existing projects list file before exporting.");
                }

                const rows = await readTursoProjectRows(currentSettings());
                writeImportedRepositoryRows(currentProjectListFile, rows);
                toast.style = Toast.Style.Success;
                toast.title = "Exported Turso projects to JSON";
              } catch (error) {
                toast.style = Toast.Style.Failure;
                toast.title = "Could not export projects";
                toast.message = error instanceof Error ? error.message : String(error);
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="tursoDatabaseUrl"
        title="Database"
        value={tursoDatabaseUrl}
        onChange={setTursoDatabaseUrl}
        placeholder="libsql://..."
        info="libSQL database URL."
      />
      <Form.PasswordField
        id="tursoAuthToken"
        title="API Token"
        value={tursoAuthToken}
        onChange={setTursoAuthToken}
        info="Database auth token for private Turso databases."
      />
    </Form>
  );
}
