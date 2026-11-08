import { useState } from "react";
import { Lock, Share2, UserPlus } from "lucide-react";
import { inviteUrl, shareInvite } from "@/lib/game/invite";
import { useGame } from "@/lib/game/store";
import { Modal, PrimaryButton } from "./MatchHUD";

/**
 * «Komm in mein Gebiet»: hand on a link that opens this game.
 *
 * The share sheet on a phone, the clipboard elsewhere, and the link itself to
 * copy by hand when neither is allowed. Returns the link when it had to be shown.
 */
function useInvite(): { kind: "shared" | "own"; invite: () => Promise<string | null> } {
  const roomId = useGame((s) => s.roomId);
  const resortName = useGame((s) => s.resortName);
  const game = useGame((s) => s.games.find((g) => g.id === s.roomId));
  const pushNote = useGame((s) => s.pushNote);
  const invite = async () => {
    const url = inviteUrl(window.location.origin, roomId);
    const result = await shareInvite(url, resortName || "Skigebiet");
    if (result === "copied") pushNote("Link kopiert", "Schick ihn weiter: Wer ihn öffnet, landet direkt in diesem Gebiet.", "ok");
    return result === "failed" ? url : null;
  };
  // Until the game list has arrived, assume what most games are: shared.
  return { kind: game?.kind ?? "shared", invite };
}

/** For the Team panel and the menu: invite, or first open a private game. */
export function InvitePanel({ bare = false }: { bare?: boolean }) {
  const { kind, invite } = useInvite();
  const shareGame = useGame((s) => s.shareGame);
  const [confirming, setConfirming] = useState(false);
  const [manual, setManual] = useState<string | null>(null);
  const box = bare ? "" : "rounded-[16px] bg-ice/70 p-2.5";

  if (kind === "own") {
    return (
      <div className={box}>
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-navy">
          <Lock className="size-4" /> Privates Gebiet
        </div>
        <p className="mt-0.5 text-[12px] leading-snug text-muted">
          Nur du siehst dieses Gebiet. Um jemanden einzuladen, gib es zuerst frei.
        </p>
        {confirming ? (
          <div className="mt-2">
            <p className="text-[12px] leading-snug text-navy">
              Freigeben? Das Gebiet erscheint dann auch bei allen anderen Freigeschalteten auf dem Startbildschirm. Zurück auf
              privat geht nicht.
            </p>
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="h-11 flex-1 rounded-full bg-panel text-[13px] font-semibold text-navy ring-1 ring-line"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => {
                  shareGame();
                  setConfirming(false);
                }}
                className="h-11 flex-1 rounded-full bg-accent text-[13px] font-bold text-panel"
              >
                Freigeben
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-panel text-[13px] font-bold text-navy ring-1 ring-line"
          >
            <UserPlus className="size-4" /> Freigeben und einladen
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={box}>
      <div className="flex items-center gap-1.5 text-[13px] font-bold text-navy">
        <UserPlus className="size-4" /> Komm in mein Gebiet
      </div>
      <p className="mt-0.5 text-[12px] leading-snug text-muted">
        Schick den Link: Wer ihn öffnet und freigeschaltet ist, landet direkt hier.
      </p>
      <button
        type="button"
        onClick={() => void invite().then(setManual)}
        className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-accent text-[13px] font-bold text-panel"
      >
        <Share2 className="size-4" /> Einladen
      </button>
      {manual && <ManualLink url={manual} />}
    </div>
  );
}

/** When neither sharing nor the clipboard is allowed: the link to copy by hand. */
function ManualLink({ url }: { url: string }) {
  return (
    <label className="mt-2 block text-[11px] font-semibold text-muted">
      Link zum Kopieren
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-1 h-11 w-full rounded-full bg-panel px-3 text-[12px] text-navy outline-none ring-1 ring-line"
      />
    </label>
  );
}

/** Right after starting a shared game: who builds with you? */
export function InviteModal() {
  const open = useGame((s) => s.inviteHint);
  const { invite } = useInvite();
  const [manual, setManual] = useState<string | null>(null);
  if (!open) return null;
  const close = () => useGame.setState({ inviteHint: false });
  return (
    <Modal onClose={close}>
      <div className="bg-gradient-to-br from-navy to-[#24508f] px-5 pb-5 pt-6 text-snow">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-soft">Gemeinsames Gebiet</div>
        <div className="mt-1 text-[22px] font-bold">Wer baut mit?</div>
        <p className="mt-1 text-[13px] leading-snug text-ice">
          Schick einen Link: Wer ihn öffnet und freigeschaltet ist, landet direkt in diesem Gebiet. Später findest du «Einladen»
          auch unter Team und im Menü.
        </p>
      </div>
      <div className="flex flex-col gap-2 p-4">
        <PrimaryButton
          onClick={() =>
            void invite().then((url) => {
              setManual(url);
              if (!url) close();
            })
          }
        >
          <Share2 className="size-4" /> Einladen
        </PrimaryButton>
        {manual && <ManualLink url={manual} />}
        <PrimaryButton tone="light" onClick={close}>
          Später
        </PrimaryButton>
      </div>
    </Modal>
  );
}
