import { AddMessageSchema, CreateSessionSchema, CreateWorkspaceSchema, type IncomingMessageType, type Message, type OutgoingMessageType } from "commons";
import { SessionModel, WorkspaceModel } from "db";
import type { WebSocket } from "ws";
import { query } from "@anthropic-ai/claude-agent-sdk";

// Tool inputs come off the SDK typed as `unknown`, so every read is narrowed.
function readString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function truncate(text: string, max = 80): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}

// Absolute paths inside the workspace are noise; show them relative to the root.
function relativeToWorkspace(workspacePath: string, filePath: string): string {
  const prefix = workspacePath.endsWith("/") ? workspacePath : workspacePath + "/";
  return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath;
}

/**
 * Turns a tool_use block into something readable, e.g. `Read(src/App.tsx)`
 * or `Grep("useSocket" in apps/frontend)`. Falls back to the bare tool name
 * when the input has no argument worth showing.
 */
function describeToolUse(name: string, input: unknown, workspacePath: string): string {
  const args = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  const filePath = (key: string) => {
    const value = readString(args, key);
    return value === undefined ? undefined : relativeToWorkspace(workspacePath, value);
  };

  const detail = ((): string | undefined => {
    switch (name) {
      case "Read":
      case "Write":
      case "Edit":
      case "NotebookEdit":
        return filePath("file_path");

      case "Glob": {
        const pattern = readString(args, "pattern");
        const path = filePath("path");
        if (!pattern) return path;
        return path ? `${pattern} in ${path}` : pattern;
      }

      case "Grep": {
        const pattern = readString(args, "pattern");
        const path = filePath("path");
        if (!pattern) return path;
        return path ? `"${pattern}" in ${path}` : `"${pattern}"`;
      }

      case "Bash": {
        const command = readString(args, "command");
        return command ? truncate(command) : readString(args, "description");
      }

      case "WebFetch":
        return readString(args, "url");

      case "WebSearch":
        return readString(args, "query");

      case "Task":
        return readString(args, "description") ?? readString(args, "subagent_type");

      case "TodoWrite": {
        const todos = args.todos;
        return Array.isArray(todos) ? `${todos.length} items` : undefined;
      }

      default: {
        // Unknown or MCP tool: show the first string argument, whatever it is.
        for (const value of Object.values(args)) {
          if (typeof value === "string" && value.length > 0) return truncate(value);
        }
        return undefined;
      }
    }
  })();

  return detail ? `${name}(${detail})` : name;
}

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
      
      const workspacePath = workspace.path!;

      // "default" (and an absent model) means: don't pass one, let the CLI pick.
      const model = data.model && data.model !== "default" ? data.model : undefined;

      // Agentic loop: streams messages as Claude works
      for await (const sdkMessage of query({
        prompt: data.message,
        options: {
          cwd: workspacePath,
          model,
          allowedTools: ["Read", "Edit", "Glob"], // Auto-approve these tools
          resume: session.anthropicSessionId ?? undefined,
          permissionMode: "auto" // Auto-approve file edits
        }
      })) {
        // Print human-readable output
        if (sdkMessage.type === "assistant" && sdkMessage.message?.content) {
          for (const block of sdkMessage.message.content) {
            if (block.type === "text") {
              console.log(block.text); // Claude's reasoning
            } else if (
              block.type === "tool_use" ||
              block.type === "server_tool_use" ||
              block.type === "mcp_tool_use"
            ) {
              // e.g. `Read(src/App.tsx)` rather than a bare `Read`
              const description = describeToolUse(block.name, block.input, workspacePath);
              console.log(`Tool: ${description}`);

              await this.recordAssistantMessage(data.sessionId, `Tool: ${description}`);
            }
          }
        }
        else if (sdkMessage.type === "result") {
          console.log(`Done: ${sdkMessage.subtype}`); // Final result

          if (!session.anthropicSessionId) {
            session.anthropicSessionId = sdkMessage.session_id;
            await session.save();
          }

          if (sdkMessage.subtype === "success") {
            console.log(sdkMessage.result);
            await this.recordAssistantMessage(data.sessionId, sdkMessage.result);
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