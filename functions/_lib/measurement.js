import { SESSION_IDLE_MS, SESSION_MAX_MS, SESSION_ID } from "../../assets/measurement-schema.js";

const EU_COUNTRIES = new Set("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" "));

export function requestMeasurementAllowed(request) {
  const bot = request.cf?.botManagement;
  return request.headers.get("Sec-GPC") !== "1"
    && request.headers.get("DNT") !== "1"
    && !EU_COUNTRIES.has(request.cf?.country)
    && !bot?.verifiedBot
    && !(typeof bot?.score === "number" && bot.score < 30);
}

async function sessionHash(id) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function readSession(db, id, now = Date.now()) {
  if (!db || typeof id !== "string" || !SESSION_ID.test(id)) return null;
  return db.prepare(`SELECT source, medium, campaign FROM measurement_sessions
    WHERE id_hash = ? AND last_seen > ? AND started_at > ?`)
    .bind(await sessionHash(id), now - SESSION_IDLE_MS, now - SESSION_MAX_MS).first();
}

// The unique keys and transaction deduplicate concurrent retries across isolates.
// Only hashes and fixed categories are stored; nothing identifies a person.
export async function acceptSessionEvent(db, event, now = Date.now()) {
  const hash = await sessionHash(event.sessionId);
  const active = "SELECT id_hash FROM measurement_sessions WHERE id_hash = ? AND last_seen > ? AND started_at > ?";
  const bounds = [hash, now - SESSION_IDLE_MS, now - SESSION_MAX_MS];
  const insertEvent = (name) => db.prepare(`INSERT OR IGNORE INTO measurement_events (session_hash, event_name)
    SELECT id_hash, ? FROM measurement_sessions WHERE id_hash IN (${active})`).bind(name, ...bounds);
  const result = await db.batch([
    db.prepare("DELETE FROM measurement_sessions WHERE started_at <= ?").bind(now - SESSION_MAX_MS),
    db.prepare(`INSERT OR IGNORE INTO measurement_sessions (id_hash, started_at, last_seen, source, medium, campaign)
      VALUES (?, ?, ?, ?, ?, ?)`).bind(hash, now, now, event.source, event.medium, event.campaign),
    db.prepare(`UPDATE measurement_sessions SET last_seen = ? WHERE id_hash = ? AND last_seen > ? AND started_at > ?`)
      .bind(now, ...bounds),
    insertEvent("session_started"),
    insertEvent(event.event),
    db.prepare(`SELECT source, medium, campaign FROM measurement_sessions WHERE id_hash IN (${active})`).bind(...bounds),
  ]);
  const attribution = result[5].results[0];
  if (!attribution) return { expired: true, events: [] };
  const events = [];
  if (result[3].meta.changes > 0) events.push({ ...event, ...attribution, event: "session_started", placement: "page" });
  if (event.event !== "session_started" && result[4].meta.changes > 0) events.push({ ...event, ...attribution });
  return { expired: false, events };
}
