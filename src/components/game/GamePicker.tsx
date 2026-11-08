import { ChevronDown, ChevronRight, History, Play, Plus, Trash2, User, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { GAME_NAME_MAX, type GameInfo, type GameKind, type SaveInfo } from "@ski/shared";
import { summaryLine, when } from "@/lib/game/saves-format";
import { lobbyRequest } from "@/lib/game/net";
import { REGION_BY_ID, REGIONS } from "@ski/config";
import { RegionPicker } from "./RegionPicker";
import { useGame } from "@/lib/game/store";

type Confirm = { kind: "load" | "delete"; save: SaveInfo } | null;

/**
 * Which game to play, chosen on purpose.
 *
 * Every game the account may see — shared ones and its own — with its save
 * points. «Weiterspielen» opens a game where it stands; «Laden» puts a save
 * back first (the state it replaces is saved automatically); new games are
 * started here too. Nothing is joined until one of these is pressed.
 */
export function GamePicker({ playerName }: { playerName: string }) {
  const start = useGame((s) => s.startGame);
  const [games, setGames] = useState<GameInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [region, setRegion] = useState(REGIONS[0]!.id);
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    let live = true;
    lobbyRequest({ type: "list_games" })
      .then((r) => live && setGames(r.games))
      .catch((err: unknown) => live && setError(err instanceof Error ? err.message : "Keine Verbindung"));
    return () => {
      live = false;
    };
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Das ging nicht");
    } finally {
      setBusy(false);
    }
  };

  const play = (gameId: string) => start(false, playerName, gameId);
  const load = (save: SaveInfo) =>
    run(async () => {
      await lobbyRequest({ type: "load_save", saveId: save.id });
      play(save.gameId);
    });
  const remove = (save: SaveInfo) =>
    run(async () => {
      const r = await lobbyRequest({ type: "delete_save", saveId: save.id });
      setGames(r.games);
      setConfirm(null);
    });
  const create = (kind: GameKind) =>
    run(async () => {
      const r = await lobbyRequest({ type: "create_game", kind, region, ...(newName.trim() ? { name: newName.trim() } : {}) });
      if (r.created) play(r.created);
    });

  if (!games) {
    return (
      <div className="mt-6 w-full sm:max-w-md">
        {error ? (
          <>
            <p className="text-[13px] font-medium text-[#ffd18a]">Spielstände nicht erreichbar: {error}</p>
            <button
              type="button"
              onClick={() => play("zermatt")}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-[15px] font-semibold text-panel sm:w-auto"
            >
              Gemeinsames Gebiet öffnen <ChevronRight className="size-4" />
            </button>
          </>
        ) : (
          <p className="text-[13px] text-ice">Spiele werden geladen…</p>
        )}
      </div>
    );
  }

  const shared = games.filter((g) => g.kind === "shared");
  const own = games.filter((g) => g.kind === "own");
  // The game last played, one tap away: what most visits are for.
  const last = [...games].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const showNew = newOpen || games.length === 0;
  return (
    <div className="mt-6 flex w-full flex-col gap-4 sm:max-w-md">
      {error && <p className="text-[13px] font-medium text-[#ffd18a]">{error}</p>}
      {last && (
        <button
          type="button"
          disabled={busy}
          onClick={() => play(last.id)}
          className="flex min-h-14 w-full items-center gap-3 rounded-full bg-accent py-2 pl-5 pr-3 text-left text-panel shadow-lg disabled:opacity-60"
        >
          <Play className="size-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold leading-tight">Weiterspielen</span>
            <span className="block truncate text-[12px] opacity-85">
              {last.name} · {REGION_BY_ID[last.region]?.name ?? "Alpina"}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0" />
        </button>
      )}
      <GameGroup
        title="Gemeinsame Spiele"
        icon={<Users className="size-4" />}
        games={shared}
        empty="Noch kein gemeinsames Spiel."
        {...{ open, setOpen, confirm, setConfirm, busy, play, load, remove }}
      />
      <GameGroup
        title="Eigene Spiele"
        icon={<User className="size-4" />}
        games={own}
        empty="Noch kein eigenes Spiel."
        {...{ open, setOpen, confirm, setConfirm, busy, play, load, remove }}
      />
      {!showNew ? (
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="flex h-12 w-full items-center justify-center gap-1.5 rounded-full bg-snow/10 text-[14px] font-semibold text-snow ring-1 ring-snow/20"
        >
          <Plus className="size-4" /> Neues Spiel
        </button>
      ) : (
      <div className="rounded-[20px] bg-snow/10 p-3 ring-1 ring-snow/15">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-ice">Neues Spiel · Wo wollt ihr bauen?</div>
        <div className="mt-2">
          <RegionPicker value={region} onChange={setRegion} />
        </div>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={GAME_NAME_MAX}
          placeholder="Name, z. B. Wochenende Zermatt"
          aria-label="Name des neuen Spiels"
          className="mt-2 h-11 w-full rounded-full bg-panel/15 px-4 text-[14px] text-snow outline-none ring-1 ring-snow/25 placeholder:text-ice/60"
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => create("shared")}
            className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-accent px-3 text-[13px] font-semibold text-panel disabled:opacity-60"
          >
            <Plus className="size-4" /> Gemeinsam
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => create("own")}
            className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-panel/15 px-3 text-[13px] font-semibold text-snow ring-1 ring-snow/30 disabled:opacity-60"
          >
            <Plus className="size-4" /> Nur für mich
          </button>
        </div>
      </div>
      )}
    </div>
  );
}

function GameGroup({
  title,
  icon,
  games,
  empty,
  open,
  setOpen,
  confirm,
  setConfirm,
  busy,
  play,
  load,
  remove,
}: {
  title: string;
  icon: React.ReactNode;
  games: GameInfo[];
  empty: string;
  open: string | null;
  setOpen: (id: string | null) => void;
  confirm: Confirm;
  setConfirm: (c: Confirm) => void;
  busy: boolean;
  play: (id: string) => void;
  load: (save: SaveInfo) => void;
  remove: (save: SaveInfo) => void;
}) {
  return (
    <section>
      <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ice">
        {icon} {title}
      </h2>
      {games.length === 0 && <p className="mt-1.5 text-[13px] text-ice/80">{empty}</p>}
      <div className="mt-2 flex flex-col gap-2">
        {games.map((g) => {
          const expanded = open === g.id;
          return (
            <div key={g.id} className="rounded-[20px] bg-snow/10 p-3 ring-1 ring-snow/15">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold text-snow">{g.name}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-ice">
                    <span className="font-semibold text-snow">{REGION_BY_ID[g.region]?.name ?? "Alpina (klassisch)"}</span> ·{" "}
                    {summaryLine(g.summary)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-ice/80">
                    Zuletzt gespielt {when(g.updatedAt)}
                    {g.online > 0 && <span className="font-semibold text-[#9be3b4]"> · {g.online} online</span>}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => play(g.id)}
                  className="flex h-11 shrink-0 items-center gap-1 rounded-full bg-accent px-4 text-[13px] font-semibold text-panel disabled:opacity-60"
                >
                  <Play className="size-4" /> Weiterspielen
                </button>
              </div>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : g.id)}
                aria-expanded={expanded}
                className="mt-2 flex min-h-11 w-full items-center gap-1.5 rounded-full px-1 text-left text-[12px] font-semibold text-ice"
              >
                <History className="size-4" />
                {g.saves.length === 0 ? "Keine Sicherungen" : `${g.saves.length} ${g.saves.length === 1 ? "Sicherung" : "Sicherungen"}`}
                <ChevronDown className={`ml-auto size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
              {expanded && g.saves.length > 0 && (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {g.saves.map((sv) => {
                    const asking = confirm?.save.id === sv.id ? confirm.kind : null;
                    return (
                      <li key={sv.id} className="rounded-[14px] bg-navy/40 p-2.5">
                        <div className="text-[13px] font-semibold text-snow">{sv.name}</div>
                        <div className="text-[11px] leading-snug text-ice">
                          {when(sv.createdAt)}
                          {sv.createdByName ? ` · ${sv.createdByName}` : ""}
                        </div>
                        <div className="text-[11px] leading-snug text-ice/80">{summaryLine(sv.summary)}</div>
                        {asking === "load" ? (
                          <div className="mt-2">
                            <p className="text-[12px] text-snow">
                              Diesen Stand laden? Der aktuelle Stand von «{g.name}» wird vorher automatisch gesichert.
                            </p>
                            <div className="mt-1.5 flex gap-1.5">
                              <button type="button" onClick={() => setConfirm(null)} className="h-11 flex-1 rounded-full bg-panel/15 text-[12px] font-semibold text-snow">
                                Abbrechen
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => load(sv)}
                                className="h-11 flex-1 rounded-full bg-accent text-[12px] font-semibold text-panel disabled:opacity-60"
                              >
                                Laden und spielen
                              </button>
                            </div>
                          </div>
                        ) : asking === "delete" ? (
                          <div className="mt-2">
                            <p className="text-[12px] text-snow">Diese Sicherung endgültig löschen?</p>
                            <div className="mt-1.5 flex gap-1.5">
                              <button type="button" onClick={() => setConfirm(null)} className="h-11 flex-1 rounded-full bg-panel/15 text-[12px] font-semibold text-snow">
                                Behalten
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => remove(sv)}
                                className="h-11 flex-1 rounded-full bg-[#d23b3b] text-[12px] font-semibold text-panel disabled:opacity-60"
                              >
                                Löschen
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setConfirm({ kind: "load", save: sv })}
                              className="h-11 flex-1 rounded-full bg-panel/15 text-[12px] font-semibold text-snow ring-1 ring-snow/30"
                            >
                              Laden
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirm({ kind: "delete", save: sv })}
                              aria-label={`Sicherung ${sv.name} löschen`}
                              className="grid size-11 place-items-center rounded-full bg-panel/15 text-[#ffb4b4]"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
