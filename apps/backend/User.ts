import { AddMessageSchema, CreateSessionSchema, CreateWorkspaceSchema, type IncomingMessageType, type OutgoingMessageType } from "commons";
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
      const { success, data } = CreateWorkspaceSchema.safeParse(msg);
      if (!success)
        throw new Error("Incorrect Schema")

      const workspace = await WorkspaceModel.create({
        path: data.path,
        name: data.path.split("/").pop()
      });

      return {
        type: "workspace-created",
        payload:{
          id: workspace._id.toString()
        }
      }
    }

    if (msg.type === "create-session") {
      const { success, data } = CreateSessionSchema.safeParse(msg);
      if (!success)
        throw new Error("Incorrect Schema")

      const session = await SessionModel.create({
        workspace: data.workspaceId,
        conversation: []
      });

      return {
        type: "session-created",
        payload:{
          id: session._id.toString()
        }
      }
    }

    if (msg.type === "add-message") {
      const { success, data } = AddMessageSchema.safeParse(msg);
      if (!success)
        throw new Error("Incorrect Schema")

      const message = await SessionModel.updateOne({
        id: data.sessionId
      }, {
        conversation: {
          $push: {
            type: "user",
            payload: {
              message: data.message
            }
          }
        }
      });

      return {
        type: "session-created",
        payload:{
          id: "1"
        }
      }
    }

    throw new Error("Incorrect input schema");
  }
}