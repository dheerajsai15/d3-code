import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppContext } from './context/AppContext';
import { useSocket } from './hooks/useSocket'
import { Markdown } from './components/Markdown';
// Subpath import: keeps zod (pulled in by the commons schemas) out of the bundle.
import { AGENTS, MODELS, isModelFor, type AgentType } from 'commons/models';
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
          ? { ...w, sessions: [...w.sessions, { id, agent: null, messages: [] }] }
          : w
        ));
        setActiveSessionId(id);
      }

      if (data.type === "session-deleted") {
        const { id, workspaceId } = data.payload;
        setWorkspaces(ws => ws.map(w => w.id === workspaceId
          ? { ...w, sessions: w.sessions.filter(s => s.id !== id) }
          : w
        ));
        // Don't leave the selection pointing at a session that no longer exists.
        setActiveSessionId(current => current === id ? null : current);
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

/**
 * Modal confirmation for destructive actions. Cancel is autofocused so a stray
 * Enter dismisses rather than destroys, and Escape / backdrop click both cancel.
 */
function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: {
  title: string,
  body: string,
  confirmLabel: string,
  onConfirm: () => void,
  onCancel: () => void
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl"
        // The backdrop closes on click; clicks inside the panel must not bubble to it.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-medium text-neutral-100">{title}</div>
        <p className="mt-2 text-sm text-neutral-400">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            autoFocus
            className="rounded px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkspaceItem({ workspace, open, onToggle }: {
  workspace: Workspace,
  open: boolean,
  onToggle: () => void
}) {
  const { socket, activeSessionId, setActiveSessionId } = useContext(AppContext);
  const [pendingDelete, setPendingDelete] = useState<
    { id: string, label: string, count: number } | null
  >(null);

  return <div className="mb-1">
    {pendingDelete && (
      <ConfirmDialog
        title={`Delete ${pendingDelete.label}?`}
        body={
          pendingDelete.count > 0
            ? `This permanently removes ${pendingDelete.count} message${pendingDelete.count === 1 ? "" : "s"} and the agent's saved history for this session. It cannot be undone.`
            : "This permanently removes the session and the agent's saved history for it. It cannot be undone."
        }
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          socket.send(JSON.stringify({
            type: "delete-session",
            payload: { sessionId: pendingDelete.id }
          }));
          setPendingDelete(null);
        }}
      />
    )}
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
          // Row rather than a single button: a delete control can't be nested
          // inside the select button.
          <div
            key={s.id}
            className={`group flex items-center rounded ${
              s.id === activeSessionId
                ? "bg-neutral-700 text-neutral-100"
                : "text-neutral-400 hover:bg-neutral-800"
            }`}
          >
            <button
              className="min-w-0 flex-1 truncate px-2 py-1 text-left text-sm"
              onClick={() => setActiveSessionId(s.id)}
            >
              Session {i + 1}
              <span className="ml-1.5 text-xs text-neutral-600">
                {s.messages.length > 0 && `· ${s.messages.length}`}
              </span>
            </button>
            <button
              className="px-2 py-1 text-sm text-neutral-600 opacity-0 group-hover:opacity-100 hover:text-red-400 focus:opacity-100 cursor-pointer"
              title="Delete session"
              aria-label={`Delete session ${i + 1}`}
              onClick={() => setPendingDelete({ id: s.id, label: `Session ${i + 1}`, count: s.messages.length })}
            >
              ×
            </button>
          </div>
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
  const [agentChoice, setAgentChoice] = useState<AgentType>("anthropic");
  const [model, setModel] = useState("default");

  const workspace = workspaces.find(w => w.sessions.some(s => s.id === activeSessionId));
  const session = workspace?.sessions.find(s => s.id === activeSessionId);
  const active = workspace && session ? { workspace, session } : null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSessionId = useRef<string | null>(null);
  const sessionId = active?.session.id ?? null;
  const messageCount = active?.session.messages.length ?? 0;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const switched = lastSessionId.current !== sessionId;
    lastSessionId.current = sessionId;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: switched ? "auto" : "smooth" });
  }, [sessionId, messageCount]);

  if (!active) {
    return <div className="flex flex-1 items-center justify-center text-sm text-neutral-600">
      Select a session to start
    </div>
  }

  const agent = active.session.agent ?? agentChoice;
  const agentLocked = active.session.agent !== null;
  // After switching sessions the remembered model may belong to the other agent.
  const sessionModel = isModelFor(agent, model) ? model : "default";

  const send = () => {
    if (!draft.trim()) return;
    const text = draft.trim();

    setWorkspaces(ws => ws.map(w => ({
      ...w,
      sessions: w.sessions.map(s => s.id === active.session.id
        ? {
          ...s,
          agent,
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
      payload: { sessionId: active.session.id, message: text, agent, model: sessionModel }
    }));
    setDraft("");
  };

  return <div className="flex flex-1 flex-col">
    <div className="border-b border-neutral-800 px-5 py-3">
      <div className="text-sm font-medium">{active.workspace.name}</div>
      <div className="text-xs text-neutral-500">{active.workspace.path}</div>
    </div>

    <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
      {active.session.messages.length === 0 && (
        <div className="pt-10 text-center text-sm text-neutral-600">
          No messages yet
        </div>
      )}
      {active.session.messages.map((m, i) => (
        <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
          {m.role === "user" ? (
            <div className="max-w-[75%] rounded-lg bg-neutral-100 px-3 py-2 text-sm whitespace-pre-wrap text-neutral-900">
              {m.payload.message}
            </div>
          ) : (
            <div className="max-w-[75%] rounded-lg bg-neutral-800 px-3 py-2 text-neutral-200">
              <Markdown>{m.payload.message}</Markdown>
            </div>
          )}
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
        <select
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-neutral-300 focus:border-neutral-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          value={agent}
          onChange={(e) => setAgentChoice(e.target.value as AgentType)}
          disabled={agentLocked}
          title={agentLocked ? "Start a new session to use a different agent" : "Agent"}
        >
          {AGENTS.map(a => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
        <select
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-neutral-300 focus:border-neutral-500 focus:outline-none"
          value={sessionModel}
          onChange={(e) => setModel(e.target.value)}
          title="Model"
        >
          {MODELS[agent].map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
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
