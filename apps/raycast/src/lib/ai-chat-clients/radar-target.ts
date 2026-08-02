import type {
  OpenAiChatProjectOptions,
  RadarApplication,
  RadarLauncher,
  RadarLauncherIntent,
  RadarTemplate,
} from "./types.ts";

type RadarSession = {
  sessionId: string;
  worktree?: string;
};

export type RadarProjectTarget =
  | { type: "deeplink"; value: string; fallbackValue?: string }
  | { type: "launcher"; value: string }
  | { type: "folder"; value: string; fallbackLauncher?: string };

function renderVariable(value: string, encoding?: "none" | "url-component") {
  if (encoding === "url-component") return encodeURIComponent(value);
  return value;
}

function renderTemplate(template: RadarTemplate | RadarLauncher, values: { worktree: string; session?: RadarSession }) {
  const variableValues: Record<string, string | undefined> = {
    absolutePath: values.session?.worktree ?? values.worktree,
    sessionId: values.session?.sessionId,
  };

  return template.urlTemplate.replace(/\{([^}]+)\}/g, (match, key: string) => {
    const variable = template.variables?.find((item) => item.key === key);
    const value = variableValues[key];
    if (value === undefined) return match;

    return renderVariable(value, variable?.encoding);
  });
}

function templateForIntent<T extends RadarTemplate | RadarLauncher>(
  templates: T[] | undefined,
  intents: RadarLauncherIntent[],
) {
  return intents.flatMap((intent) => templates?.filter((template) => template.intent === intent) ?? [])[0];
}

export function radarProjectTarget(
  application: RadarApplication,
  options: OpenAiChatProjectOptions,
  session?: RadarSession,
): RadarProjectTarget | undefined {
  const mode = options.mode ?? "existing-or-new";

  if (mode !== "new" && session) {
    const resumeTemplate = templateForIntent(application.deeplinks, ["resume-session"]);
    if (resumeTemplate) {
      return { type: "deeplink", value: renderTemplate(resumeTemplate, { worktree: options.worktree, session }) };
    }
  }

  const intents: RadarLauncherIntent[] =
    mode === "new" ? ["new-session"] : ["open-project", "open-folder", "new-session", "fallback"];
  const deeplink = templateForIntent(application.deeplinks, intents);
  if (deeplink) {
    const fallback = templateForIntent(application.deeplinks, ["fallback"]);
    return {
      type: "deeplink",
      value: renderTemplate(deeplink, { worktree: options.worktree }),
      ...(fallback && fallback !== deeplink
        ? { fallbackValue: renderTemplate(fallback, { worktree: options.worktree }) }
        : {}),
    };
  }

  const launcher = templateForIntent(application.launchers, intents);

  if (mode !== "new" && application.capabilities.opensProjectFolder && application.appNames?.length) {
    return {
      type: "folder",
      value: options.worktree,
      fallbackLauncher: launcher ? renderTemplate(launcher, { worktree: options.worktree }) : undefined,
    };
  }

  if (launcher) return { type: "launcher", value: renderTemplate(launcher, { worktree: options.worktree }) };

  return undefined;
}
