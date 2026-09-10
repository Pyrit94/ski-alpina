import type { ClientMessage, Intent, PlayerPresence, ResortState, ServerMessage } from "@ski/shared";

const TOKEN_KEY = "ski-builder-token";
const NAME_KEY = "ski-builder-name";

export function loadToken(): string {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t && t.length >= 8) return t;
  } catch {
    /* ignore */
  }
  const n = `tok_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  try {
    localStorage.setItem(TOKEN_KEY, n);
  } catch {
    /* ignore */
  }
  return n;
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || "Gast";
  } catch {
    return "Gast";
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name.slice(0, 24));
  } catch {
    /* ignore */
  }
}

export interface NetHandlers {
  onWelcome: (playerId: string, token: string, roomId: string) => void;
  onSnapshot: (state: ResortState, players: PlayerPresence[], seq: number) => void;
  onEvent: (title: string, body: string, kind: "ok" | "info" | "warn") => void;
  onError: (reason: string, code: string) => void;
  onStatus: (connected: boolean) => void;
}

/**
 * How often to tell the server we are still here.
 *
 * The room drops a player who has been silent for `PRESENCE_TIMEOUT_MS`, and a
 * player who is only watching the mountain sends nothing at all — so without a
 * heartbeat they would vanish from the online list while still looking at it.
 */
const HEARTBEAT_MS = 15_000;

export function connectGame(roomId: string, name: string, handlers: NetHandlers) {
  const token = loadToken();
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${proto}//${location.host}/ws`;
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const send = (msg: ClientMessage) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  const open = () => {
    if (closed) return;
    ws = new WebSocket(url);
    ws.onopen = () => {
      retry = 0;
      handlers.onStatus(true);
      send({ type: "join", roomId, name, token });
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(() => send({ type: "ping", at: Date.now() }), HEARTBEAT_MS);
    };
    ws.onclose = () => {
      handlers.onStatus(false);
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (!closed) {
        const wait = Math.min(8000, 600 * 2 ** retry);
        retry += 1;
        setTimeout(open, wait);
      }
    };
    ws.onerror = () => {
      /* onclose follows */
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      if (msg.type === "welcome") {
        try {
          localStorage.setItem(TOKEN_KEY, msg.token);
        } catch {
          /* ignore */
        }
        handlers.onWelcome(msg.playerId, msg.token, msg.roomId);
      } else if (msg.type === "snapshot") {
        handlers.onSnapshot(msg.state as ResortState, msg.players, msg.seq);
      } else if (msg.type === "event") {
        handlers.onEvent(msg.title, msg.body, msg.kind);
      } else if (msg.type === "error") {
        handlers.onError(msg.reason, msg.code);
      }
    };
  };

  open();

  return {
    sendIntent: (intent: Intent) => {
      send({ type: "intent", id: `i_${Date.now().toString(36)}`, intent });
    },
    close: () => {
      closed = true;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      ws?.close();
    },
  };
}
