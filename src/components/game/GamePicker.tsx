import { ArrowLeft, ChevronDown, ChevronRight, CableCar, History, Mountain, Play, Plus, Route, Trash2, Upload, User, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { GAME_NAME_MAX, OPEN_ROOM, type GameInfo, type GameKind, type NeighbourMode, type SaveInfo } from "@ski/shared";
import { summaryLine, when } from "@/lib/game/saves-format";
import { lobbyRequest } from "@/lib/game/net";
import { ECONOMY, REGION_BY_ID, REGIONS } from "@ski/config";
import { fmt } from "@/lib/game/format";
import { RegionPicker } from "./RegionPicker";
import { useGame } from "@/lib/game/store";
import { forgetInvite } from "@/lib/game/invite";

type Confirm = { kind: "load" | "delete"; save: SaveInfo } | null;

/** Which screen of the start menu is showing. */
export type StartStep = "home" | "where" | "who" | "games";

/**
 * Which game to play, chosen on purpose.
 *
 * Every game the account may see — shared ones and its own — with its save
 * points. «Weiterspielen» opens a game where it stands; «Laden» puts a save
 * back first (the state it replaces is saved automatically); new games are
 * started here too. Nothing is joined until one of these is pressed.
 */
export function GamePicker({
  playerName,
  step,
  onStep,
  invite = null,
}: {
  playerName: string;
  step: StartStep;
  onStep: (step: StartStep) => void;
  /** A game an invitation link asked for: opened as soon as the list says it may be. */
  invite?: string | null;
}) {
  const start = useGame((s) => s.startGame);
  const [games, setGames] = useState<GameInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [region, setRegion] = useState(REGIONS[0]!.id);
  const [kind, setKind] = useState<GameKind>("own");
  const [neighbours, setNeighbours] = useState<NeighbourMode>("gemuetlich");

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

  // «Komm in mein Gebiet»: straight into the invited game, once the server's
  // list confirms this account may see it. A game missing from the list is
  // either gone or someone's own — said the same way, so a link reveals nothing.
  const [inviteDismissed, setInviteDismissed] = useState(false);
  const inviteOk = !!invite && !!games && (invite === OPEN_ROOM || games.some((g) => g.id === invite));
  const inviteMissing = !!invite && !!games && !inviteOk && !inviteDismissed;
  useEffect(() => {
    if (!invite || !games) return;
    forgetInvite();
    if (inviteOk) start(false, playerName, invite);
  }, [invite, inviteOk, games, playerName, start]);
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
  // A resort exported from the menu, brought back as a new game.
  const importFile = (file: File) =>
    run(async () => {
      let snapshot: Record<string, unknown>;
      try {
        snapshot = JSON.parse(await file.text()) as Record<string, unknown>;
      } catch {
        throw new Error("Diese Datei ist kein Spielstand");
      }
      const r = await lobbyRequest({ type: "import_game", kind: "shared", snapshot });
      if (r.created) play(r.created);
    });
  const regionName = REGION_BY_ID[region]?.name ?? "Alpina";
  const suggested = `${regionName} von ${playerName}`;
  const create = () =>
    run(async () => {
      const r = await lobbyRequest({ type: "create_game", kind, region, neighbours, name: newName.trim() || suggested });
      if (!r.created) return;
      play(r.created);
      // Together: offer the invitation link right away.
      if (kind === "shared") useGame.setState({ inviteHint: true });
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
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Spiele werden geladen">
            <div className="h-16 animate-pulse rounded-[20px] bg-snow/10" />
            <div className="h-16 animate-pulse rounded-[20px] bg-snow/10" />
          </div>
        )}
      </div>
    );
  }

  const shared = games.filter((g) => g.kind === "shared");
  const own = games.filter((g) => g.kind === "own");
  // The game last played, one tap away: what most visits are for.
  const last = [...games].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const errorLine = (
    <>
      {error && <p className="text-[13px] font-medium text-[#ffd18a]">{error}</p>}
      {inviteMissing && (
        <div role="alert" className="rounded-[18px] bg-[#ffd18a]/15 p-3 ring-1 ring-[#ffd18a]/40">
          <p className="text-[13px] font-semibold text-[#ffd18a]">Diese Einladung führt zu keinem Spiel</p>
          <p className="mt-0.5 text-[12px] leading-snug text-ice">
            Das Gebiet gibt es nicht mehr, oder es ist ein privates Spiel («Allein»). Bitte die Person, die dich eingeladen hat, es
            im Spiel freizugeben und dir den Link nochmals zu schicken.
          </p>
          <button
            type="button"
            onClick={() => setInviteDismissed(true)}
            className="mt-1 min-h-11 text-[12px] font-semibold text-snow underline underline-offset-2"
          >
            Verstanden
          </button>
        </div>
      )}
    </>
  );

  // 1 of 2: where.
  if (step === "where") {
    return (
      <div className="mt-4 flex w-full flex-col gap-3 sm:max-w-md">
        <StepHeader n={1} title="Wo willst du bauen?" onBack={() => onStep("home")} />
        <p className="text-[13px] leading-snug text-ice">
          Zwölf echte Skigebiete der Alpen, mit ihrem echten Gelände. Tippe einen Ort auf der Karte oder in der Liste.
        </p>
        <RegionPicker value={region} onChange={setRegion} />
        <PrimaryAction onClick={() => onStep("who")}>
          Weiter mit {regionName} <ChevronRight className="size-5" />
        </PrimaryAction>
      </div>
    );
  }

  // 2 of 2: with whom, and go.
  if (step === "who") {
    return (
      <div className="mt-4 flex w-full flex-col gap-3 sm:max-w-md">
        <StepHeader n={2} title="Allein oder zu zweit?" onBack={() => onStep("where")} />
        <div className="grid gap-2" role="radiogroup" aria-label="Wer spielt mit">
          <ChoiceCard
            on={kind === "own"}
            onClick={() => setKind("own")}
            icon={<User className="size-5" />}
            title="Allein"
            text="Nur du siehst und baust dieses Gebiet."
          />
          <ChoiceCard
            on={kind === "shared"}
            onClick={() => setKind("shared")}
            icon={<Users className="size-5" />}
            title="Gemeinsam"
            text="Andere sehen das Spiel auf ihrem Startbildschirm und können jederzeit mitbauen."
          />
        </div>
        <div className="rounded-[20px] bg-snow/10 p-1 ring-1 ring-snow/15" role="radiogroup" aria-label="Nachbar-Skigebiete">
          <div className="flex items-center gap-1.5 px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ice">
            <Mountain className="size-3.5" /> Nachbar-Skigebiete
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(
              [
                { v: "gemuetlich", title: "Gemütlich", text: "Teilen sich die Gäste mit dir" },
                { v: "wettbewerb", title: "Wettbewerb", text: "Stärkere Rivalen, günstigere Pässe" },
                { v: "off", title: "Allein im Tal", text: "Keine Nachbarn" },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                role="radio"
                aria-checked={neighbours === o.v}
                onClick={() => setNeighbours(o.v)}
                className={`min-h-14 rounded-[16px] px-2.5 py-2 text-left ${neighbours === o.v ? "bg-panel text-navy" : "text-snow"}`}
              >
                <span className="block text-[13px] font-bold">{o.title}</span>
                <span className={`block text-[11px] leading-snug ${neighbours === o.v ? "text-muted" : "text-ice/80"}`}>{o.text}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-ice">
          Name des Gebiets (freiwillig)
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={GAME_NAME_MAX}
            placeholder={suggested}
            aria-label="Name des neuen Spiels"
            className="mt-1.5 h-12 w-full rounded-full bg-panel/15 px-4 text-[15px] normal-case tracking-normal text-snow outline-none ring-1 ring-snow/25 placeholder:text-ice/60"
          />
        </label>
        {errorLine}
        <PrimaryAction disabled={busy} onClick={create}>
          {busy ? "Gebiet wird angelegt…" : "Los geht's"} {!busy && <ChevronRight className="size-5" />}
        </PrimaryAction>
        <p className="text-center text-[11px] text-ice/80">
          {regionName} · {kind === "own" ? "Allein" : "Gemeinsam"} · {neighbours === "off" ? "Ohne Nachbarn" : neighbours === "wettbewerb" ? "Mit Konkurrenz" : "Mit Nachbarn"} · Du startest mit {fmt(ECONOMY.startingCoins)} CHF, der Ratgeber zeigt dir die ersten Schritte.
        </p>
      </div>
    );
  }

  // All games, with their save points.
  if (step === "games") {
    return (
      <div className="mt-4 flex w-full flex-col gap-4 sm:max-w-md">
        <StepHeader title="Alle Spiele" onBack={() => onStep("home")} />
        {errorLine}
        {shared.length > 0 && (
          <GameGroup title="Gemeinsame Spiele" icon={<Users className="size-4" />} games={shared} empty="" {...{ open, setOpen, confirm, setConfirm, busy, play, load, remove }} />
        )}
        {own.length > 0 && (
          <GameGroup title="Eigene Spiele" icon={<User className="size-4" />} games={own} empty="" {...{ open, setOpen, confirm, setConfirm, busy, play, load, remove }} />
        )}
        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full text-[12px] font-semibold text-ice ring-1 ring-snow/20">
          <Upload className="size-4" /> Spielstand-Datei importieren
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) importFile(f);
            }}
          />
        </label>
      </div>
    );
  }

  // Home: what most visits want, and the way in for someone new.
  const others = shared.filter((g) => g.id !== last?.id);
  return (
    <div className="mt-6 flex w-full flex-col gap-3 sm:max-w-md">
      {errorLine}
      {last ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => play(last.id)}
          className="flex min-h-16 w-full items-center gap-3 rounded-[22px] bg-accent py-3 pl-5 pr-3 text-left text-panel shadow-lg disabled:opacity-60"
        >
          <Play className="size-6 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-bold leading-tight">Weiterspielen</span>
            <span className="block truncate text-[12px] opacity-90">
              {placeLine(last)} · {when(last.updatedAt)}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0" />
        </button>
      ) : (
        <HowItWorks />
      )}
      {others.length > 0 && (
        <section className="rounded-[20px] bg-snow/10 p-2 ring-1 ring-snow/15">
          <h2 className="flex items-center gap-1.5 px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ice">
            <Users className="size-4" /> Mitbauen bei
          </h2>
          <div className="mt-1 flex flex-col">
            {others.slice(0, 3).map((g) => (
              <button
                key={g.id}
                type="button"
                disabled={busy}
                onClick={() => play(g.id)}
                className="flex min-h-12 items-center gap-2 rounded-[14px] px-2 text-left text-snow"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{g.name}</span>
                  <span className="block truncate text-[11px] text-ice">
                    {REGION_BY_ID[g.region]?.name ?? "Alpina"}
                    {g.online > 0 ? <span className="font-semibold text-[#9be3b4]"> · {g.online} online</span> : ` · ${when(g.updatedAt)}`}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-ice" />
              </button>
            ))}
          </div>
        </section>
      )}
      <button
        type="button"
        onClick={() => onStep("where")}
        className={`flex min-h-14 w-full items-center gap-3 rounded-[22px] py-2 pl-5 pr-3 text-left ${last ? "bg-snow/10 text-snow ring-1 ring-snow/20" : "bg-accent text-panel shadow-lg"}`}
      >
        <Plus className="size-5 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold leading-tight">{last ? "Neues Skigebiet" : "Erstes Skigebiet bauen"}</span>
          <span className={`block text-[12px] ${last ? "text-ice" : "opacity-90"}`}>Ort wählen, allein oder gemeinsam</span>
        </span>
        <ChevronRight className="size-5 shrink-0" />
      </button>
      {games.length > 0 && (
        <button
          type="button"
          onClick={() => onStep("games")}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold text-ice"
        >
          <History className="size-4" /> Alle Spiele und Sicherungen ({games.length})
        </button>
      )}
    </div>
  );
}

/** «Davos von Michael», or «Wochenende · Zermatt» when the name does not say where. */
function placeLine(g: GameInfo): string {
  const place = REGION_BY_ID[g.region]?.name ?? "Alpina";
  return g.name.includes(place) ? g.name : `${g.name} · ${place}`;
}

/** «Schritt 1 von 2 · Wo willst du bauen?» with a way back. */
function StepHeader({ n, title, onBack }: { n?: number; title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onBack} aria-label="Zurück" className="grid size-11 shrink-0 place-items-center rounded-full bg-snow/10 text-snow ring-1 ring-snow/20">
        <ArrowLeft className="size-5" />
      </button>
      <div className="min-w-0">
        {n && <div className="text-[11px] font-semibold uppercase tracking-wide text-ice">Schritt {n} von 2</div>}
        <h2 className="text-[20px] font-bold leading-tight text-snow">{title}</h2>
      </div>
    </div>
  );
}

function PrimaryAction({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-14 w-full items-center justify-center gap-1.5 rounded-full bg-accent px-6 text-[16px] font-bold text-panel shadow-lg disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function ChoiceCard({ on, onClick, icon, title, text }: { on: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`flex min-h-16 items-center gap-3 rounded-[20px] p-3 text-left ring-2 ${on ? "bg-accent/25 ring-accent" : "bg-snow/10 ring-snow/15"}`}
    >
      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${on ? "bg-accent text-panel" : "bg-snow/15 text-snow"}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-snow">{title}</span>
        <span className="block text-[12px] leading-snug text-ice">{text}</span>
      </span>
      <span className={`size-5 shrink-0 rounded-full ring-2 ${on ? "bg-accent ring-snow" : "ring-snow/40"}`} />
    </button>
  );
}

/** For someone new: the game in three steps. */
function HowItWorks() {
  const steps = [
    { icon: <Mountain className="size-4" />, title: "Ort wählen", text: "Ein echtes Skigebiet der Alpen." },
    { icon: <CableCar className="size-4" />, title: "Lift bauen", text: "Vom Dorf hinauf an den Hang." },
    { icon: <Route className="size-4" />, title: "Pisten ziehen", text: "Gäste kommen, Geld fliesst – der Ratgeber hilft." },
  ];
  return (
    <ol className="grid gap-2 rounded-[20px] bg-navy/45 p-3 ring-1 ring-snow/15" aria-label="So funktioniert's">
      {steps.map((st, i) => (
        <li key={st.title} className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-snow/15 text-snow">{st.icon}</span>
          <span className="min-w-0">
            <span className="block text-[13px] font-bold text-snow">
              {i + 1}. {st.title}
            </span>
            <span className="block text-[12px] leading-snug text-ice">{st.text}</span>
          </span>
        </li>
      ))}
    </ol>
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
