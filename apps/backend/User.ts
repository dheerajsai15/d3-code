import { AddMessageSchema, CreateSessionSchema, CreateWorkspaceSchema, DeleteSessionSchema, isAgent, isModelFor, type IncomingMessageType, type Message, type OutgoingMessageType } from "commons";
import { SessionModel, WorkspaceModel } from "db";
import type { WebSocket } from "ws";
import { agents, HISTORY_ID_FIELD } from "./agents";

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

  // Push an assistant message to this client and append it to the stored conversation.
  private async recordAssistantMessage(sessionId: string, text: string) {
    const message: Message = {
      role: "assistant",
      payload: { message: text }
    };

    this.sendMessage({
      type: "message-added",
      payload: { sessionId, message }
    });

    await SessionModel.updateOne(
      { _id: sessionId },
      { $push: { conversation: message } }
    );
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

    if (msg.type === "delete-session") {
      const { success, data } = DeleteSessionSchema.safeParse(msg.payload)
      if (!success)
        throw new Error("Incorrect Schema")

      const session = await SessionModel.findById(data.sessionId);

      if (!session)
        throw new Error("Session doesn't exist " + data.sessionId);

      const workspaceId = session.workspace?.toString();

      if (!workspaceId)
        throw new Error("Session has no workspace " + data.sessionId);

      const agent = isAgent(session.agent) ? session.agent : null;
      const historyId = agent ? session[HISTORY_ID_FIELD[agent]] : undefined;

      if (agent && historyId) {
        try {
          await agents[agent].deleteHistory(historyId);
        } catch (e) {
          // Throws when the transcript is already gone. Not a reason to leave
          // the session in the database.
          console.warn(`No ${agent} transcript to delete for ${historyId}`);
        }
      }

      await SessionModel.deleteOne({ _id: data.sessionId });

      return {
        type: "session-deleted",
        payload: {
          id: data.sessionId,
          workspaceId
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

      const session = await SessionModel.findById(data.sessionId);

      if (!session) {
        throw new Error("Session doesn't exist " + data.sessionId)
      }
      const workspace = await WorkspaceModel.findById(session.workspace?._id);

      if (!workspace) {
        throw new Error("Workspace doesn't exist ")
      }

      const { agent } = data;

      if (session.agent && session.agent !== agent)
        throw new Error(`Session ${data.sessionId} uses the ${session.agent} agent`);

      // "default" (and an absent model) means: don't pass one, let the CLI pick.
      const model = data.model && data.model !== "default" ? data.model : undefined;

      if (model && !isModelFor(agent, model))
        throw new Error(`Model ${model} isn't available for the ${agent} agent`);

      const result = await SessionModel.updateOne(
        { _id: data.sessionId },
        { $push: { conversation: message }, $set: { agent } }
      );

      if (result.matchedCount === 0)
        throw new Error("No such session");

      const historyField = HISTORY_ID_FIELD[agent];

      await agents[agent].run({
        prompt: data.message,
        cwd: workspace.path!,
        model,
        resumeId: session[historyField] ?? undefined,
        onSessionId: async (id) => {
          await SessionModel.updateOne(
            { _id: data.sessionId },
            { $set: { [historyField]: id } }
          );
        },
        onMessage: (text) => this.recordAssistantMessage(data.sessionId, text)
      });

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
