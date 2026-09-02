import { AddMessageSchema, CreateSessionSchema, CreateWorkspaceSchema, type IncomingMessageType, type Message, type OutgoingMessageType } from "commons";
import { SessionModel, WorkspaceModel } from "db";
import type { WebSocket } from "ws";
import { query } from "@anthropic-ai/claude-agent-sdk";

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

      const session = await SessionModel.findById(data.sessionId);

      if (!session) {
        throw new Error("Session doesn't exist " + data.sessionId)
      }
      const workspace = await WorkspaceModel.findById(session.workspace?._id);

      if (!workspace) {
        throw new Error("Workspace doesn't exist ")
      }

      const result = await SessionModel.updateOne(
        { _id: data.sessionId },
        { $push: { conversation: message } }
      );

      if (result.matchedCount === 0)
        throw new Error("No such session");
      
      // Agentic loop: streams messages as Claude works
      for await (const message of query({
        prompt: data.message,
        options: {
          cwd: workspace.path!,
          allowedTools: ["Read", "Edit", "Glob"], // Auto-approve these tools
          resume: session.anthropicSessionId ?? undefined,
          permissionMode: "acceptEdits" // Auto-approve file edits
        }
      })) {
        // Print human-readable output
        if (message.type === "assistant" && message.message?.content) {
          for (const block of message.message.content) {
            if ("text" in block) {
              console.log(block.text); // Claude's reasoning
            } else if ("name" in block) {
              console.log(`Tool: ${block.name}`); // Tool being called
            }
          }
        } else if (message.type === "result") {
          console.log(`Done: ${message.subtype}`); // Final result

          if (!session.anthropicSessionId) {
            session.anthropicSessionId = message.session_id;
            await session.save();
          }

          if (message.subtype === "success") {
            console.log(message.result);

            this.sendMessage({
              type: "message-added",
              payload: {
                sessionId: session._id.toString(),
                message: {
                  role: "assistant",
                  payload: {
                    message: message.result
                  }
                }
              }
            })

            await SessionModel.updateOne(
              { _id: data.sessionId },
              {
                $push: {
                  conversation: {
                    role: "assistant",
                    payload: {
                      message: message.result
                    }
                  }
                }
              }
            );
          }
        }
      }

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