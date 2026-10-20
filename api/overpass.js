
/**
 * ForensiTwin — OpenStreetMap / Overpass proxy
 *
 * Returns road and building geometry for a selected location.
 * Queries public Overpass servers in parallel and returns the first
 * successful response containing map data.
 *
 * Compatible with the existing frontend:
 * {
 *   json: { elements: [...] },
 *   mirror: "server hostname"
 * }
 */

export const config = {
  maxDuration: 10,
};

const ROAD_CLASSES =
  "motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|" +
  "motorway_link|trunk_link|primary_link|secondary_link|tertiary_link";

const OVERPASS_MIRRORS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

// Leave time for Vercel to serialize and return the response before
// the serverless function reaches its execution limit.
const REQUEST_TIMEOUT_MS = 6500;

function buildOverpassQuery(lat, lon, radius) {
  const around = `around:${radius},${lat.toFixed(6)},${lon.toFixed(6)}`;

  return `[out:json][timeout:6];
(
  way["highway"~"^(${ROAD_CLASSES})$"](${around});
  way["building"](${around});
  relation["building"](${around});
);
out geom qt;`;
}

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timer);
  });
}

function describeError(error) {
  if (error?.name === "AbortError" || error?.name === "TimeoutError") {
    return "request timed out";
  }

  return error?.message || String(error);
}

async function queryMirror(url, query) {
  const hostname = new URL(url).hostname;

  let response;

  try {
    response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent":
          "ForensiTwin/1.0 (OpenStreetMap road and building data client)",
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    // Retry with GET only when the server explicitly rejects the POST
    // method or request format.
    if ([400, 405, 406, 413, 415].includes(response.status)) {
      try {
        await response.body?.cancel();
      } catch {
        // The response body may already have been closed.
      }

      response = await fetchWithTimeout(
        `${url}?data=${encodeURIComponent(query)}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent":
              "ForensiTwin/1.0 (OpenStreetMap road and building data client)",
          },
        }
      );
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();

    if (!json || !Array.isArray(json.elements)) {
      throw new Error("Invalid Overpass response");
    }

    // An empty response is not treated as proof that no map data exists.
    // Other mirrors should get a chance to respond.
    if (json.elements.length === 0) {
      throw new Error("This server returned no elements");
    }

    return {
      json,
      mirror: hostname,
    };
  } catch (error) {
    throw new Error(`${hostname}: ${describeError(error)}`);
  }
}

function getQueryParameter(value) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: "Method not allowed. Use GET with lat, lon and radius parameters.",
    });
  }

  const lat = Number(getQueryParameter(req.query?.lat));
  const lon = Number(getQueryParameter(req.query?.lon));
  const requestedRadius = Number.parseInt(
    getQueryParameter(req.query?.radius),
    10
  );

  const radius = Number.isFinite(requestedRadius)
    ? Math.min(1500, Math.max(100, requestedRadius))
    : 800;

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return res.status(400).json({
      error: "Valid latitude and longitude parameters are required.",
    });
  }

  const query = buildOverpassQuery(lat, lon, radius);

  // Start all requests together. Promise.any returns as soon as one
  // mirror provides a valid, non-empty response.
  const attempts = OVERPASS_MIRRORS.map((url) => queryMirror(url, query));

  try {
    const result = await Promise.any(attempts);

    res.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800, stale-if-error=2592000"
    );

    return res.status(200).json(result);
  } catch {
    // All mirrors failed or returned empty results. Inspect the settled
    // attempts to provide a useful diagnostic instead of hiding the cause.
    const settled = await Promise.allSettled(attempts);

    const errors = settled
      .filter((item) => item.status === "rejected")
      .map((item) => item.reason?.message || String(item.reason));

    res.setHeader("Cache-Control", "no-store");

    return res.status(502).json({
      error:
        "No Overpass server returned usable map data. This may be temporary; it does not confirm that the selected area has no roads or buildings.",
      details: errors,
    });
  }
}
