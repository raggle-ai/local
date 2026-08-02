import { useCachedPromise } from "@raycast/utils";
import { useCallback, useMemo } from "react";
import { getOpenStrategy, type OpenInTarget } from "../config/open-in-apps";
import { getAiChatApplications } from "../lib/ai-chat-clients";
import { type AiChatClientId } from "../lib/ai-chat-clients/types";

export function useAiChatClientRegistry() {
  const state = useCachedPromise(getAiChatApplications, [], { initialData: [] });
  const applicationsBySlug = useMemo(
    () => new Map(state.data.map((application) => [application.slug, application])),
    [state.data],
  );
  const applicationFor = useCallback(
    (clientId: AiChatClientId) => applicationsBySlug.get(clientId),
    [applicationsBySlug],
  );
  const supportsNewSession = useCallback(
    (target: OpenInTarget) => {
      const strategy = getOpenStrategy(target);
      return (
        strategy.type === "ai-chat-client" &&
        Boolean(applicationsBySlug.get(strategy.client)?.capabilities.canStartNewProjectSession)
      );
    },
    [applicationsBySlug],
  );

  return { ...state, applicationFor, supportsNewSession };
}
