import { createAiChatClient } from "./client-adapter";
import { loadRadarApplications } from "./radar-store";
import { type AiChatClient, type AiChatClientId } from "./types";

export { AI_CHAT_CLIENT_IDS } from "./types";
export type { AiChatClient, AiChatClientId, RadarApplication } from "./types";

export function getAiChatApplications() {
  return loadRadarApplications();
}

export async function getAiChatClient(clientId: AiChatClientId): Promise<AiChatClient> {
  const application = (await getAiChatApplications()).find((item) => item.slug === clientId);
  if (!application) throw new Error(`Missing Radar application for ${clientId}`);
  return createAiChatClient(application);
}
