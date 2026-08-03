# @raggle/plugins

Small runtime and TypeScript API for Raggle project action plugins.

```js
import { Icon, defineProjectActions, showToast, Toast } from "@raggle/plugins";

export const projectActions = defineProjectActions((context) => [
  {
    id: "plugin:example",
    title: `Example for ${context.name}`,
    section: "custom",
    icon: Icon.Terminal,
    onAction: async () => {
      await showToast({
        style: Toast.Style.Success,
        title: "Plugin action",
        message: context.folderPath,
      });
    },
  },
]);

export default projectActions;
```

Import Raycast-compatible UI primitives from `@raggle/plugins` instead of `@raycast/api`. Raggle's plugin manager resolves those SDK exports to Raycast at runtime.

Group related actions under a single parent with `childActions`:

```js
export const projectActions = defineProjectActions(() => [
  {
    id: "plugin:email-signature",
    title: "Insert Email Signature",
    section: "custom",
    childActions: [
      {
        id: "plugin:email-signature:default",
        title: "Default",
        section: "custom",
        onAction: async () => {},
      },
    ],
  },
]);
```

Local plugins also receive source-location helpers:

```js
const configPath = context.resolvePluginPath?.("../config.json");
```

Use `context.resolvePluginPath`, `context.pluginDirectory`, or `context.pluginFilePath` instead of `import.meta.url` when reading files that live beside a local plugin.

Plugins can also export shared project config:

```js
import { defineProjectConfig } from "@raggle/plugins";

export const projectConfig = defineProjectConfig({
  folders: ["packages/app"],
  subpaths: ["apps", { path: "packages", removePathFromName: true }],
  allSubpath: false,
  collapseSubpaths: true,
  ignoredSubpaths: ["meetings", "notes", "scripts"],
});
```

External plugins should publish compiled JavaScript. Local plugins can be JavaScript or TypeScript files; Raggle compiles local `.ts` and `.tsx` plugins at runtime.

Project Actions folders can contain a `plugins` directory. Raggle loads the root plugin entry, direct plugin files, and any direct child folders with an index file:

```text
project-actions/
└── plugins/
    ├── index.ts
    ├── git-status.tsx
    ├── open-in-editor/
    │   └── index.ts
    └── package-scripts/
        └── index.tsx
```

Use direct files or child folders for independent plugins that should be discovered automatically. Keep `plugins/index.ts` for shared `projectConfig` exports or for explicitly aggregating plugins that must load in a custom order.
