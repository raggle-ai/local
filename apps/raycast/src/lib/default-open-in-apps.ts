import {
  DEFAULT_OPEN_IN_APP_SHORTCUTS,
  defaultOpenInAppLabel,
  defaultOpenInTargetForType,
  type DefaultOpenInAppType,
  type OpenInTarget,
} from "../config/open-in-apps";
import { openInOptionForTarget } from "./open-in";

export type DefaultOpenInAppSettings = {
  defaultTerminalTarget?: OpenInTarget;
  defaultIdeTarget?: OpenInTarget;
  defaultAiClientTarget?: OpenInTarget;
  defaultDocumentsTarget?: OpenInTarget;
  defaultGitDiffTarget?: OpenInTarget;
};

export type DefaultOpenInAppItem = {
  type: DefaultOpenInAppType;
  target: OpenInTarget;
  label: string;
  option: ReturnType<typeof openInOptionForTarget>;
  shortcut: (typeof DEFAULT_OPEN_IN_APP_SHORTCUTS)[DefaultOpenInAppType];
};

const defaultOpenInAppTypes: DefaultOpenInAppType[] = ["terminal", "ide", "aiClient", "documents", "gitDiff"];

export function defaultOpenInAppItems(settings: DefaultOpenInAppSettings): DefaultOpenInAppItem[] {
  return defaultOpenInAppTypes.map((type) => {
    const target = defaultOpenInTargetForType(settings, type);

    return {
      type,
      target,
      label: defaultOpenInAppLabel(type),
      option: openInOptionForTarget(target),
      shortcut: DEFAULT_OPEN_IN_APP_SHORTCUTS[type],
    };
  });
}

export function defaultOpenInAppLabelsByTarget(items: DefaultOpenInAppItem[]) {
  const labelsByTarget = new Map<OpenInTarget, string[]>();

  for (const item of items) {
    labelsByTarget.set(item.target, [...(labelsByTarget.get(item.target) ?? []), item.label]);
  }

  return labelsByTarget;
}
