import type { WeatherState } from "./types";

function mapCode(code: number, temp: number): Pick<WeatherState, "kind" | "label" | "snowQuality"> {
  if (code === 0) return { kind: "sun", label: "Klar", snowQuality: 0.9 };
  if (code <= 3) return { kind: "cloud", label: "Leicht bewölkt", snowQuality: 0.82 };
  if (code === 45 || code === 48) return { kind: "fog", label: "Nebel", snowQuality: 0.7 };
  if (code >= 71 && code <= 77) return { kind: "snow", label: "Schneefall", snowQuality: 0.96 };
  if (code >= 80 && code <= 86) return { kind: "snow", label: "Schneeschauer", snowQuality: 0.92 };
  if (code >= 95) return { kind: "storm", label: "Gewitter", snowQuality: 0.55 };
  if (temp > 2) return { kind: "cloud", label: "Tauwetter", snowQuality: 0.48 };
  return { kind: "cloud", label: "Bewölkt", snowQuality: 0.75 };
}

export async function fetchAlpineWeather(): Promise<WeatherState | null> {
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=45.976&longitude=7.659&current=temperature_2m,weather_code,wind_speed_10m&timezone=Europe%2FZurich";
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };
    const temp = json.current?.temperature_2m ?? -6;
    const code = json.current?.weather_code ?? 0;
    const mapped = mapCode(code, temp);
    return {
      ...mapped,
      tempC: Math.round(temp),
      live: true,
    };
  } catch {
    return null;
  }
}

// `cycleWeather` used to live here and was never called. Its storm branch was
// unreachable anyway — `roll > 0.97` sat behind `roll > 0.82` — and weather it
// produced could not have reached the sim, which runs on the server. The sky is
// now rolled there, deterministically per day, in packages/shared/engine/weather.
