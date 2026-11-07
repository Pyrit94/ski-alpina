import { useEffect, useState } from "react";
import { Images, Pause, Play } from "lucide-react";
import { loadAlbum, type AlbumPhoto } from "@/lib/game/album";
import { useGame } from "@/lib/game/store";

/** The match's photos from this device, as a strip and a time-lapse. */
export function AlbumView() {
  const roomId = useGame((s) => s.roomId);
  const startedAt = useGame((s) => s.match.startedAt);
  const rounds = useGame((s) => s.match.history.length);
  const enabled = useGame((s) => s.match.mode === "match" && s.match.options.album);
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    // The photo of the last round is written shortly after the report arrives.
    const t = window.setTimeout(() => {
      void loadAlbum(roomId, startedAt).then((p) => {
        if (alive) {
          setPhotos(p);
          setIndex(Math.max(0, p.length - 1));
        }
      });
    }, 1500);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [roomId, startedAt, rounds, enabled]);

  useEffect(() => {
    if (!playing || photos.length < 2) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % photos.length), 800);
    return () => window.clearInterval(t);
  }, [playing, photos.length]);

  if (!enabled || photos.length === 0) return null;
  const current = photos[Math.min(index, photos.length - 1)]!;
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <Images className="size-3.5" /> Fotoalbum
        </span>
        {photos.length > 1 && (
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            className="flex h-8 items-center gap-1 rounded-full bg-ice px-3 text-[11px] font-bold text-navy"
          >
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} Zeitraffer
          </button>
        )}
      </div>
      <div className="relative overflow-hidden rounded-[16px] bg-navy">
        <img src={current.dataUrl} alt={`Runde ${current.round}`} className="aspect-video w-full object-cover" />
        <span className="absolute left-2 top-2 rounded-full bg-navy/70 px-2 py-0.5 text-[11px] font-bold text-snow">
          Runde {current.round}
        </span>
      </div>
      <div className="mt-1.5 flex gap-1 overflow-x-auto pb-1">
        {photos.map((p, i) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setPlaying(false);
              setIndex(i);
            }}
            className={`shrink-0 overflow-hidden rounded-[8px] ring-2 ${i === index ? "ring-accent" : "ring-transparent"}`}
          >
            <img src={p.dataUrl} alt="" className="h-10 w-16 object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
