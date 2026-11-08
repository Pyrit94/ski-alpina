import { ChevronDown, History, LogOut, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { defaultSaveName, SAVE_NAME_MAX, type SaveInfo } from "@ski/shared";
import { summaryLine, when } from "@/lib/game/saves-format";
import { useGame } from "@/lib/game/store";

/**
 * Save points of the game being played: make one, load one, delete one, or go
 * back to the start screen to pick another game. As many saves as anyone
 * likes; loading saves the state it replaces first, for everyone in the game.
 */
export function SavesPanel({ compact = false }: { compact?: boolean }) {
  const roomId = useGame((s) => s.roomId);
  const games = useGame((s) => s.games);
  const saveGame = useGame((s) => s.saveGame);
  const loadSave = useGame((s) => s.loadSave);
  const deleteSave = useGame((s) => s.deleteSave);
  const refreshGames = useGame((s) => s.refreshGames);
  const leaveGame = useGame((s) => s.leaveGame);
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState<{ kind: "load" | "delete"; save: SaveInfo } | null>(null);
  const [showAll, setShowAll] = useState(false);
  // On the phone the list folds away: saving is one tap, browsing is a second.
  const [open, setOpen] = useState(!compact);
  const game = games.find((g) => g.id === roomId);
  const saves = game?.saves ?? [];
  const shown = showAll ? saves : saves.slice(0, 5);

  useEffect(() => {
    refreshGames();
  }, [refreshGames, roomId]);

  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(t);
  }, [justSaved]);

  if (compact && !open) {
    return (
      <section>
        <h3 className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <History className="size-3.5" /> <span className="truncate">Spielstand{game ? ` · ${game.name}` : ""}</span>
        </h3>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              saveGame("");
              setJustSaved(true);
            }}
            className="btn-3d flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-bold text-panel"
            style={{ ["--lip" as string]: "var(--color-accent-dark)" }}
          >
            <Save className="size-4" /> {justSaved ? "Gesichert" : "Jetzt sichern"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={false}
            className="flex h-12 shrink-0 items-center gap-1 rounded-full bg-ice px-4 text-[13px] font-semibold text-navy"
          >
            {saves.length > 0 ? `${saves.length} ${saves.length === 1 ? "Sicherung" : "Sicherungen"}` : "Sicherungen"}
            <ChevronDown className="size-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={leaveGame}
          className="mt-1.5 flex h-12 w-full items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold text-navy ring-1 ring-line"
        >
          <LogOut className="size-4" /> Anderes Spiel wählen
        </button>
      </section>
    );
  }

  return (
    <div className={compact ? "rounded-[18px] bg-snow p-3 ring-1 ring-line" : ""}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
        <History className="size-3.5" /> <span className="min-w-0 flex-1 truncate">Spielstände {game ? `· ${game.name}` : ""}</span>
        {compact && (
          <button type="button" onClick={() => setOpen(false)} className="-my-2 grid size-11 place-items-center rounded-full text-muted" aria-label="Sicherungen zuklappen">
            <ChevronDown className="size-4 rotate-180" />
          </button>
        )}
      </div>
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          saveGame(name);
          setName("");
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={SAVE_NAME_MAX}
          placeholder={defaultSaveName()}
          aria-label="Name der Sicherung"
          className="h-11 min-w-0 flex-1 rounded-full bg-snow px-3 text-[12px] text-navy outline-none ring-1 ring-line placeholder:text-subtle focus:ring-accent"
        />
        <button
          type="submit"
          className="btn-3d flex h-11 shrink-0 items-center gap-1 rounded-full bg-accent px-3.5 text-[12px] font-bold text-panel"
          style={{ ["--lip" as string]: "var(--color-accent-dark)" }}
        >
          <Save className="size-4" /> Sichern
        </button>
      </form>
      {saves.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted">Noch keine Sicherung für dieses Spiel.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {shown.map((sv) => {
            const asking = confirm?.save.id === sv.id ? confirm.kind : null;
            return (
              <li key={sv.id} className="rounded-[12px] bg-ice px-2.5 py-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-navy">{sv.name}</div>
                    <div className="text-[10px] leading-snug text-muted">
                      {when(sv.createdAt)}
                      {sv.createdByName ? ` · ${sv.createdByName}` : ""}
                    </div>
                    <div className="text-[10px] leading-snug text-subtle">{summaryLine(sv.summary)}</div>
                  </div>
                  {!asking && (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirm({ kind: "load", save: sv })}
                        className="h-11 shrink-0 rounded-full bg-panel px-3 text-[11px] font-bold text-navy ring-1 ring-line"
                      >
                        Laden
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirm({ kind: "delete", save: sv })}
                        aria-label={`Sicherung ${sv.name} löschen`}
                        className="grid size-11 shrink-0 place-items-center rounded-full text-danger"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </>
                  )}
                </div>
                {asking && (
                  <div className="mt-1.5">
                    <p className="text-[11px] leading-snug text-navy">
                      {asking === "load"
                        ? "Für alle im Spiel laden? Der aktuelle Stand wird vorher automatisch gesichert."
                        : "Diese Sicherung endgültig löschen?"}
                    </p>
                    <div className="mt-1.5 flex gap-1.5">
                      <button type="button" onClick={() => setConfirm(null)} className="h-11 flex-1 rounded-full bg-panel text-[11px] font-bold text-navy ring-1 ring-line">
                        Abbrechen
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (asking === "load") loadSave(sv.id);
                          else deleteSave(sv.id);
                          setConfirm(null);
                        }}
                        className={`h-11 flex-1 rounded-full text-[11px] font-bold text-panel ${asking === "load" ? "bg-accent" : "bg-danger"}`}
                      >
                        {asking === "load" ? "Laden" : "Löschen"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {saves.length > 5 && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="mt-1.5 min-h-11 w-full text-[11px] font-semibold text-accent">
          {showAll ? "Weniger zeigen" : `Alle ${saves.length} zeigen`}
        </button>
      )}
      <button
        type="button"
        onClick={leaveGame}
        className="btn-3d btn-3d-light mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-ice text-[12px] font-bold text-navy"
      >
        <LogOut className="size-4" /> Anderes Spiel wählen
      </button>
    </div>
  );
}
