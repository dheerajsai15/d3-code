import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { Codex, type ThreadItem, type ThreadOptions } from "@openai/codex-sdk";
import { relativeToWorkspace, truncate } from "./format";
import type { Agent } from "./types";

const execFileAsync = promisify(execFile);

const FILE_CHANGE_VERBS = { add: "Write", update: "Edit", delete: "Delete" } as const;

/**
 * Renders a finished Codex step in the same shape as the Claude tool lines,
 * e.g. `Shell(bun test)` or `Edit(src/App.tsx)`. Returns undefined for items
 * that aren't steps: the reply, reasoning, and errors.
 */
function describeItem(item: ThreadItem, workspacePath: string): string | undefined {
  switch (item.type) {
    case "command_execution":
      return `Shell(${truncate(item.command)})`;

    case "file_change": {
      const changes = item.changes
        .map(c => `${FILE_CHANGE_VERBS[c.kind]}(${relativeToWorkspace(workspacePath, c.path)})`)
        .join(", ");
      return item.status === "failed" ? `${changes} (failed)` : changes;
    }

    case "mcp_tool_call": {
      const name = `${item.server}.${item.tool}`;
      const args = (item.arguments && typeof item.arguments === "object" ? item.arguments : {}) as Record<string, unknown>;
      const detail = Object.values(args).find((v): v is string => typeof v === "string" && v.length > 0);
      return detail ? `${name}(${truncate(detail)})` : name;
    }

    case "web_search":
      return `WebSearch(${item.query})`;

    case "todo_list":
      return `TodoWrite(${item.items.length} items)`;

    default:
      return undefined;
  }
}

/**
 * The SDK has no delete call, so deletion goes through the `codex delete` CLI.
 * @openai/codex is a dependency of the SDK rather than of this app, so its
 * launcher is resolved from the SDK's location.
 */
function codexLauncherPath(): string {
  const sdkRequire = createRequire(import.meta.resolve("@openai/codex-sdk"));
  return path.join(path.dirname(sdkRequire.resolve("@openai/codex/package.json")), "bin", "codex.js");
}

export const codexAgent: Agent = {
  async run({ prompt, cwd, model, resumeId, onSessionId, onMessage }) {
    const threadOptions: ThreadOptions = {
      workingDirectory: cwd,
      model,
      // Nobody can answer an approval prompt from here, so never ask, and keep
      // writes inside the workspace with Codex's sandbox instead.
      sandboxMode: "workspace-write",
      approvalPolicy: "never",
      // Workspaces are arbitrary folders, and the Claude agent doesn't need git either.
      skipGitRepoCheck: true
    };

    let reply: string | undefined;
    let failure: string | undefined;

    try {
      // Without OPENAI_API_KEY, Codex falls back to the login saved by `codex login`.
      const codex = new Codex({ apiKey: process.env.OPENAI_API_KEY || undefined });
      const thread = resumeId
        ? codex.resumeThread(resumeId, threadOptions)
        : codex.startThread(threadOptions);

      const { events } = await thread.runStreamed(prompt);

      for await (const event of events) {
        switch (event.type) {
          case "thread.started":
            if (!resumeId) {
              await onSessionId(event.thread_id);
            }
            break;

          case "item.completed": {
            const { item } = event;
            if (item.type === "agent_message") {
              // Codex also talks between steps. Like Claude's result, only the
              // last message is the reply.
              reply = item.text;
            } else if (item.type === "error") {
              console.warn(`Codex: ${item.message}`);
            } else {
              const description = describeItem(item, cwd);
              if (description) {
                console.log(`Tool: ${description}`);
                await onMessage(`Tool: ${description}`);
              }
            }
            break;
          }

          case "turn.completed":
            console.log("Done: success");
            if (reply) {
              console.log(reply);
              await onMessage(reply);
            }
            break;

          case "turn.failed":
            failure = event.error.message;
            break;

          case "error":
            failure ??= event.message;
            break;
        }
      }
    } catch (e) {
      // The SDK throws when the CLI can't start or exits non-zero: no login,
      // an unknown model, a missing binary.
      failure ??= e instanceof Error ? e.message : String(e);
    }

    // Report it in the chat; otherwise the session just goes quiet.
    if (failure) {
      console.error(`Done: ${failure}`);
      await onMessage(`Error: ${truncate(failure, 500)}`);
    }
  },

  async deleteHistory(id) {
    // --force skips the confirmation prompt. It only accepts a UUID, which thread ids are.
    await execFileAsync(process.execPath, [codexLauncherPath(), "delete", "--force", id]);
  }
};
