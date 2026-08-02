import { List } from "@raycast/api";
import { type ComponentProps } from "react";
import { type OpenInTarget } from "../config/open-in-apps";
import { useAiChatClientRegistry } from "../hooks/use-ai-chat-clients";
import { AI_CHAT_CLIENT_IDS } from "../lib/ai-chat-clients";
import { browserHostOpenInOptions, installedOpenInOptions, openInOptionForTarget } from "../lib/open-in";

type OpenInDropdownProps = Omit<ComponentProps<typeof List.Dropdown>, "children" | "onChange" | "tooltip" | "value"> & {
  value: OpenInTarget;
  onChange: (value: OpenInTarget) => void;
  browserUrl?: string;
  tooltip?: string;
};

export function OpenInDropdown({ browserUrl, onChange, tooltip = "Open Projects In", ...rest }: OpenInDropdownProps) {
  const { applicationFor } = useAiChatClientRegistry();
  const aiChatClientOptions = AI_CHAT_CLIENT_IDS.map((clientId) => {
    const fallback = openInOptionForTarget(clientId);
    return {
      ...fallback,
      title: applicationFor(clientId)?.name ?? fallback.title,
      isInstalled: () => true,
    };
  });
  const installedOptions = installedOpenInOptions().filter(
    (option) => !aiChatClientOptions.some((aiChatClientOption) => aiChatClientOption.target === option.target),
  );
  const browserOptions = browserHostOpenInOptions(browserUrl).filter(
    (option) =>
      ![...aiChatClientOptions, ...installedOptions].some(
        (availableOption) => availableOption.target === option.target,
      ),
  );
  const selectedOption = openInOptionForTarget(rest.value);
  const options = [...aiChatClientOptions, ...installedOptions, ...browserOptions];
  if (!options.some((option) => option.target === selectedOption.target)) {
    options.unshift(selectedOption);
  }

  return (
    <List.Dropdown tooltip={tooltip} onChange={(value) => onChange(value as OpenInTarget)} {...rest}>
      {options.map((option) => (
        <List.Dropdown.Item key={option.target} title={option.title} value={option.target} icon={option.icon} />
      ))}
    </List.Dropdown>
  );
}
