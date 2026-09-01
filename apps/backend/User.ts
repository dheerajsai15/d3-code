import { AddMessageSchema, CreateSessionSchema, CreateWorkspaceSchema, type IncomingMessageType, type Message, type OutgoingMessageType } from "commons";
import { SessionModel, WorkspaceModel } from "db";
import type { WebSocket } from "ws";

export class User{
  private socket: WebSocket;
  private id: string;
  constructor(id: string, socket: WebSocket) {
    this.id = id;
    this.socket = socket;
  }

  getId() {
    return this.id;
  }

  async sendMessage(payload: OutgoingMessageType) {
    this.socket.send(JSON.stringify(payload));
  }

  async handleIncomingMessage(msg: IncomingMessageType): Promise<OutgoingMessageType> {
    if (msg.type === "create-workspace") {
      const { success, data } = CreateWorkspaceSchema.safeParse(msg.payload);
      if (!success)
        throw new Error("Incorrect Schema")

      console.log("zod schema validation passed")

      const name = data.path.split("/").pop()!;
      const workspace = await WorkspaceModel.create({
        path: data.path,
        name
      });

      console.log("workspace created in DB")

      return {
        type: "workspace-created",
        payload:{
          id: workspace._id.toString(),
          name,
          path: data.path
        }
      }
    }

    if (msg.type === "create-session") {
      const { success, data } = CreateSessionSchema.safeParse(msg.payload);
      if (!success)
        throw new Error("Incorrect Schema")

      const session = await SessionModel.create({
        workspace: data.workspaceId,
        conversation: []
      });

      return {
        type: "session-created",
        payload:{
          id: session._id.toString(),
          workspaceId: data.workspaceId
        }
      }
    }

    if (msg.type === "add-message") {
      const { success, data } = AddMessageSchema.safeParse(msg.payload);
      if (!success)
        throw new Error("Incorrect Schema")

      const message: Message = {
        role: "user",
        payload: {
          message: data.message
        }
      };

      const result = await SessionModel.updateOne(
        { _id: data.sessionId },
        { $push: { conversation: message } }
      );

      if (result.matchedCount === 0)
        throw new Error("No such session");

      return {
        type: "message-added",
        payload:{
          sessionId: data.sessionId,
          message
        }
      }
    }

    throw new Error("Incorrect input schema");
  }
}