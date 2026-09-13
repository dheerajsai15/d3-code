import { deleteSession, query } from "@anthropic-ai/claude-agent-sdk";
import { readString, relativeToWorkspace, truncate } from "./format";
import type { Agent } from "./types";

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

export const claudeAgent: Agent = {
  async run({ prompt, cwd, model, resumeId, onSessionId, onMessage }) {
    // Agentic loop: streams messages as Claude works
    for await (const sdkMessage of query({
      prompt,
      options: {
        cwd,
        model,
        allowedTools: ["Read", "Edit", "Glob"], // Auto-approve these tools
        resume: resumeId,
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
            const description = describeToolUse(block.name, block.input, cwd);
            console.log(`Tool: ${description}`);

            await onMessage(`Tool: ${description}`);
          }
        }
      }
      else if (sdkMessage.type === "result") {
        console.log(`Done: ${sdkMessage.subtype}`); // Final result

        if (!resumeId) {
          await onSessionId(sdkMessage.session_id);
        }

        if (sdkMessage.subtype === "success") {
          console.log(sdkMessage.result);
          await onMessage(sdkMessage.result);
        }
      }
    }
  },

  // The SDK keeps history in a local JSONL transcript (plus any subagent
  // transcripts); Anthropic stores none server-side.
  async deleteHistory(id) {
    await deleteSession(id);
  }
};
