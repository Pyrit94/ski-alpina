import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { savePhoto } from "@/lib/game/album";
import { useGame } from "@/lib/game/store";

const WIDTH = 640;

/**
 * Takes the album photo when the store asks for one.
 *
 * Renders one frame and reads it back straight away, so the canvas does not
 * need `preserveDrawingBuffer` (which would cost every frame), then scales it
 * down to a small JPEG.
 */
export function AlbumCapture() {
  const { gl, scene, camera } = useThree();
  const request = useGame((s) => s.albumRequest);

  useEffect(() => {
    if (!request) return;
    const timer = window.setTimeout(() => {
      try {
        gl.render(scene, camera);
        const src = gl.domElement;
        const scale = Math.min(1, WIDTH / Math.max(1, src.width));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(src.width * scale);
        canvas.height = Math.round(src.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
        void savePhoto({ roomId: request.roomId, matchStartedAt: request.matchStartedAt, round: request.round, dataUrl });
      } catch {
        /* a lost context or a tainted canvas: no photo this round */
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [request, gl, scene, camera]);

  return null;
}
