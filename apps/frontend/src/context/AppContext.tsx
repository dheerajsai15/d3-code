import type { Workspace } from "commons";
import { createContext, type Dispatch, type SetStateAction } from "react";

export const AppContext = createContext<{
  workspaces: Workspace[],
  setWorkspaces: Dispatch<SetStateAction<Workspace[]>>,
  socket: WebSocket,
  activeSessionId: string | null,
  setActiveSessionId: Dispatch<SetStateAction<string | null>>
}>({
  workspaces: [],
  setWorkspaces: () => {},
  socket: null as unknown as WebSocket,
  activeSessionId: null,
  setActiveSessionId: () => {}
});
