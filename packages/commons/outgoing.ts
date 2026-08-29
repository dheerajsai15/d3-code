import z from "zod";

export const WorkspaceCreatedSchema = z.object({
  id: z.string()
})
export type WorkspaceCreatedSchemaType = z.infer<typeof WorkspaceCreatedSchema>

export const SessionCreatedSchema = z.object({
  id: z.string()
})
export type SessionCreatedSchemaType = z.infer<typeof SessionCreatedSchema>

export const MessageAddedSchema = z.object({
  id: z.string()
})
export type MessageAddedSchemaType = z.infer<typeof MessageAddedSchema>

export type OutgoingMessageType = {
  type: "workspace-created"
  payload: WorkspaceCreatedSchemaType
} | {
  type: "session-created"
  payload: SessionCreatedSchemaType
} | {
  type: "message-added"
  payload: MessageAddedSchemaType
};