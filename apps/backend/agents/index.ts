import type { AgentType } from "commons";
import { claudeAgent } from "./claude";
import { codexAgent } from "./codex";
import type { Agent } from "./types";

export const agents: Record<AgentType, Agent> = {
  anthropic: claudeAgent,
  openai: codexAgent
};

// The session field that holds each provider's conversation id.
export const HISTORY_ID_FIELD = {
  anthropic: "anthropicSessionId",
  openai: "openaiThreadId"
} as const satisfies Record<AgentType, string>;
