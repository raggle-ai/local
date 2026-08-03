import { execFileSync, spawnSync } from "node:child_process";

type HerdrResult = Record<string, unknown>;

function herdr(args: string[]): HerdrResult {
  const output = execFileSync("herdr", args, { encoding: "utf8" });
  return JSON.parse(output).result as HerdrResult;
}

function records(result: HerdrResult, key: string): Record<string, unknown>[] {
  const value = result[key];
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

export type OpenHerdrProjectOptions = {
  cwd: string;
  label: string;
  tabLabel?: string;
  command?: string;
};

export function openHerdrProject(options: OpenHerdrProjectOptions): never {
  const tabLabel = options.tabLabel ?? "pi-1";
  const command = options.command ?? "command pi";
  let workspace = records(herdr(["workspace", "list"]), "workspaces").find((item) => item.label === options.label);

  if (!workspace) {
    const created = herdr(["workspace", "create", "--cwd", options.cwd, "--label", options.label, "--no-focus"]);
    workspace = created.workspace as Record<string, unknown>;
    const initialTab = created.tab as Record<string, unknown>;
    execFileSync("herdr", ["tab", "rename", String(initialTab.tab_id), tabLabel]);
  }

  const workspaceID = String(workspace.workspace_id);
  let tab = records(herdr(["tab", "list", "--workspace", workspaceID]), "tabs").find((item) => item.label === tabLabel);
  if (!tab) {
    const created = herdr([
      "tab",
      "create",
      "--workspace",
      workspaceID,
      "--cwd",
      options.cwd,
      "--label",
      tabLabel,
      "--no-focus",
    ]);
    tab = created.tab as Record<string, unknown>;
  }

  const tabID = String(tab.tab_id);
  const pane = records(herdr(["pane", "list", "--workspace", workspaceID]), "panes").find(
    (item) => item.tab_id === tabID,
  );
  if (!pane) throw new Error(`Herdr did not create a pane for ${tabLabel}`);

  const paneID = String(pane.pane_id);
  const hasAgent = records(herdr(["agent", "list"]), "agents").some((item) => item.pane_id === paneID);
  if (!hasAgent) execFileSync("herdr", ["pane", "run", paneID, command]);

  const terminalID = String(pane.terminal_id);
  const attached = spawnSync("herdr", ["terminal", "attach", terminalID, "--takeover"], { stdio: "inherit" });
  process.exit(attached.status ?? 1);
}
