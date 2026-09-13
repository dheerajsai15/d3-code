export const AGENT_VALUES = ["anthropic", "openai"] as const;

export type AgentType = (typeof AGENT_VALUES)[number];

export const AGENTS: { value: AgentType; label: string }[] = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" }
];

export type ModelOption = { value: string; label: string };

export const MODELS: Record<AgentType, ModelOption[]> = {
  anthropic: [
    { value: "default", label: "Default" },
    { value: "opus", label: "Opus" },
    { value: "sonnet", label: "Sonnet" },
    { value: "haiku", label: "Haiku" }
  ],
  openai: [
    { value: "default", label: "Default" },
    { value: "gpt-6-astra", label: "GPT-6 Astra" },
    { value: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
    { value: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
    { value: "gpt-5.6-luna", label: "GPT-5.6 Luna" }
  ]
};

export function isAgent(value: unknown): value is AgentType {
  return AGENT_VALUES.includes(value as AgentType);
}

export function isModelFor(agent: AgentType, model: string): boolean {
  return MODELS[agent].some(m => m.value === model);
}
