import { AI } from "@raycast/api";

export type AskAIOptions = {
  prompt: string;
  system?: string;
  model?: AI.Model;
  creativity?: AI.Creativity;
};

export async function askAI({ prompt, system, model, creativity }: AskAIOptions): Promise<string> {
  return AI.ask([system, prompt].filter(Boolean).join("\n\n"), {
    model,
    creativity,
  });
}
