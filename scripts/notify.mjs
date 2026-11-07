/**
 * Push notifications for whoever is not looking, via ntfy.
 *
 * A round only moves when everyone online is ready, so the game is easy to
 * play over a few days — but only if the person who is away hears that it is
 * their turn. ntfy (ntfy.sh or self-hosted) is already on the phones for the
 * server alarms, so it needs no new app.
 *
 * Configured by `NTFY_URL`, the full topic URL (`https://ntfy.sh/<geheim>`).
 * Without it every function here does nothing.
 */

/** Split `https://ntfy.sh/topic` into the server and the topic. */
export function parseNtfyUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    const topic = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!topic || topic.includes("/")) return null;
    return { server: url.origin, topic };
  } catch {
    return null;
  }
}

/** Players this room knows by account who are not connected right now. */
export function offlinePlayers(room) {
  return [...room.players.values()].filter((p) => p.userId && !p.online);
}

function fmt(n) {
  return Math.round(n).toLocaleString("de-CH");
}

export function createNotifier({ url, publicUrl, fetchImpl = globalThis.fetch, now = () => Date.now(), log = console } = {}) {
  const target = parseNtfyUrl(url);
  const last = new Map();

  async function push(key, title, message, { gapMs = 0, tags = ["skier"] } = {}) {
    if (!target) return false;
    const t = now();
    if (last.has(key) && t - last.get(key) < gapMs) return false;
    if (gapMs === 0 && last.has(key)) return false;
    last.set(key, t);
    try {
      const res = await fetchImpl(target.server, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic: target.topic,
          title,
          message,
          tags,
          ...(publicUrl ? { click: publicUrl } : {}),
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) log.warn?.(`[notify] ntfy answered ${res.status}`);
      return res.ok;
    } catch (err) {
      log.warn?.(`[notify] push failed: ${err?.message ?? err}`);
      return false;
    }
  }

  return {
    enabled: Boolean(target),

    /** Someone pressed ready; tell whoever is away that the round waits for them. */
    async readyWaiting(room, actorName) {
      const match = room.state.match;
      if (match?.mode !== "match" || match.phase !== "plan") return false;
      if (offlinePlayers(room).length === 0) return false;
      return push(
        `ready:${room.state.roomId}:${match.startedAt}:${match.round}`,
        `${room.state.resortName}: du bist dran`,
        `${actorName} hat Runde ${match.round} beendet und wartet auf dich.`,
        { tags: ["hourglass_flowing_sand"] },
      );
    },

    /** A round was played; send the short report to whoever missed it. */
    async roundPlayed(room) {
      const match = room.state.match;
      const report = match?.history?.[match.history.length - 1];
      if (!report || offlinePlayers(room).length === 0) return false;
      const finished = match.phase === "finished";
      const medal = report.medal ? ` Saison ${report.season}: ${report.medal[0].toUpperCase()}${report.medal.slice(1)}!` : "";
      return push(
        `round:${room.state.roomId}:${match.startedAt}:${report.round}`,
        finished ? `${room.state.resortName}: Partie beendet` : `${room.state.resortName}: Runde ${report.round} gespielt`,
        finished
          ? `Endstand ${fmt(match.score)} Punkte.${medal}`
          : `${fmt(report.guests)} Gäste, ${report.net >= 0 ? "+" : "−"}${fmt(Math.abs(report.net))} CHF.${medal}`,
        { tags: finished ? ["trophy"] : ["skier"] },
      );
    },

    /** A chat line while someone is away. At most one push every two minutes. */
    async chat(room, entry) {
      if (offlinePlayers(room).length === 0) return false;
      return push(`chat:${room.state.roomId}`, `${entry.actorName} (${room.state.resortName})`, entry.text, {
        gapMs: 120_000,
        tags: ["speech_balloon"],
      });
    },
  };
}
