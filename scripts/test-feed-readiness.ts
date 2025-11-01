/*
  Test harness for frontend card readiness
  - Triggers discovery
  - Polls /api/discovery-progress and /api/events
  - Computes when the UI would be ready to show cards (this_week filter)
  - Logs time-to-first-event, time-to-first-batch, per-phase durations, and sample cards
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
  sites?: Array<{ url: string; status: string; source?: string }>;
};

const args = process.argv.slice(2);
const opts: Record<string, string> = {};
for (const a of args) {
  const [k, v] = a.startsWith('--') ? a.slice(2).split('=') : [a, 'true'];
  if (k) opts[k] = v ?? 'true';
}

const BASE = opts.base || process.env.TEST_BASE_URL || 'http://localhost:5173';
const CITY = opts.city || process.env.TEST_CITY || 'SAN FRANCISCO';
const BATCH_SIZE = Number(opts.batchSize || 10);
const LOG_DIR = path.resolve(process.cwd(), 'logs');
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_PATH = path.join(LOG_DIR, `frontend-hydration-${ts}.log`);

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(msg: string, data?: any) {
  const line = `[${new Date().toISOString()}] ${msg}` + (data ? ` ${JSON.stringify(data)}` : '');
  console.log(line);
  fs.appendFileSync(LOG_PATH, line + '\n');
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

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

async function getUserPrefs() {
  const profile = await getJson<any>(`${BASE}/api/profile`);
  const interests = await getJson<any>(`${BASE}/api/user_interests`);
  const vibes = await getJson<any>(`${BASE}/api/user_vibes`);
  return {
    city: profile?.city || CITY,
    interests: Array.isArray(interests) ? interests.map((x: any) => x.interest) : [],
    vibes: Array.isArray(vibes) ? vibes.map((x: any) => x.vibe) : [],
  };
}

async function main() {
  log('Starting frontend hydration test', { BASE });
  const start = Date.now();

  const prefs = await getUserPrefs();
  log('Using prefs', prefs);

  // Kick off discovery
  const kickT0 = Date.now();
  const kickRes = await getJson<any>(`${BASE}/api/discover-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city: prefs.city, interests: prefs.interests, vibes: prefs.vibes })
  });
  log('Discovery kicked', { timeMs: Date.now() - kickT0, responseKeys: Object.keys(kickRes || {}) });

  // Track progress phases
  const phaseStart = new Map<string, number>();
  const phaseDurations: Record<string, number> = {};
  let lastStep = '';

  let tFirstEvent = -1;
  let tFirstBatch = -1;
  let firstBatchTitles: string[] = [];

  const deadline = Date.now() + 5 * 60_000; // 5 minutes cap
  while (Date.now() < deadline) {
    // Progress polling
    const progress = await getJson<Progress>(`${BASE}/api/discovery-progress`);
    if (progress?.step && progress.step !== lastStep) {
      const now = Date.now();
      if (!phaseStart.has(progress.step)) phaseStart.set(progress.step, now);
      if (lastStep) phaseDurations[lastStep] = now - (phaseStart.get(lastStep) || now);
      lastStep = progress.step;
      log('Phase change', { step: progress.step, counts: progress.counts });
    }

    // Events polling
    const eventsRes = await getJson<{ events?: EventItem[]; total?: number; } | EventItem[]>(`${BASE}/api/events`);
    const events: EventItem[] = Array.isArray(eventsRes) ? eventsRes : (eventsRes?.events || []);

    const filtered = filterThisWeek(events);
    const uiReady = filtered.length > 0;
    if (uiReady && tFirstEvent < 0) {
      tFirstEvent = Date.now() - start;
      log('UI condition met: first event ready', { tFirstEventMs: tFirstEvent, filteredCount: filtered.length });
    }
    if (uiReady && filtered.length >= BATCH_SIZE && tFirstBatch < 0) {
      tFirstBatch = Date.now() - start;
      firstBatchTitles = filtered.slice(0, BATCH_SIZE).map(e => e.title);
      log('UI condition met: first batch ready', { tFirstBatchMs: tFirstBatch, count: filtered.length, sample: firstBatchTitles.slice(0,5) });
      break;
    }

    await sleep(1000);
  }

  // Close out the current phase
  if (lastStep) {
    phaseDurations[lastStep] = Date.now() - (phaseStart.get(lastStep) || Date.now());
  }

  // Final event snapshot
  const finalEventsRes = await getJson<{ events?: EventItem[] } | EventItem[]>(`${BASE}/api/events`);
  const finalEvents: EventItem[] = Array.isArray(finalEventsRes) ? finalEventsRes : (finalEventsRes?.events || []);

  log('RESULT SUMMARY', {
    tFirstEventMs: tFirstEvent,
    tFirstBatchMs: tFirstBatch,
    phasesMs: phaseDurations,
    finalCount: finalEvents.length,
    firstBatchTitles: firstBatchTitles.slice(0, 10)
  });

  console.log(`\nLog written to: ${LOG_PATH}`);
}

main().catch(err => {
  log('Test failed', { error: String(err) });
  process.exit(1);
});



