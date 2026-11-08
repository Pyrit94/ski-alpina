import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { TERRAIN } from "@ski/config";
import { authEnabled, signIn, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { loadName } from "@/lib/game/net";
import { GamePicker } from "./GamePicker";

const FEATURES = ["Zu zweit", "Echtes Matterhorn-Gelände", "Lifte · Pisten · Hotels"];

/** Better Auth sends refused sign-ins back with `?error=…`. */
function signInError(): string | null {
  if (typeof window === "undefined") return null;
  const code = new URLSearchParams(window.location.search).get("error");
  if (!code) return null;
  return "Dieses Konto ist für dieses Skigebiet nicht freigeschaltet.";
}

export function StartScreen() {
  const [name, setName] = useState(() => (typeof window === "undefined" ? "Gast" : loadName()));
  const { user, isPending } = useCurrentUserState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(signInError);
  // With sign-in on, the account decides who you are; the name field is only
  // for local play without a server roster.
  const needsSignIn = authEnabled && !user;
  const playerName = user && !user.isDevFallback ? (user.displayName ?? name) : name;
  return (
    <main className="relative isolate min-h-dvh w-full overflow-hidden bg-navy" style={{ color: "#F5FAFE" }}>
      <img
        src="/textures/hero.jpg"
        alt=""
        className="absolute inset-0 -z-10 h-full w-full object-cover object-[58%_42%] lg:object-center"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-navy via-navy/75 to-navy/20" />
      <div
        className="flex min-h-dvh flex-col justify-between"
        style={{
          paddingTop: "max(1.25rem, env(safe-area-inset-top))",
          paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
          paddingLeft: "max(1.25rem, env(safe-area-inset-left))",
          paddingRight: "max(1.25rem, env(safe-area-inset-right))",
        }}
      >
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 32 32" className="size-10 shrink-0" aria-hidden>
            <rect width="32" height="32" rx="8" fill="#16305C" />
            <path d="M4 22 L12 10 L18 18 L22 12 L28 22 Z" fill="#A8CBF5" />
            <path d="M12 10 L18 18 L8 22 Z" fill="#2F6FED" />
          </svg>
          <div>
            <div className="text-base font-bold tracking-wide lg:text-lg">SKI ALPINA</div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ice">Wallis · Zermatt</div>
          </div>
        </div>

        <div className="w-full max-w-xl">
          <h1 className="text-[clamp(1.85rem,8vw,3.15rem)] font-semibold leading-[1.12] tracking-tight text-snow drop-shadow">
            Gemeinsam ein Skigebiet bauen
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ice lg:mt-4">
            Lifte spannen, Pisten ziehen, das Dorf wachsen lassen — zu zweit auf echtem Alpengelände rund ums Matterhorn.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {FEATURES.map((f) => (
              <span
                key={f}
                className="rounded-full bg-snow/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ice ring-1 ring-snow/15"
              >
                {f}
              </span>
            ))}
          </div>
          {needsSignIn ? (
            <div className="mt-6 flex w-full flex-col gap-3 sm:max-w-md">
              <button
                type="button"
                disabled={isPending || busy}
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  signIn("grok-google").catch((err: unknown) => {
                    setBusy(false);
                    setError(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
                  });
                }}
                className="flex h-12 min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-[15px] font-semibold text-panel disabled:opacity-60 sm:w-auto"
              >
                {isPending ? "Einen Moment…" : busy ? "Weiter zu Google…" : "Mit Google anmelden"}
                {!isPending && !busy && <ChevronRight className="size-4" />}
              </button>
              {error && <p className="text-[13px] font-medium text-[#ffd18a]">{error}</p>}
            </div>
          ) : (
            <>
              {user && !user.isDevFallback ? (
                <p className="mt-6 text-[13px] text-ice">
                  Angemeldet als <span className="font-semibold text-snow">{playerName}</span> ·{" "}
                  <button type="button" className="underline underline-offset-2" onClick={() => void signOut()}>
                    Abmelden
                  </button>
                </p>
              ) : (
                <label className="mt-6 block text-[11px] font-semibold uppercase tracking-wide text-ice">
                  Dein Name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={24}
                    className="mt-1.5 flex h-12 min-h-12 w-full max-w-md items-center rounded-full bg-panel/15 px-4 text-[15px] text-snow outline-none ring-1 ring-snow/25"
                    placeholder="Name"
                  />
                </label>
              )}
              <GamePicker playerName={playerName} />
            </>
          )}
          <p className="mt-4 text-[11px] leading-snug text-ice/80">{TERRAIN.attribution}</p>
        </div>
      </div>
    </main>
  );
}
