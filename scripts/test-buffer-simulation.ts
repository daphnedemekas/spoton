/*
  Buffer simulation for background discovery (UI-independent)
  - Triggers discovery with user prefs
  - Polls /api/events to observe buffer size
  - Simulates user consuming cards at 2–5s per card
  - Measures: time-to-first-12, total discovered, refill latency when buffer dips
*/

import fs from 'fs';
import path from 'path';

type EventItem = {
  id?: string;
  title: string;
  description?: string;
  date: string;
  location?: string;
  event_link?: string;
  image_url?: string;
  interests?: string[];
  vibes?: string[];
};

type Progress = {
  step?: 'idle'|'start'|'search'|'listings'|'events'|'done';
  counts?: { braveSites?: number; eventLinks?: number; candidatePages?: number; extractedEvents?: number };
};

const args = process.argv.slice(2);
const flags: Record<string, string> = {};
for (const a of args) {
  const [k, v] = a.startsWith('--') ? a.slice(2).split('=') : [a, 'true'];
  if (k) flags[k] = v ?? 'true';
}

const BASE = flags.base || process.env.TEST_BASE_URL || 'http://localhost:5173';
const CITY = flags.city || process.env.TEST_CITY || 'SAN FRANCISCO';
const MIN_BATCH = Number(flags.minBatch || 12);
const SIM_MIN = Number(flags.minutes || 2); // total simulation minutes
const CONSUME_MIN_S = Number(flags.consumeMin || 2);
const CONSUME_MAX_S = Number(flags.consumeMax || 5);

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_PATH = path.join(LOG_DIR, `buffer-sim-${ts}.log`);
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(msg: string, data?: any) {
  const line = `[${new Date().toISOString()}] ${msg}` + (data ? ` ${JSON.stringify(data)}` : '');
  console.log(line);
  fs.appendFileSync(LOG_PATH, line + '\n');
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function filterThisWeek(events: EventItem[]): EventItem[] {
  const today = new Date();
  today.setHours(0,0,0,0);
  const weekFromNow = new Date(today);
  weekFromNow.setDate(today.getDate() + 7);
  return events.filter(ev => {
    const d = new Date(ev.date);
    return d >= today && d <= weekFromNow;
  });
}

async function getPrefs() {
  const profile = await getJson<any>(`${BASE}/api/profile`);
  const interests = await getJson<any>(`${BASE}/api/user_interests`);
  const vibes = await getJson<any>(`${BASE}/api/user_vibes`);
  return {
    city: profile?.city || CITY,
    interests: Array.isArray(interests) ? interests.map((x: any) => x.interest) : [],
    vibes: Array.isArray(vibes) ? vibes.map((x: any) => x.vibe) : [],
  };
}

async function startDiscovery(prefs: { city: string; interests: string[]; vibes: string[] }) {
  const t0 = Date.now();
  const res = await getJson<any>(`${BASE}/api/discover-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs)
  });
  log('Discovery start call returned', { timeMs: Date.now() - t0, keys: Object.keys(res || {}) });
}

async function getEvents() {
  const data = await getJson<{ events?: EventItem[] } | EventItem[]>(`${BASE}/api/events`);
  if (!data) return [] as EventItem[];
  return Array.isArray(data) ? data : (data.events || []);
}

async function main() {
  log('Starting buffer simulation', { BASE, MIN_BATCH, SIM_MIN, CONSUME_MIN_S, CONSUME_MAX_S });
  const prefs = await getPrefs();
  log('Prefs', prefs);

  const globalStart = Date.now();
  await startDiscovery(prefs);

  // Wait for first batch
  let tFirstEvent = -1;
  let tFirstBatch = -1;
  while (true) {
    const events = filterThisWeek(await getEvents());
    if (events.length > 0 && tFirstEvent < 0) {
      tFirstEvent = Date.now() - globalStart;
      log('First event observed', { tFirstEventMs: tFirstEvent, count: events.length, title: events[0]?.title });
    }
    if (events.length >= MIN_BATCH) {
      tFirstBatch = Date.now() - globalStart;
      log('First batch observed', { tFirstBatchMs: tFirstBatch, count: events.length });
      break;
    }
    await sleep(1000);
  }

  // Simulate consumption
  let consumed = 0;
  let refillEventsObserved = 0;
  let lastBufferSize = 0;
  let maxBufferSize = 0;
  const endAt = Date.now() + SIM_MIN * 60_000;
  while (Date.now() < endAt) {
    let events = filterThisWeek(await getEvents());
    lastBufferSize = events.length;
    if (events.length > maxBufferSize) maxBufferSize = events.length;

    if (events.length === 0) {
      // Wait to observe refill
      const waitStart = Date.now();
      while ((await getEvents()).length === 0 && Date.now() - waitStart < 120_000) {
        await sleep(1000);
      }
      const after = filterThisWeek(await getEvents()).length;
      if (after > 0) {
        refillEventsObserved += after;
        log('Refill observed', { refillCount: after, waitedMs: Date.now() - waitStart });
      }
      continue;
    }

    // Consume one card
    const ev = events[0];
    consumed += 1;
    log('Consumed', { title: ev.title, remainingBefore: events.length });
    // Simulate removal by deleting from DB attendance and inserting dismissal not required here; just wait
    // In practice, the UI hides the card immediately; we simulate by waiting and trusting next poll reflects new arrivals
    const waitMs = Math.round((CONSUME_MIN_S * 1000) + Math.random() * ((CONSUME_MAX_S - CONSUME_MIN_S) * 1000));
    await sleep(waitMs);
  }

  const finalCount = filterThisWeek(await getEvents()).length;
  log('SIM SUMMARY', {
    tFirstEventMs: tFirstEvent,
    tFirstBatchMs: tFirstBatch,
    consumed,
    refillEventsObserved,
    maxBufferSize,
    finalBuffer: finalCount,
    durationMs: Date.now() - globalStart
  });

  console.log(`\nLog written to: ${LOG_PATH}`);
}

main().catch(err => {
  log('Simulation failed', { error: String(err) });
  process.exit(1);
});


