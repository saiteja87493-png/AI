"use strict";

const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { initialState } = require("./demo-data");
const { assess, matchesBrand } = require("./risk-engine");

const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DB_PATH = process.env.BRANDSHIELD_DB || path.join(DATA_DIR, "brandshield.sqlite");
const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const APP_STORE_COUNTRIES = new Set(["us", "in", "gb", "ca", "au"]);
const SOCIAL_SEARCH_URL = "https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors";
const APP_SEARCH_URL = "https://itunes.apple.com/search";
const MIME_TYPES = { ".html": "text/html; charset=utf-8" };

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS official_assets (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
`);

function readState() {
  const brandRow = db.prepare("SELECT value FROM settings WHERE key = ?").get("brand");
  if (!brandRow) return null;
  const official = db.prepare("SELECT data FROM official_assets ORDER BY rowid").all().map((row) => JSON.parse(row.data));
  const alerts = db.prepare("SELECT data FROM alerts ORDER BY rowid").all().map((row) => JSON.parse(row.data));
  return { brand: JSON.parse(brandRow.value), official, alerts };
}

function writeState(state) {
  if (!state || typeof state !== "object" || !state.brand || !Array.isArray(state.official) || !Array.isArray(state.alerts)) {
    throw new HttpError(400, "Expected a brand profile, official asset list, and alert list.");
  }
  if (typeof state.brand.name !== "string" || !state.brand.name.trim() || state.brand.name.length > 60) {
    throw new HttpError(400, "Brand name must be between 1 and 60 characters.");
  }
  if (state.brand.website && (typeof state.brand.website !== "string" || state.brand.website.length > 200)) {
    throw new HttpError(400, "Brand website must not exceed 200 characters.");
  }
  if (state.brand.logo && (typeof state.brand.logo !== "string" || state.brand.logo.length > 1_500_000)) {
    throw new HttpError(400, "Brand logo must be an image no larger than 1 MB.");
  }
  if (state.official.length > 500 || state.alerts.length > 5000) {
    throw new HttpError(400, "The saved dataset exceeds the prototype limits.");
  }

  const officialIds = new Set();
  const alertIds = new Set();
  for (const asset of state.official) {
    if (!asset || !["social", "app"].includes(asset.kind)
      || typeof asset.identifier !== "string" || asset.identifier.length > 120
      || typeof asset.platform !== "string" || asset.platform.length > 60
      || typeof asset.publisher !== "string" || asset.publisher.length > 120) {
      throw new HttpError(400, "One or more official assets have invalid fields.");
    }
    if (!asset.id) asset.id = randomUUID();
    if (typeof asset.id !== "string" || asset.id.length > 100 || officialIds.has(asset.id)) {
      throw new HttpError(400, "Official asset identifiers must be unique strings.");
    }
    officialIds.add(asset.id);
  }
  for (const alert of state.alerts) {
    if (!alert || typeof alert.id !== "string" || alert.id.length > 150 || alertIds.has(alert.id)
      || !["social", "app"].includes(alert.kind) || typeof alert.name !== "string" || alert.name.length > 150
      || !Number.isInteger(alert.score) || alert.score < 0 || alert.score > 100
      || !Array.isArray(alert.reasons) || alert.reasons.length > 30
      || typeof alert.status !== "string" || alert.status.length > 80) {
      throw new HttpError(400, "One or more alert records have invalid fields.");
    }
    alertIds.add(alert.id);
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run("brand", JSON.stringify(state.brand));
    db.exec("DELETE FROM official_assets; DELETE FROM alerts;");
    const insertOfficial = db.prepare("INSERT INTO official_assets (id, data) VALUES (?, ?)");
    for (const asset of state.official) insertOfficial.run(asset.id, JSON.stringify(asset));
    const insertAlert = db.prepare("INSERT INTO alerts (id, data) VALUES (?, ?)");
    for (const alert of state.alerts) insertAlert.run(alert.id, JSON.stringify(alert));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

if (!readState()) writeState(structuredClone(initialState));

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (size > MAX_BODY_BYTES) return;
      size += Buffer.byteLength(chunk, "utf8");
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "Request body exceeds the 2 MB prototype limit."));
        return;
      }
      body += chunk;
    });
    request.on("end", () => {
      if (!body) { resolve({}); return; }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new HttpError(400, "Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function requireText(value, name, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new HttpError(400, `${name} must be between 1 and ${maxLength} characters.`);
  }
  return value.trim();
}

function assessedAsset(candidate, state) {
  const result = assess(candidate, state.brand.name, state.official);
  return {
    ...candidate,
    score: result.score,
    reasons: result.reasons,
    status: result.official ? "Excluded — official" : "Open"
  };
}

async function fetchPublicJson(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "BrandShieldAI-Demo/1.0" },
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new HttpError(504, "Public source timed out. Please try again.");
    }
    throw new HttpError(502, `Could not reach the public source: ${error.message}`);
  }
  if (!response.ok) throw new HttpError(502, `Public source returned HTTP ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new HttpError(502, "Public source returned an invalid response.");
  }
}

async function searchBluesky(state) {
  const url = new URL(SOCIAL_SEARCH_URL);
  url.searchParams.set("q", state.brand.name);
  url.searchParams.set("limit", "30");
  const payload = await fetchPublicJson(url);
  if (!Array.isArray(payload.actors)) throw new HttpError(502, "Bluesky returned an unexpected response.");
  const results = payload.actors.map((actor) => {
    const handle = typeof actor.handle === "string" ? actor.handle.trim() : "";
    return assessedAsset({
      id: `live-bsky-${String(actor.did || handle).slice(0, 120)}`,
      kind: "social",
      platform: "Bluesky",
      name: typeof actor.displayName === "string" && actor.displayName.trim() ? actor.displayName.trim().slice(0, 150) : handle,
      handle: handle ? `@${handle.slice(0, 150)}` : "",
      description: typeof actor.description === "string" ? actor.description.slice(0, 600) : "",
      publisher: "",
      age: "unknown",
      source: "Bluesky public search",
      url: handle ? `https://bsky.app/profile/${encodeURIComponent(handle)}` : ""
    }, state);
  }).filter((item) => matchesBrand(item, state.brand.name));
  return { source: "Bluesky public search", results };
}

async function searchAppStore(state, country) {
  const storefront = String(country || "us").toLowerCase();
  if (!APP_STORE_COUNTRIES.has(storefront)) {
    throw new HttpError(400, "Choose a supported App Store storefront: US, India, UK, Canada, or Australia.");
  }
  const url = new URL(APP_SEARCH_URL);
  url.searchParams.set("term", state.brand.name);
  url.searchParams.set("entity", "software");
  url.searchParams.set("limit", "30");
  url.searchParams.set("country", storefront);
  const payload = await fetchPublicJson(url);
  if (!Array.isArray(payload.results)) throw new HttpError(502, "Apple returned an unexpected response.");
  const results = payload.results.map((app) => assessedAsset({
    id: `live-apple-${String(app.trackId || "").slice(0, 50)}`,
    kind: "app",
    platform: "Apple App Store",
    name: typeof app.trackName === "string" ? app.trackName.trim().slice(0, 150) : "",
    handle: typeof app.bundleId === "string" ? app.bundleId.slice(0, 150) : "",
    description: typeof app.description === "string" ? app.description.slice(0, 600) : "",
    publisher: typeof app.artistName === "string" ? app.artistName.trim().slice(0, 150) : "",
    age: "unknown",
    source: "Apple App Store public search",
    url: typeof app.trackViewUrl === "string" ? app.trackViewUrl : ""
  }, state)).filter((item) => item.name && matchesBrand(item, state.brand.name));
  return { source: "Apple App Store public search", results };
}

async function handleApi(request, response, url) {
  const state = readState();
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { status: "ok", service: "BrandShield API", database: "SQLite", version: 1 });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/state") {
    sendJson(response, 200, state);
    return;
  }
  if (request.method === "PUT" && url.pathname === "/api/state") {
    const submitted = await readJson(request);
    writeState(submitted);
    sendJson(response, 200, readState());
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/analyze") {
    const input = await readJson(request);
    const kind = input.kind;
    if (!["social", "app"].includes(kind)) throw new HttpError(400, "Asset type must be social or app.");
    const candidate = {
      id: typeof input.id === "string" && input.id.length <= 150 ? input.id : randomUUID(),
      kind,
      platform: requireText(input.platform, "Platform", 60),
      name: requireText(input.name, "Name", 150),
      handle: typeof input.handle === "string" ? input.handle.trim().slice(0, 150) : "",
      description: typeof input.description === "string" ? input.description.trim().slice(0, 600) : "",
      publisher: typeof input.publisher === "string" ? input.publisher.trim().slice(0, 150) : "",
      age: ["new", "established"].includes(input.age) ? input.age : "unknown",
      source: "User submission"
    };
    const assessed = assessedAsset(candidate, state);
    sendJson(response, 200, assessed);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/search/bluesky") {
    sendJson(response, 200, await searchBluesky(state));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/search/app-store") {
    const input = await readJson(request);
    sendJson(response, 200, await searchAppStore(state, input.country));
    return;
  }
  throw new HttpError(404, "API endpoint not found.");
}

function servePage(response, filename) {
  const filePath = path.join(ROOT, filename);
  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(response, 500, { error: "Could not read the application page." });
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filename)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    if (request.method !== "GET") {
      throw new HttpError(405, "Method not allowed.");
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      servePage(response, "index.html");
      return;
    }
    if (url.pathname === "/dashboard" || url.pathname === "/dashboard.html") {
      servePage(response, "dashboard.html");
      return;
    }
    throw new HttpError(404, "Page not found.");
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(response, error.status, { error: error.message });
      return;
    }
    console.error("Request failed:", error);
    if (!response.headersSent) sendJson(response, 500, { error: "Internal server error." });
    else response.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`BrandShield is running at http://localhost:${PORT}`);
  console.log(`SQLite database: ${DB_PATH}`);
  console.log(`API health check: http://localhost:${PORT}/api/health`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
