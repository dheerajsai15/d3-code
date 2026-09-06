/**
 * Selectable models, shared by the composer dropdown and the backend validator.
 *
 * These are aliases rather than dated ids ("claude-sonnet-5"): the agent SDK
 * resolves an alias to the current version of that family, so this list does
 * not go stale. "default" means "pass no model and let the CLI decide".
 *
 * Deliberately free of zod imports so the frontend can pull it in via
 * `commons/models` without bundling a validation library it never runs.
 */
export const MODEL_VALUES = ["default", "opus", "sonnet", "haiku"] as const;

export type ModelType = (typeof MODEL_VALUES)[number];

export const MODELS: { value: ModelType; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "opus", label: "Opus" },
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" }
];
