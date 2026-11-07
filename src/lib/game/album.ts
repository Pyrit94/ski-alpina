/**
 * The match photo album: one picture of the resort after each round.
 *
 * Kept on this device (IndexedDB), not on the server: a few dozen JPEGs per
 * match are nothing for a browser, but would bloat every save and snapshot.
 * Each player gets their own album from their own camera angle.
 */
export interface AlbumPhoto {
  key: string;
  roomId: string;
  matchStartedAt: number;
  round: number;
  at: number;
  dataUrl: string;
}

const DB = "ski-alpina-album";
const STORE = "photos";

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const s = db.createObjectStore(STORE, { keyPath: "key" });
          s.createIndex("match", ["roomId", "matchStartedAt"]);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function savePhoto(photo: Omit<AlbumPhoto, "key" | "at">): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...photo, key: `${photo.roomId}:${photo.matchStartedAt}:${photo.round}`, at: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

export async function loadAlbum(roomId: string, matchStartedAt: number): Promise<AlbumPhoto[]> {
  const db = await open();
  if (!db) return [];
  const photos = await new Promise<AlbumPhoto[]>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).index("match").getAll([roomId, matchStartedAt]);
      req.onsuccess = () => resolve((req.result as AlbumPhoto[]) ?? []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
  db.close();
  return photos.sort((a, b) => a.round - b.round);
}
