import z from "zod";
import { MODEL_VALUES } from "./models";

export const CreateWorkspaceSchema = z.object({
  path: z.string()
})
export type CreateWorkspaceSchemaType = z.infer<typeof CreateWorkspaceSchema>

export const CreateSessionSchema = z.object({
  workspaceId: z.string()
})
export type CreateSessionSchemaType = z.infer<typeof CreateSessionSchema>

export const ModelSchema = z.enum(MODEL_VALUES)

export const AddMessageSchema = z.object({
  sessionId: z.string(),
  message: z.string(),
  // Optional so older clients (and any message sent before a model is picked)
  // keep working; absent means "default".
  model: ModelSchema.optional()
})
export type AddMessageSchemaType = z.infer<typeof AddMessageSchema>

export type IncomingMessageType = {
  type: "create-workspace"
  payload: CreateWorkspaceSchemaType
} | {
  type: "create-session"
  payload: CreateSessionSchemaType
} | {
  type: "add-message"
  payload: AddMessageSchemaType
};