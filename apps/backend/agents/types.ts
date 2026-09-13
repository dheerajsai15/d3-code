export type AgentRunOptions = {
  prompt: string;
  // The workspace the agent reads and edits.
  cwd: string;
  // Undefined lets the agent's CLI pick.
  model?: string;
  // The provider's id for this conversation from an earlier run; absent on the first message.
  resumeId?: string;
  // Called with the id of a new conversation so later runs can resume it.
  onSessionId: (id: string) => Promise<void>;
  // Called for each tool step (`Tool: Read(src/App.tsx)`) and for the final reply.
  onMessage: (text: string) => Promise<void>;
};

export type Agent = {
  run(options: AgentRunOptions): Promise<void>;
  // Deletes the local transcript behind a conversation id. Throws if it's already gone.
  deleteHistory(id: string): Promise<void>;
};
