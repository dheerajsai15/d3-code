import { useContext, useEffect, useMemo, useState } from 'react';
import { AppContext } from './context/AppContext';
import { useSocket } from './hooks/useSocket'
import type { Workspace } from 'commons';

function App() {
  const { loading, socket } = useSocket();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "init") {
        setWorkspaces(data.workspaces);
      }

      if (data.type === "workspace-created") {
        setWorkspaces(ws => [...ws, { ...data.payload, sessions: [] }]);
      }

      if (data.type === "session-created") {
        const { id, workspaceId } = data.payload;
        setWorkspaces(ws => ws.map(w => w.id === workspaceId
          ? { ...w, sessions: [...w.sessions, { id, messages: [] }] }
          : w
        ));
        setActiveSessionId(id);
      }

      if (data.type === "message-added") {
        const { sessionId, message } = data.payload;
        setWorkspaces(ws => ws.map(w => ({
          ...w,
          sessions: w.sessions.map(s => s.id === sessionId
            ? { ...s, messages: [...s.messages, message] }
            : s
          )
        })));
      }
    }
  }, [socket])

  if (loading) {
    return <div className="flex h-full items-center justify-center bg-neutral-950 text-sm text-neutral-500">
      Connecting…
    </div>
  }

  return (
    <AppContext.Provider value={{
      workspaces,
      setWorkspaces,
      socket,
      activeSessionId,
      setActiveSessionId
    }}>
      <div className="flex h-full bg-neutral-950 text-neutral-200">
        <Sidebar />
        <Chat />
      </div>
    </AppContext.Provider>
  )
}

function Sidebar() {
  const { socket, workspaces } = useContext(AppContext);
  const [path, setPath] = useState("");
  const [openIds, setOpenIds] = useState<string[]>([]);

  const toggle = (id: string) => setOpenIds(ids =>
    ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
  );

  const createWorkspace = () => {
    if (!path.trim()) return;
    socket.send(JSON.stringify({
      type: "create-workspace",
      payload: { path: path.trim() }
    }));
    setPath("");
  };

  return <div className="flex w-72 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900">
    <div className="border-b border-neutral-800 p-3">
      <div className="mb-2 text-xs font-medium tracking-wide text-neutral-500 uppercase">
        Workspaces
      </div>
      <div className="flex gap-1.5">
        <input
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
          type="text"
          placeholder="/path/to/project"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createWorkspace()}
        />
        <button
          className="rounded bg-neutral-100 px-2.5 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-40"
          disabled={!path.trim()}
          onClick={createWorkspace}
        >
          Add
        </button>
      </div>
    </div>

    <div className="flex-1 overflow-y-auto p-2">
      {workspaces.length === 0 && (
        <div className="px-2 py-6 text-center text-sm text-neutral-600">
          No workspaces yet
        </div>
      )}
      {workspaces.map(w => (
        <WorkspaceItem
          key={w.id}
          workspace={w}
          open={openIds.includes(w.id)}
          onToggle={() => toggle(w.id)}
        />
      ))}
    </div>
  </div>
}

function WorkspaceItem({ workspace, open, onToggle }: {
  workspace: Workspace,
  open: boolean,
  onToggle: () => void
}) {
  const { socket, activeSessionId, setActiveSessionId } = useContext(AppContext);

  return <div className="mb-1">
    <button
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-neutral-800"
      onClick={onToggle}
    >
      <span className={`text-neutral-500 transition-transform ${open ? "rotate-90" : ""}`}>
        ›
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{workspace.name}</span>
        <span className="block truncate text-xs text-neutral-500">{workspace.path}</span>
      </span>
      <span className="text-xs text-neutral-600">{workspace.sessions.length}</span>
    </button>

    {open && (
      <div className="mt-0.5 ml-3 border-l border-neutral-800 pl-2">
        {workspace.sessions.map((s, i) => (
          <button
            key={s.id}
            className={`block w-full truncate rounded px-2 py-1 text-left text-sm ${
              s.id === activeSessionId
                ? "bg-neutral-700 text-neutral-100"
                : "text-neutral-400 hover:bg-neutral-800"
            }`}
            onClick={() => setActiveSessionId(s.id)}
          >
            Session {i + 1}
            <span className="ml-1.5 text-xs text-neutral-600">
              {s.messages.length > 0 && `· ${s.messages.length}`}
            </span>
          </button>
        ))}
        <button
          className="mt-0.5 block w-full rounded px-2 py-1 text-left text-sm text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
          onClick={() => socket.send(JSON.stringify({
            type: "create-session",
            payload: { workspaceId: workspace.id }
          }))}
        >
          + New session
        </button>
      </div>
    )}
  </div>
}

function Chat() {
  const { socket, workspaces, setWorkspaces, activeSessionId } = useContext(AppContext);
  const [draft, setDraft] = useState("");

  const active = useMemo(() => {
    for (const w of workspaces) {
      const session = w.sessions.find(s => s.id === activeSessionId);
      if (session) return { workspace: w, session };
    }
    return null;
  }, [workspaces, activeSessionId]);

  if (!active) {
    return <div className="flex flex-1 items-center justify-center text-sm text-neutral-600">
      Select a session to start
    </div>
  }

  const send = () => {
    if (!draft.trim()) return;
    const text = draft.trim();

    setWorkspaces(ws => ws.map(w => ({
      ...w,
      sessions: w.sessions.map(s => s.id === active.session.id
        ? {
          ...s,
          messages: [...s.messages, {
            role: "user", payload: {
              message: text
            }
          }]
        } : s
      )
    })))
    
    socket.send(JSON.stringify({
      type: "add-message",
      payload: { sessionId: active.session.id, message: draft.trim() }
    }));
    setDraft("");
  };

  return <div className="flex flex-1 flex-col">
    <div className="border-b border-neutral-800 px-5 py-3">
      <div className="text-sm font-medium">{active.workspace.name}</div>
      <div className="text-xs text-neutral-500">{active.workspace.path}</div>
    </div>

    <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
      {active.session.messages.length === 0 && (
        <div className="pt-10 text-center text-sm text-neutral-600">
          No messages yet
        </div>
      )}
      {active.session.messages.map((m, i) => (
        <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
            m.role === "user"
              ? "bg-neutral-100 text-neutral-900"
              : "bg-neutral-800 text-neutral-200"
          }`}>
            {m.payload.message}
          </div>
        </div>
      ))}
    </div>

    <div className="border-t border-neutral-800 p-3">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
          type="text"
          placeholder="Send a message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button
          className="rounded bg-neutral-100 px-4 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-40"
          disabled={!draft.trim()}
          onClick={send}
        >
          Send
        </button>
      </div>
    </div>
  </div>
}

export default App
