
// ForensiTwin — OpenStreetMap data client.
// Uses the /api/overpass serverless proxy as the live data source.
// This avoids browser-side CORS failures from public Overpass mirrors.

const cache = new Map();

export const MIRRORS = [];

const ROAD_CLASSES =
  "motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|" +
  "motorway_link|trunk_link|primary_link|secondary_link|tertiary_link";

export function buildQuery(lat, lon, radius) {
  const around = `around:${radius},${lat.toFixed(6)},${lon.toFixed(6)}`;

  return `[out:json][timeout:25];
(
  way["highway"~"^(${ROAD_CLASSES})$"](${around});
  way["building"](${around});
  relation["building"](${around});
);
out geom qt;`;
}

// Used for optional pre-bundled map data.
export function offlineFileFor(lat, lon, radius) {
  return `${lat.toFixed(4)}_${lon.toFixed(4)}_${radius}.json`;
}

async function fetchWithTimeout(url, timeoutMs, signal) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort(new Error("Request timed out"));
  }, timeoutMs);

  const onAbort = () => controller.abort(signal.reason);

  signal?.addEventListener("abort", onAbort);

  try {
    return await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function tryOffline(lat, lon, radius, signal) {
  const path = `/offline-osm/${offlineFileFor(lat, lon, radius)}`;
  const response = await fetchWithTimeout(path, 5000, signal);

  if (!response.ok) {
    throw new Error(`No bundled map data (${response.status})`);
  }

  const json = await response.json();

  if (!Array.isArray(json.elements)) {
    throw new Error("Bundled map data has an invalid format");
  }

  if (json.elements.length === 0) {
    throw new Error("Bundled map data contains no map features");
  }

  return json;
}

async function tryProxy(lat, lon, radius, timeoutMs, signal) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    radius: String(radius),
  });

  const url = `/api/overpass?${params.toString()}`;
  const response = await fetchWithTimeout(url, timeoutMs, signal);

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    throw new Error(
      `Overpass proxy returned a non-JSON response (HTTP ${response.status})`
    );
  }

  const body = await response.json();

  if (!response.ok) {
    const details = Array.isArray(body.details)
      ? body.details.join("\n")
      : "";

    throw new Error(
      [body.error || `Overpass proxy failed (HTTP ${response.status})`, details]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (!Array.isArray(body.json?.elements)) {
    throw new Error("Overpass proxy response is missing json.elements");
  }

  if (body.json.elements.length === 0) {
    throw new Error(
      "The Overpass proxy returned no map features for this location and radius"
    );
  }

  return {
    json: body.json,
    mirror: body.mirror || "Overpass proxy",
    cached: response.headers.get("x-vercel-cache") === "HIT",
  };
}

export async function fetchOsm(
  lat,
  lon,
  radius = 800,
  { signal, onStatus, timeoutMs = 15000 } = {}
) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("Invalid map coordinates");
  }

  const key = `${lat.toFixed(4)},${lon.toFixed(4)},${radius}`;

  if (cache.has(key)) {
    return {
      json: cache.get(key),
      mirror: "session cache",
      cached: true,
    };
  }

  if (signal?.aborted) {
    throw signal.reason || new Error("Map request cancelled");
  }

  // Try a pre-bundled response first if this exact location exists.
  try {
    const json = await tryOffline(lat, lon, radius, signal);

    cache.set(key, json);

    return {
      json,
      mirror: "bundled offline data",
      cached: true,
    };
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason || error;
    }
    // No bundled file: continue to the live API.
  }

  let lastError;

  // The proxy already handles multiple Overpass servers.
  // Retry it once in case the first request hit a temporary outage.
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (signal?.aborted) {
      throw signal.reason || new Error("Map request cancelled");
    }

    onStatus?.(
      attempt === 1
        ? "Requesting map data from the ForensiTwin API…"
        : "Retrying the ForensiTwin map API…"
    );

    try {
      const result = await tryProxy(
        lat,
        lon,
        radius,
        timeoutMs,
        signal
      );

      cache.set(key, result.json);

      onStatus?.(
        `Loaded ${result.json.elements.length.toLocaleString()} map features`
      );

      return result;
    } catch (error) {
      lastError = error;

      if (signal?.aborted) {
        throw signal.reason || error;
      }

      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    }
  }

  throw new Error(
    `Unable to load map data through /api/overpass.\n${
      lastError?.message || "Unknown API error"
    }`
  );
}
