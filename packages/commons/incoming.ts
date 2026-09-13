import z from "zod";
import { AGENT_VALUES } from "./models";

export const CreateWorkspaceSchema = z.object({
  path: z.string()
})
export type CreateWorkspaceSchemaType = z.infer<typeof CreateWorkspaceSchema>

export const CreateSessionSchema = z.object({
  workspaceId: z.string()
})
export type CreateSessionSchemaType = z.infer<typeof CreateSessionSchema>

export const DeleteSessionSchema = z.object({
  sessionId: z.string()
})
export type DeleteSessionSchemaType = z.infer<typeof DeleteSessionSchema>

export const AgentSchema = z.enum(AGENT_VALUES)

export const AddMessageSchema = z.object({
  sessionId: z.string(),
  message: z.string(),
  agent: AgentSchema,
  model: z.string().optional()
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
} | {
  type: "delete-session"
  payload: DeleteSessionSchemaType
};