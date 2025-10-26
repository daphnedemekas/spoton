import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import * as cheerio from "cheerio";
import Database from "better-sqlite3";
import fs from "fs";

// Logging utilities
const logDir = path.resolve(process.cwd(), "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logToFile = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;
  fs.appendFileSync(path.join(logDir, "discovery.log"), logLine);
  console.log(message, data);
};

// HTML entity decoding and normalization helpers
const htmlEntityMap: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
};
function decodeHtmlEntities(input?: string): string {
  if (!input) return '';
  let s = input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, p1) => {
    if (p1[0] === '#') {
      // numeric entity
      const hex = p1[1] === 'x' || p1[1] === 'X';
      const code = parseInt(hex ? p1.slice(2) : p1.slice(1), hex ? 16 : 10);
      if (!isNaN(code)) {
        try { return String.fromCharCode(code); } catch { return m; }
      }
      return m;
    }
    return htmlEntityMap[`&${p1};`] ?? m;
  });
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}
function normalizeLocation(loc: string, city: string): string {
  const l = (loc || '').trim();
  if (!l) return city;
  const dl = l.toLowerCase();
  const hasCity = dl.includes('san francisco') || dl.includes('oakland') || dl.includes('online');
  if (!hasCity) {
    // Prepend/replace with city if missing clear city marker
    return city;
  }
  return l;
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // Load env so server middleware can access OPENAI_API_KEY, etc.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [k, v] of Object.entries(env)) {
    if (!(k in process.env)) process.env[k] = v as string;
  }

  return {
  server: {
    host: "::",
    port: 8080,
  },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      // Simple API routes for local development
      {
        name: "local-api",
        configureServer(server) {
          // SQLite init - persistent shared database for events
          const dataDir = path.resolve(process.cwd(), ".data");
          if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
          const db = new Database(path.join(dataDir, "spoton-events.db"));
          db.exec(`
            CREATE TABLE IF NOT EXISTS profiles (
              id TEXT PRIMARY KEY,
              email TEXT,
              first_name TEXT,
              last_name TEXT,
              city TEXT,
              profile_picture_url TEXT
            );
            CREATE TABLE IF NOT EXISTS user_interests (
              user_id TEXT,
              interest TEXT,
              is_custom INTEGER
            );
            CREATE TABLE IF NOT EXISTS user_vibes (
              user_id TEXT,
              vibe TEXT,
              is_custom INTEGER
            );
            CREATE TABLE IF NOT EXISTS email_preferences (
              user_id TEXT PRIMARY KEY,
              frequency TEXT
            );
            CREATE TABLE IF NOT EXISTS events (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              description TEXT,
              date TEXT NOT NULL,
              time TEXT,
              location TEXT,
              event_link TEXT NOT NULL,
              image_url TEXT,
              interests TEXT,
              vibes TEXT,
              created_at INTEGER DEFAULT (strftime('%s', 'now'))
            );
            CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
            CREATE INDEX IF NOT EXISTS idx_events_location ON events(location);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_events_unique ON events(title, date, location);
          `);
          // Round-robin discovery state per city+interests signature
          db.exec(`
            CREATE TABLE IF NOT EXISTS discovery_state (
              key TEXT PRIMARY KEY,
              offset INTEGER DEFAULT 0
            );
          `);

          // Best-effort migration: add canonical_key and unique index for case-insensitive dedupe
          try { db.exec(`ALTER TABLE events ADD COLUMN canonical_key TEXT`); } catch {}
          try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_events_canonical ON events(canonical_key)`); } catch {}

          // Discovery progress (in-memory, reset per server run)
          let lastDiscoveryProgress: any = {
            step: 'idle',
            startedAt: 0,
            city: '',
            interests: [],
            vibes: [],
            sites: [],
            counts: { braveSites: 0, eventLinks: 0, candidatePages: 0, extractedEvents: 0 },
          };

          // --- OpenAI call utilities: global pacing, retries, caching, single-flight, and logging ---
            const openAIState = {
            lastCallTs: 0,
            minIntervalMs: 2000, // 30 RPM - balanced approach
            cooldownUntil: 0,
          } as { lastCallTs: number; minIntervalMs: number; cooldownUntil: number };
          const openAICache = new Map<string, { expiresAt: number; value: any }>();
          const openAIInFlight = new Map<string, Promise<any>>();
          const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5';
          
          // Event discovery cache to reduce API calls
          const discoveryCache = new Map<string, { expiresAt: number; events: any[] }>();

          async function sleep(ms: number) {
            return new Promise((r) => setTimeout(r, ms));
          }

          async function rateLimitGate() {
            if (Date.now() < openAIState.cooldownUntil) {
              const waitMs = openAIState.cooldownUntil - Date.now();
              console.log(`[openai][cooldown] waiting ${waitMs}ms`);
              await sleep(waitMs);
            }
            const nowTs = Date.now();
            const delta = nowTs - openAIState.lastCallTs;
            if (delta < openAIState.minIntervalMs) {
              await sleep(openAIState.minIntervalMs - delta);
            }
            openAIState.lastCallTs = Date.now();
          }

          async function callOpenAIWithBackoff(payload: any, label: string, cacheTtlMs = 10 * 60 * 1000) {
            const key = JSON.stringify({ endpoint: 'chat.completions', payload });
            const cached = openAICache.get(key);
            const now = Date.now();
            if (cached && cached.expiresAt > now) {
              console.log(`[openai][cache-hit] ${label}`);
              return cached.value;
            }
            const existing = openAIInFlight.get(key);
            if (existing) {
              console.log(`[openai][single-flight] ${label}`);
              return existing;
            }

            const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
            if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');

            const run = (async () => {
              const maxRetries = 1; // Single retry for speed
              let attempt = 0;
              let lastErr: any;
              while (attempt <= maxRetries) {
                try {
                  await rateLimitGate();
                  const userMsg = payload?.messages?.find((m: any) => m.role === 'user');
                  const userPreview = typeof userMsg?.content === 'string' ? userMsg.content.slice(0, 1200) : '[non-string]';
                  logToFile(`[OPENAI] Request: ${label}`, { model: payload?.model, tokens_approx: userPreview.length, prompt: userPreview, fullPayload: payload });
                  const res = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${OPENAI_API_KEY}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                  });
                  if (res.status === 429 || res.status >= 500) {
                    lastErr = new Error(`OpenAI ${res.status}`);
                    const backoffMs = Math.min(8000, 1000 * Math.pow(2, attempt));
                    console.log(`[openai][backoff] ${label} attempt=${attempt} status=${res.status} sleep=${backoffMs}ms`);
                    if (res.status === 429) {
                      openAIState.cooldownUntil = Date.now() + 300_000; // 5min cooldown for 429
                    }
                    await sleep(backoffMs);
                    attempt++;
                    continue;
                  }
                  if (!res.ok) {
                    const txt = await res.text();
                    throw new Error(`OpenAI error ${res.status}: ${txt.slice(0, 400)}`);
                  }
                  const data = await res.json();
                  const content: string | undefined = data?.choices?.[0]?.message?.content;
                  logToFile(`[OPENAI] Response: ${label}`, { status: 'ok', content: content, fullResponse: data });
                  openAICache.set(key, { expiresAt: now + cacheTtlMs, value: data });
                  return data;
                } catch (err: any) {
                  lastErr = err;
                  console.log(`[openai][error] ${label} attempt=${attempt} err=${err?.message || err}`);
                  if (attempt >= maxRetries) break;
                  const backoffMs = Math.min(8000, 1000 * Math.pow(2, attempt));
                  await sleep(backoffMs);
                  attempt++;
                }
              }
              throw lastErr || new Error('OpenAI request failed');
            })();

            openAIInFlight.set(key, run);
            try {
              const out = await run;
              return out;
            } finally {
              openAIInFlight.delete(key);
            }
          }

          server.middlewares.use(async (req, res, next) => {
            if (!req.url) return next();
            if (req.url === "/api/loading-messages" && req.method === "GET") {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ messages: [
                "Finding your perfect events...",
                "Discovering amazing experiences...",
                "Curating events just for you...",
              ] }));
              return;
            }

            // Discovery progress endpoint
            if (req.url === "/api/discovery-progress" && req.method === "GET") {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(lastDiscoveryProgress));
              return;
            }

            // Profile APIs (SQLite-backed)
            if (req.url.startsWith("/api/profile") && req.method === "GET") {
              const url = new URL(req.url, "http://localhost");
              const userId = url.searchParams.get("userId") || "";
              const row = db.prepare("SELECT * FROM profiles WHERE id = ?").get(userId);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(row || null));
              return;
            }
            if (req.url === "/api/profile" && req.method === "POST") {
              const chunks: Buffer[] = [];
              await new Promise<void>((resolve) => {
                req.on("data", (c) => chunks.push(c));
                req.on("end", () => resolve());
              });
              const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
              db.prepare(`INSERT INTO profiles (id,email,first_name,last_name,city,profile_picture_url)
                VALUES (@id,@email,@first_name,@last_name,@city,@profile_picture_url)
                ON CONFLICT(id) DO UPDATE SET email=excluded.email, first_name=excluded.first_name, last_name=excluded.last_name, city=excluded.city, profile_picture_url=excluded.profile_picture_url
              `).run(body);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
              return;
            }

            if (req.url.startsWith("/api/user_interests") && req.method === "GET") {
              const url = new URL(req.url, "http://localhost");
              const userId = url.searchParams.get("userId") || "";
              const rows = db.prepare("SELECT interest, is_custom FROM user_interests WHERE user_id = ?").all(userId)
                .map((r: any) => ({ interest: r.interest, is_custom: !!r.is_custom }));
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(rows));
              return;
            }
            if (req.url === "/api/user_interests" && req.method === "POST") {
              const chunks: Buffer[] = [];
              await new Promise<void>((resolve) => {
                req.on("data", (c) => chunks.push(c));
                req.on("end", () => resolve());
              });
              const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
              db.prepare("INSERT INTO user_interests (user_id, interest, is_custom) VALUES (@user_id, @interest, @is_custom)")
                .run({ ...body, is_custom: body.is_custom ? 1 : 0 });
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
              return;
            }

            if (req.url.startsWith("/api/user_vibes") && req.method === "GET") {
              const url = new URL(req.url, "http://localhost");
              const userId = url.searchParams.get("userId") || "";
              const rows = db.prepare("SELECT vibe, is_custom FROM user_vibes WHERE user_id = ?").all(userId)
                .map((r: any) => ({ vibe: r.vibe, is_custom: !!r.is_custom }));
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(rows));
              return;
            }
            if (req.url === "/api/user_vibes" && req.method === "POST") {
              const chunks: Buffer[] = [];
              await new Promise<void>((resolve) => {
                req.on("data", (c) => chunks.push(c));
                req.on("end", () => resolve());
              });
              const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
              db.prepare("INSERT INTO user_vibes (user_id, vibe, is_custom) VALUES (@user_id, @vibe, @is_custom)")
                .run({ ...body, is_custom: body.is_custom ? 1 : 0 });
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
              return;
            }

            if (req.url.startsWith("/api/email_preferences") && req.method === "GET") {
              const url = new URL(req.url, "http://localhost");
              const userId = url.searchParams.get("userId") || "";
              const row = db.prepare("SELECT user_id, frequency FROM email_preferences WHERE user_id = ?").get(userId);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(row || null));
              return;
            }
            if (req.url === "/api/email_preferences" && req.method === "POST") {
              const chunks: Buffer[] = [];
              await new Promise<void>((resolve) => {
                req.on("data", (c) => chunks.push(c));
                req.on("end", () => resolve());
              });
              const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
              db.prepare(`INSERT INTO email_preferences (user_id, frequency) VALUES (@user_id, @frequency)
                ON CONFLICT(user_id) DO UPDATE SET frequency=excluded.frequency
              `).run(body);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
              return;
            }

            // Events API - shared persistent storage
            if (req.url.startsWith("/api/events") && req.method === "GET") {
              const url = new URL(req.url, "http://localhost");
              const city = url.searchParams.get("city") || "";
              const limit = parseInt(url.searchParams.get("limit") || "100");
              
              let query = "SELECT * FROM events WHERE date >= date('now')";
              const params: any = {};
              
              if (city) {
                query += " AND (location LIKE @city OR location = 'Online')";
                params.city = `%${city}%`;
              }
              
              query += " ORDER BY date ASC LIMIT @limit";
              params.limit = limit;
              
              const rows = db.prepare(query).all(params);
              const events = rows.map((row: any) => ({
                ...row,
                interests: row.interests ? JSON.parse(row.interests) : [],
                vibes: row.vibes ? JSON.parse(row.vibes) : []
              }));
              
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(events));
              return;
            }
            
            if (req.url === "/api/events" && req.method === "POST") {
              const chunks: Buffer[] = [];
              await new Promise<void>((resolve) => {
                req.on("data", (c) => chunks.push(c));
                req.on("end", () => resolve());
              });
              const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
              const events = Array.isArray(body) ? body : [body];
              
              let inserted = 0;
              let skipped = 0;
              
              for (const event of events) {
                try {
                  const canonical_key = `${(event.title||'').toLowerCase()}|${(event.date||'').slice(0,10)}|${(event.location||'').toLowerCase()}`;
                  db.prepare(`INSERT OR IGNORE INTO events 
                    (id, title, description, date, time, location, event_link, image_url, interests, vibes, canonical_key)
                    VALUES (@id, @title, @description, @date, @time, @location, @event_link, @image_url, @interests, @vibes, @canonical_key)
                  `).run({
                    id: event.id || crypto.randomUUID(),
                    title: event.title,
                    description: event.description || '',
                    date: event.date,
                    time: event.time || 'See website',
                    location: event.location,
                    event_link: event.event_link,
                    image_url: event.image_url || null,
                    interests: JSON.stringify(event.interests || []),
                    vibes: JSON.stringify(event.vibes || []),
                    canonical_key
                  });
                  inserted++;
                } catch (e) {
                  skipped++;
                }
              }
              
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ inserted, skipped, total: events.length }));
              return;
            }

            if (req.url === "/api/events/clear" && req.method === "POST") {
              db.exec("DELETE FROM events;");
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
              return;
            }

            if (req.url === "/api/discover-events" && req.method === "POST") {
              try {
                const startTime = Date.now();
                logToFile('[DISCOVERY] Request received');
                const chunks: Buffer[] = [];
                await new Promise<void>((resolve) => {
                  req.on("data", (c) => chunks.push(c));
                  req.on("end", () => resolve());
                });
                const bodyRaw = Buffer.concat(chunks).toString("utf8");
                const body = bodyRaw ? JSON.parse(bodyRaw) : {};
                logToFile('[DISCOVERY] Request parsing', { time: Date.now() - startTime });

                const city = String(body.city || "San Francisco");
                const interests: string[] = Array.isArray(body.interests) ? body.interests : [];
                const vibes: string[] = Array.isArray(body.vibes) ? body.vibes : [];
                logToFile('[DISCOVERY] Request params', { city, interests, vibes, body });
                // init progress
                lastDiscoveryProgress = {
                  step: 'start',
                  startedAt: Date.now(),
                  city,
                  interests,
                  vibes,
                  sites: [],
                  counts: { braveSites: 0, eventLinks: 0, candidatePages: 0, extractedEvents: 0 },
                };
                
                // Check cache first (cache for 10 minutes)
                const cacheKey = `${city}-${interests.join(',')}-${vibes.join(',')}`;
                const cached = discoveryCache.get(cacheKey);
                if (cached && cached.expiresAt > Date.now()) {
                  logToFile('[DISCOVERY] Returning cached results', { eventCount: cached.events.length });
                  res.statusCode = 200;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ events: cached.events.slice(0, body.limit || 20), scrapingStatus: [{ meta: 'cached', count: cached.events.length }] }));
                  return;
                }
                // Optimized configuration for maximum events with good quality
                const batchLimit: number = Math.min(Math.max(Number(body.limit) || 50, 6), 60);
                const sitesLimit: number = Math.min(Math.max(Number(body.sitesLimit) || 15, 3), 30);
                const resultsPerQuery: number = Math.min(Math.max(Number(body.resultsPerQuery) || 7, 1), 10);
                const interestsLimit: number = Math.min(Math.max(Number(body.interestsLimit) || 4, 1), 6);
                const skipRanking: boolean = !!body.skipRanking;
                const timeoutMs: number = Math.min(Math.max(Number(body.timeoutMs) || 120000, 15000), 180000);
                const startTs = Date.now();
                let responded = false;
                const EARLY_MIN_EVENTS = 10;
                function saveEventsToDb(eventsArr: any[]) {
                  try {
                    for (const event of eventsArr) {
                      db.prepare(`INSERT OR IGNORE INTO events 
                        (id, title, description, date, time, location, event_link, image_url, interests, vibes)
                        VALUES (@id, @title, @description, @date, @time, @location, @event_link, @image_url, @interests, @vibes)
                      `).run({
                        id: crypto.randomUUID(),
                        title: event.title,
                        description: event.description || '',
                        date: event.date,
                        time: event.time || 'See website',
                        location: event.location,
                        event_link: event.event_link,
                        image_url: event.image_url || null,
                        interests: JSON.stringify(event.interests || []),
                        vibes: JSON.stringify(event.vibes || [])
                      });
                    }
                  } catch {}
                }
                console.log('[discover-events] Batch limit:', batchLimit, 'sitesLimit:', sitesLimit, 'resultsPerQuery:', resultsPerQuery, 'skipRanking:', skipRanking, 'timeoutMs:', timeoutMs);

                const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
                const BRAVE_API_KEY = 'BSAWwQU-MKtZyW9GkCIekHaoLfFbiNI';

                if (!OPENAI_API_KEY) {
                  logToFile('[DISCOVERY] ERROR: Missing OpenAI API key');
                  res.statusCode = 200;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ events: [], scrapingStatus: [] }));
                  return;
                }

                const now = new Date();
                const today = now.toISOString().split('T')[0];
                const searchInterests = interests.length > 0 ? interests : ['music', 'food', 'tech'];

                // Helper: rotate array by offset
                const rotateArray = (arr: string[], offset: number) => {
                  if (arr.length === 0) return arr;
                  const k = ((offset % arr.length) + arr.length) % arr.length;
                  return arr.slice(k).concat(arr.slice(0, k));
                };

                // Round-robin selection of interests across runs
                let selectedInterests = searchInterests;
                let rotationKey = '';
                try {
                  if (searchInterests.length > 0) {
                    const canonical = Array.from(new Set(searchInterests.map((s: string) => (s||'').toLowerCase()))).sort().join(',');
                    rotationKey = `${city}|${canonical}`;
                    const row = db.prepare("SELECT offset FROM discovery_state WHERE key = ?").get(rotationKey) as any;
                    const currentOffset = Number(row?.offset || 0);
                    const rotated = rotateArray(searchInterests, currentOffset);
                    selectedInterests = rotated;
                    // Store next offset (increment by interestsLimit, will be saved later after queries)
                    (lastDiscoveryProgress as any).nextOffset = (currentOffset + interestsLimit) % searchInterests.length;
                  }
                } catch {}
                
                // Generate next 7 days
                const searchDays = Array.from({ length: 7 }, (_, i) => {
                  const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
                  return {
                    date: date.toISOString().split('T')[0],
                    dayName: date.toLocaleDateString('en-US', { weekday: 'long' }),
                    monthDay: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  };
                });
                
                // Step 1: Use Brave Search to find event websites
                const braveStart = Date.now();
                logToFile('[DISCOVERY] Step 1: Brave Search', { searchInterests });
                const braveWebsites: any[] = [];
                const seenUrls = new Set<string>();
                let queryCount = 0;
                
                for (const interest of selectedInterests.slice(0, interestsLimit)) {
                  // Multiple query styles for each interest
                  const queryStyles = [
                    `${interest} events ${city} ${searchDays[0].monthDay}`,
                    `${interest} ${city} this week`,
                    `upcoming ${interest} ${city} calendar`,
                    `${city} ${interest} schedule ${searchDays[0].dayName}`
                  ];
                  
                  for (const searchQuery of queryStyles.slice(0, 2)) {
                    if (Date.now() - startTs > timeoutMs) { console.log('[discover-events] Brave search time budget exceeded'); break; }
                    try {
                      // Rate limit: 1 req/sec
                      if (queryCount > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1100));
                      }
                      queryCount++;
                      
                      logToFile('[DISCOVERY] Brave query', { searchQuery, interest });
                      
                      const braveResponse = await fetch(
                        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchQuery)}&count=${resultsPerQuery}`,
                        {
                          headers: {
                            'Accept': 'application/json',
                            'X-Subscription-Token': BRAVE_API_KEY
                          }
                        }
                      );

                      if (braveResponse.ok) {
                        const braveData = await braveResponse.json();
                        const results = braveData.web?.results || [];
                        logToFile('[DISCOVERY] Brave response', { query: searchQuery, resultsCount: results.length, results: results.map((r: any) => ({ url: r.url, title: r.title })) });
                        
                        for (const result of results) {
                          if (result.url && !result.url.includes('meetup.com') && !seenUrls.has(result.url)) {
                            seenUrls.add(result.url);
                            braveWebsites.push({
                              url: result.url,
                              source: result.title?.substring(0, 50) || 'Event Site',
                              interest: interest
                            });
                          }
                        }
                      } else {
                        const errorText = await braveResponse.text();
                        console.log('[discover-events] Brave API error:', braveResponse.status, errorText.substring(0, 200));
                      }
                    } catch (error) {
                      console.log('[discover-events] Brave search failed:', error);
                    }
                  }
                }
                
                logToFile('[DISCOVERY] Brave websites collected', { count: braveWebsites.length, websites: braveWebsites, time: Date.now() - braveStart });
                lastDiscoveryProgress.step = 'search';
                lastDiscoveryProgress.sites = braveWebsites.slice(0, sitesLimit).map(w => ({ url: w.url, source: w.source, interest: w.interest, status: 'pending' }));
                lastDiscoveryProgress.counts.braveSites = braveWebsites.length;
                (lastDiscoveryProgress as any).selectedInterests = selectedInterests.slice(0, interestsLimit);

                // Step 2: Find event links from listing pages
                const eventLinks: Set<string> = new Set();
                const scrapingStatus: any[] = [];
                
                const scrapingStart = Date.now();
                logToFile('[DISCOVERY] Step 2: Finding event links', { sitesToScrape: sitesLimit });
                for (const website of braveWebsites.slice(0, sitesLimit)) {
                  try {
                    if (Date.now() - startTs > timeoutMs) { logToFile('[DISCOVERY] Listings scrape timeout'); break; }
                    logToFile('[DISCOVERY] Scraping listing page', { url: website.url, source: website.source });
                    const response = await fetch(website.url, {
                      headers: { 'User-Agent': 'Mozilla/5.0' },
                      signal: AbortSignal.timeout(12000)
                    });
                    
                    if (response.ok) {
                      const html = await response.text();
                      const $ = cheerio.load(html);
                      const baseUrl = new URL(website.url);
                      
                      // Find all links that look like SPECIFIC events (with dates, IDs, etc.)
                      $('a').each((_, elem) => {
                        const href = $(elem).attr('href');
                        if (!href) return;
                        
                        let fullUrl = href;
                        if (!href.startsWith('http')) {
                          try {
                            fullUrl = new URL(href, baseUrl.origin).href;
                          } catch (e) {
                            return;
                          }
                        }
                        
                        const lowerUrl = fullUrl.toLowerCase();
                        const pathDepth = fullUrl.split('/').filter(p => p).length;
                        
                        // Look for URLs that indicate SPECIFIC events:
                        // - Contains date patterns (2025, 10-22, etc.)
                        // - Contains event IDs (long numbers)
                        // - Deep paths (4+ segments)
                        // - Has /e/, /event/, /show/, /concert/ followed by something specific
                        const hasDatePattern = /\/(202[5-9]|20[3-9]\d)[-\/]?\d{1,2}[-\/]?\d{1,2}/.test(lowerUrl) ||
                                              /[-\/](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/.test(lowerUrl);
                        const hasEventId = /\/\d{8,}/.test(lowerUrl) || /\/e\/[\w-]{10,}/.test(lowerUrl);
                        const hasSpecificKeyword = /\/(event|show|concert|festival|e)\/[\w-]{3,}/.test(lowerUrl);
                        
                        if (
                          (pathDepth >= 4 || hasDatePattern || hasEventId) &&
                          (hasSpecificKeyword || hasDatePattern || hasEventId) &&
                          !lowerUrl.includes('example.com') &&
                          !lowerUrl.includes('/search') &&
                          !lowerUrl.includes('/calendar') &&
                          !lowerUrl.includes('/events?') &&
                          !lowerUrl.includes('/browse') &&
                          !lowerUrl.includes('/category') &&
                          !lowerUrl.includes('/organizer') &&
                          !lowerUrl.includes('/features') &&
                          !lowerUrl.includes('/pricing') &&
                          !lowerUrl.includes('/blog') &&
                          !lowerUrl.includes('/help') &&
                          !lowerUrl.includes('/about') &&
                          !lowerUrl.includes('/company') &&
                          !lowerUrl.includes('/tickets/') && // Avoid pages like /tickets/artist-name/
                          !lowerUrl.includes('linkedin.com') &&
                          !lowerUrl.includes('facebook.com') &&
                          !lowerUrl.endsWith('/events') &&
                          !lowerUrl.endsWith('/events/') &&
                          !lowerUrl.endsWith('/music') &&
                          !lowerUrl.endsWith('/music/') &&
                          !lowerUrl.match(/\/(california|texas|florida|new-york|san-francisco)$/i) &&
                          eventLinks.size < 60
                        ) {
                          eventLinks.add(fullUrl);
                        }
                      });
                      
                      scrapingStatus.push({ url: website.url, source: website.source, interest: website.interest, status: 'success' });
                      // progress update
                      const entry = lastDiscoveryProgress.sites.find((s: any) => s.url === website.url);
                      if (entry) entry.status = 'success';
                      lastDiscoveryProgress.counts.eventLinks = eventLinks.size;
                    }
                  } catch (error) {
                    console.log('[discover-events] Failed to scrape', website.url);
                    scrapingStatus.push({ url: website.url, source: website.source, interest: website.interest, status: 'failed' });
                    const entry = lastDiscoveryProgress.sites.find((s: any) => s.url === website.url);
                    if (entry) entry.status = 'failed';
                  }
                }
                
                logToFile('[DISCOVERY] Event links found', { count: eventLinks.size, links: Array.from(eventLinks), time: Date.now() - scrapingStart });
                lastDiscoveryProgress.step = 'listings';
                lastDiscoveryProgress.counts.eventLinks = eventLinks.size;
                  if (eventLinks.size === 0) {
                    console.log('[discover-events] No event links found; loosening filters slightly');
                    for (const website of braveWebsites.slice(0, sitesLimit)) {
                      try {
                        const response = await fetch(website.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12000) });
                        if (!response.ok) continue;
                        const html = await response.text();
                        const $ = cheerio.load(html);
                        const baseUrl = new URL(website.url);
                        $('a').each((_, elem) => {
                          const href = $(elem).attr('href');
                          if (!href) return;
                          let fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl.origin).href;
                          const lowerUrl = fullUrl.toLowerCase();
                          if (lowerUrl.includes('/event') && !lowerUrl.includes('/organizer') && !lowerUrl.includes('/features')) {
                            eventLinks.add(fullUrl);
                          }
                        });
                      } catch {}
                    }
                    console.log('[discover-events] After loosening filters, links:', eventLinks.size);
                  }
                
                // Step 3: Scrape individual event pages
                const extractedEvents: any[] = [];
                const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                
                const eventScrapingStart = Date.now();
                logToFile('[DISCOVERY] Step 3: Scraping individual event pages', { linksToScrape: Math.min(batchLimit, eventLinks.size) });
                const candidatePages: any[] = [];
                
                // First pass: scrape pages and collect candidates (limited concurrency)
                {
                  const linksArr = Array.from(eventLinks).slice(0, batchLimit);
                  const concurrency = 4;
                  for (let i = 0; i < linksArr.length; i += concurrency) {
                    if (Date.now() - startTs > timeoutMs) { console.log('[discover-events] Event page scrape time budget exceeded'); break; }
                    const chunk = linksArr.slice(i, i + concurrency);
                    await Promise.all(chunk.map(async (link) => {
                      try {
                        const response = await fetch(link, {
                          headers: { 'User-Agent': 'Mozilla/5.0' },
                          signal: AbortSignal.timeout(8000)
                        });
                        if (!response.ok) return;
                        const html = await response.text();
                        const $ = cheerio.load(html);
                        // Try JSON-LD first
                        let found = false;
                        $('script[type="application/ld+json"]').each((_, elem) => {
                          try {
                            const jsonText = $(elem).html();
                            if (!jsonText) return;
                            const data = JSON.parse(jsonText);
                            const events = Array.isArray(data) ? data : [data];
                            for (const item of events) {
                              if (item['@type'] === 'Event' && item.startDate) {
                                const startDate = new Date(item.startDate);
                                const dateStr = startDate.toISOString().split('T')[0];
                                const hours = startDate.getHours() % 12 || 12;
                                const minutes = String(startDate.getMinutes()).padStart(2, '0');
                                const ampm = startDate.getHours() >= 12 ? 'PM' : 'AM';
                                const timeStr = `${hours}:${minutes} ${ampm}`;
                                extractedEvents.push({
                                  title: decodeHtmlEntities(item.name || ''),
                                  description: decodeHtmlEntities(item.description || ''),
                                  date: dateStr,
                                  time: timeStr,
                                  location: normalizeLocation(decodeHtmlEntities(item.location?.name || item.location?.address?.addressLocality || city), city),
                                  event_link: item.url || link,
                                  image_url: Array.isArray(item.image) ? item.image[0] : item.image,
                                  interests: interests.length > 0 ? [interests[0]] : ['General'],
                                  vibes: vibes.length > 0 ? [vibes[0]] : ['Fun']
                                });
                                found = true;
                              }
                            }
                          } catch {}
                        });
                        if (!found) {
                          const title = decodeHtmlEntities($('h1').first().text().trim() || $('[class*="title"]').first().text().trim());
                          const description = decodeHtmlEntities($('meta[name="description"]').attr('content') || $('[class*="description"]').first().text().trim().substring(0, 300));
                          if (title && title.length > 3) {
                            candidatePages.push({ url: link, title, description: description || '' });
                          }
                        }
                      } catch {}
                    }));
                  }
                }
                
                // Second pass: Ask LLM to validate candidates (limit to 3 for speed)
                if (candidatePages.length > 0) {
                  const pagesToValidate = candidatePages.slice(0, 3); // Limit to 3 pages for speed
                  logToFile('[DISCOVERY] Validating candidates with LLM', { count: pagesToValidate.length });
                  try {
                    const validationResponse = await callOpenAIWithBackoff({
                      model: OPENAI_MODEL,
                      messages: [
                        {
                          role: 'system',
                          content: `You extract specific events from web pages. Today is ${today}. User city: ${city}.

GOAL: Return individual event cards, NOT listing pages.

Rules:
- If a page describes ONE specific event → extract that event
- If a page lists MULTIPLE events (like a calendar) → extract EACH event separately
- Event descriptions should describe what happens at THIS EVENT (e.g. "Live jazz performance featuring..." NOT "Check out our calendar of events")
- Only include events in San Francisco or explicitly online
- Dates must be YYYY-MM-DD format`
                        },
                        {
                          role: 'user',
                          content: `Extract specific events from these pages. For each page, return an array of events (even if just 1 event). Cap total to ${skipRanking ? 6 : 20} events.

${pagesToValidate.map(p => `URL: ${p.url}\nTitle: ${p.title}\nDescription: ${p.description}`).join('\n\n')}

For each event return:
- title: Name of the specific event (e.g. "Kaytranada Live at Oakland Arena" not "Kaytranada Schedule")
- description: 1-2 sentences about what attendees will experience at THIS event
- date: YYYY-MM-DD
- time: e.g. "7:00 PM" or "See website"
- location: "San Francisco" or "Oakland" or "Online" + venue name
- event_link: The URL (prefer the input URL unless a more specific link exists)

Return JSON: {"validations": [{"url": "...", "isEvent": true/false, "events": [{"title":"...","description":"...","date":"YYYY-MM-DD","time":"...","location":"...","event_link":"..."}]}]}`
                        }
                      ],
                      response_format: { type: "json_object" },
                      temperature: 0.4,
                    }, 'validate-candidates');
                    
                    try {
                      const data = validationResponse; // already JSON from callOpenAIWithBackoff
                      const content = data.choices?.[0]?.message?.content;
                      const parsed = JSON.parse(content || '{}');

                      let added = 0;
                      let skipped = 0;
                      console.log('[discover-events] Processing', (parsed.validations || []).length, 'validation results');
                      for (const v of (parsed.validations || [])) {
                        console.log('[discover-events] Validation:', v.url, 'isEvent:', v.isEvent, 'events count:', Array.isArray(v.events) ? v.events.length : 0);
                        if (!v?.isEvent) {
                          skipped++;
                          continue;
                        }
                        const eventsArr = Array.isArray(v.events) ? v.events : [];
                        for (const ev of eventsArr) {
                          // Strict city filter
                          const loc = (ev.location || '').toLowerCase();
                          const isOnline = loc.includes('online') || loc.includes('virtual');
                          const inCity = loc.includes('san francisco') || loc.includes('oakland');
                          console.log('[discover-events] Event check:', ev.title, 'loc:', ev.location, 'inCity:', inCity, 'isOnline:', isOnline, 'hasDate:', !!ev.date, 'hasLink:', !!ev.event_link);
                          if (!isOnline && !inCity) {
                            console.log('[discover-events] Skipped: not in SF/Oakland/Online');
                            skipped++;
                            continue;
                          }
                          if (!ev.title || !ev.date || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date) || !ev.event_link) {
                            console.log('[discover-events] Skipped: missing required fields');
                            skipped++;
                            continue;
                          }
                          // Normalize & decode
                          extractedEvents.push({
                            title: decodeHtmlEntities(ev.title),
                            description: decodeHtmlEntities(ev.description || `Event in ${city}`),
                            date: ev.date,
                            time: ev.time || 'See website',
                            location: normalizeLocation(decodeHtmlEntities(ev.location || city), city),
                            event_link: ev.event_link,
                            interests: interests.length > 0 ? [interests[0]] : ['General'],
                            vibes: vibes.length > 0 ? [vibes[0]] : ['Fun']
                          });
                          added++;
                        }
                      }
                      console.log('[discover-events] LLM added', added, 'validated events, skipped', skipped);
                    } catch (e) {
                      console.log('[discover-events] LLM validation parse error, adding all candidates');
                      for (const candidate of pagesToValidate) {
                        extractedEvents.push({
                          title: candidate.title,
                          description: candidate.description || `Event in ${city}`,
                          date: tomorrow.toISOString().split('T')[0],
                          time: 'See website',
                          location: city,
                          event_link: candidate.url,
                          interests: interests.length > 0 ? [interests[0]] : ['General'],
                          vibes: vibes.length > 0 ? [vibes[0]] : ['Fun']
                        });
                      }
                    }
                  } catch (e) {
                    console.log('[discover-events] LLM validation error, adding all candidates');
                    // Add all candidates on error
                    for (const candidate of pagesToValidate) {
                      extractedEvents.push({
                        title: candidate.title,
                        description: candidate.description || `Event in ${city}`,
                        date: tomorrow.toISOString().split('T')[0],
                        time: 'See website',
                        location: city,
                        event_link: candidate.url,
                        interests: interests.length > 0 ? [interests[0]] : ['General'],
                        vibes: vibes.length > 0 ? [vibes[0]] : ['Fun']
                      });
                    }
                  }
                }
                
                logToFile('[DISCOVERY] Events extracted from pages', { count: extractedEvents.length, events: extractedEvents, time: Date.now() - eventScrapingStart });
                lastDiscoveryProgress.step = 'events';
                lastDiscoveryProgress.counts.candidatePages = candidatePages.length;
                lastDiscoveryProgress.counts.extractedEvents = extractedEvents.length;
                
                // Always use LLM for quality - no fast-path
                
                // Final safety: if validation produced 0 but we have candidates, surface them as basic events
                if (extractedEvents.length === 0 && candidatePages.length > 0) {
                  logToFile('[DISCOVERY] No validated events, surfacing candidates', { candidateCount: candidatePages.length, candidates: candidatePages });
                  for (const candidate of candidatePages) {
                    extractedEvents.push({
                      title: candidate.title,
                      description: candidate.description || `Event in ${city}`,
                      date: tomorrow.toISOString().split('T')[0],
                      time: 'See website',
                      location: city,
                      event_link: candidate.url,
                      interests: interests.length > 0 ? [interests[0]] : ['General'],
                      vibes: vibes.length > 0 ? [vibes[0]] : ['Fun']
                    });
                  }
                }
                scrapingStatus.push({ meta: 'counts', braveSites: braveWebsites.length, eventLinks: eventLinks.size, candidatePages: candidatePages.length, extractedEvents: extractedEvents.length });

                // If no structured data found, fall back to OpenAI extraction from HTML
                if (extractedEvents.length === 0) {
                  console.log('[discover-events] No JSON-LD found, using OpenAI to extract from HTML...');
                  
                  const scrapedData: any[] = [];
                  for (const website of braveWebsites.slice(0, 10)) {
                    try {
                      const response = await fetch(website.url, {
                        headers: { 'User-Agent': 'Mozilla/5.0' },
                        signal: AbortSignal.timeout(10000)
                      });
                      
                      if (response.ok) {
                        const html = await response.text();
                        scrapedData.push({
                          source: website.source,
                          interest: website.interest,
                          content: html.substring(0, 30000)
                        });
                      }
                    } catch (e) {
                      // Skip failed scrapes
                    }
                  }
                  
                  if (scrapedData.length === 0) {
                    res.statusCode = 200;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({ events: [], scrapingStatus }));
                    return;
                  }
                  
                  // Extract events with OpenAI
                  const extractionResponse = await callOpenAIWithBackoff({
                    model: OPENAI_MODEL,
                    messages: [
                      {
                        role: 'system',
                        content: `Extract upcoming events from HTML. Return events in ${city} in the next 7 days.`
                      },
                      {
                        role: 'user',
                        content: `HTML from event sites in ${city}:
${scrapedData.map((d, i) => `[${d.source}]\n${d.content.substring(0, 8000)}`).join('\n---\n')}

Extract 15-20 events. Return JSON with "events" array. Each event: title, description, date (YYYY-MM-DD), time (e.g. "7:00 PM"), location, event_link (full URL).`
                      }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.5,
                  }, 'extract-from-html');
                  
                  try {
                    const data = extractionResponse; // already JSON
                    const content = data.choices?.[0]?.message?.content;
                    const parsed = JSON.parse(content || '{}');
                    const extracted = (parsed.events || []).map((e: any) => ({
                      title: e.title,
                      description: e.description,
                      date: e.date,
                      time: e.time,
                      location: e.location,
                      event_link: e.event_link,
                      interests: interests.length > 0 ? [interests[0]] : ['General'],
                      vibes: vibes.length > 0 ? [vibes[0]] : ['Fun']
                    }));
                    extractedEvents.push(...extracted);
                    console.log('[discover-events] OpenAI extracted', extracted.length, 'events');
                  } catch (e) {
                    console.log('[discover-events] OpenAI extraction parse error; creating placeholders from', scrapedData.length, 'sites');
                    for (const site of scrapedData.slice(0, 15)) {
                      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                      extractedEvents.push({
                        title: `${site.interest.charAt(0).toUpperCase() + site.interest.slice(1)} Events - ${site.source}`,
                        description: `Check out upcoming ${site.interest} events in ${city}. Visit the link for details on dates, times, and tickets.`,
                        date: tomorrow.toISOString().split('T')[0],
                        time: 'See website',
                        location: city,
                        event_link: braveWebsites.find(w => w.source === site.source)?.url || '',
                        interests: interests.length > 0 ? [interests[0]] : [site.interest],
                        vibes: vibes.length > 0 ? [vibes[0]] : ['Fun']
                      });
                    }
                  }
                  
                  if (extractedEvents.length === 0) {
                    res.statusCode = 200;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({ events: [], scrapingStatus }));
                    return;
                  }
                }

                // Step 3: Smart LLM processing - single comprehensive call
                const llmStart = Date.now();
                logToFile('[DISCOVERY] Step 3: Smart LLM processing', { eventCount: extractedEvents.length });
                
                // If we have 100+ structured events, skip LLM ranking for efficiency
                if (extractedEvents.length >= 100) {
                  console.log('[discover-events] Found', extractedEvents.length, 'structured events - skipping LLM ranking');
                  const seen = new Set();
                  const dedupedEvents = extractedEvents.filter((event: any) => {
                    const key = `${(event.title || '').toLowerCase()}-${event.date}-${(event.location || '').toLowerCase()}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return event.title && event.date && event.event_link;
                  });
                  
                  dedupedEvents.sort((a: any, b: any) => {
                    const dateA = new Date(a.date);
                    const dateB = new Date(b.date);
                    return dateA.getTime() - dateB.getTime();
                  });
                  
                  const finalEvents = dedupedEvents.slice(0, 50);
                  logToFile('[DISCOVERY] Final events (no LLM ranking needed)', { count: finalEvents.length, events: finalEvents.slice(0, 10), totalTime: Date.now() - startTime });
                  
                  // Save events to persistent database
                  try {
                    for (const event of finalEvents) {
                      db.prepare(`INSERT OR IGNORE INTO events 
                        (id, title, description, date, time, location, event_link, image_url, interests, vibes)
                        VALUES (@id, @title, @description, @date, @time, @location, @event_link, @image_url, @interests, @vibes)
                      `).run({
                        id: crypto.randomUUID(),
                        title: event.title,
                        description: event.description || '',
                        date: event.date,
                        time: event.time || 'See website',
                        location: event.location,
                        event_link: event.event_link,
                        image_url: event.image_url || null,
                        interests: JSON.stringify(event.interests || []),
                        vibes: JSON.stringify(event.vibes || [])
                      });
                    }
                    console.log('[discover-events] Saved', finalEvents.length, 'events to persistent database');
                  } catch (e) {
                    console.error('[discover-events] Failed to save to database:', e);
                  }
                  
                  // Cache results
                  discoveryCache.set(cacheKey, {
                    expiresAt: Date.now() + 10 * 60 * 1000,
                    events: finalEvents
                  });
                  
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ events: finalEvents, scrapingStatus }));
                  return;
                }
                
                // If we're close to our time budget, skip LLM and return best available events
                if (Date.now() - startTs > timeoutMs - 8000) {
                  const fallbackEvents = extractedEvents.slice(0, 20).map(e => ({
                    ...e,
                    interests: interests.length > 0 ? [interests[0]] : ['General'],
                    vibes: vibes.length > 0 ? [vibes[0]] : ['Fun']
                  }));
                  logToFile('[DISCOVERY] Skipping LLM due to time budget', { elapsed: Date.now() - startTs, timeoutMs, fallbackCount: fallbackEvents.length });
                  res.statusCode = 200;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ events: fallbackEvents, scrapingStatus }));
                  return;
                }
                
                // Create a comprehensive prompt that does everything in one call
                const comprehensivePrompt = `You are an expert event curator for ${city}. Analyze these events and return the best ones for this user.

Events found:
${JSON.stringify(extractedEvents, null, 2)}

User Profile:
- City: ${city}
- Interests: ${interests.join(', ') || 'open to anything'}
- Vibes: ${vibes.join(', ') || 'any vibe'}

Your task:
1. Validate each event (real events, not marketing pages)
2. Extract accurate details (dates, times, locations)
3. Generate compelling descriptions
4. Rank by relevance to user preferences
5. Filter out duplicates and low-quality events

Return a JSON object with this structure:
{
  "events": [
    {
      "title": "Clear, engaging event title",
      "description": "1-2 sentence compelling description that makes the event sound exciting",
      "date": "YYYY-MM-DD",
      "time": "HH:MM AM/PM or 'See website'",
      "location": "Specific venue/address in ${city}",
      "event_link": "Direct link to event page",
      "image_url": "Event image URL if available",
      "interests": ["matching user interests"],
      "vibes": ["matching user vibes"]
    }
  ]
}

Quality requirements:
- Only include events in ${city} (unless explicitly online)
- Extract accurate dates from event data
- Generate engaging, specific descriptions
- Prioritize events matching user interests
- Filter out duplicates and non-events
- Return 5-15 high-quality events maximum`;

                const remainingBudgetMs = Math.max(0, timeoutMs - (Date.now() - startTs));
                const llmDeadlineMs = Math.max(6000, Math.min(20000, remainingBudgetMs - 2000));
                const controller = new AbortController();
                const llmTimeout = setTimeout(() => {
                  try { controller.abort(); } catch {}
                }, llmDeadlineMs);
                let rankingResponse;
                try {
                  rankingResponse = await callOpenAIWithBackoff({
                  model: OPENAI_MODEL,
                  messages: [
                    {
                      role: 'system',
                      content: `You are an expert event curator. Analyze events and return the best ones for the user. Always return valid JSON.`
                    },
                    {
                      role: 'user',
                      content: comprehensivePrompt
                    }
                  ],
                  response_format: { type: "json_object" },
                  temperature: 0.4,
                }, 'comprehensive_event_processing');
                } finally {
                  clearTimeout(llmTimeout);
                }

                const rankingData = rankingResponse; // already JSON
                const content = rankingData.choices?.[0]?.message?.content;
                console.log('[discover-events] OpenAI ranking response:', content?.substring(0, 200));
                
                let eventsData: any = {};
                try {
                  eventsData = JSON.parse(content || '{}');
                } catch (e) {
                  console.log('[discover-events] Failed to parse OpenAI response');
                  const fallbackEvents = extractedEvents.slice(0, 20).map(e => ({
                    ...e,
                    interests: interests.length > 0 ? [interests[0]] : ['General'],
                    vibes: vibes.length > 0 ? [vibes[0]] : ['Fun']
                  }));
                  res.statusCode = 200;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ events: fallbackEvents, scrapingStatus }));
                  return;
                }

                const events = (eventsData.events || []).filter((event: any) => {
                  const hasValidLink = event.event_link && 
                    event.event_link.startsWith('http') &&
                    event.event_link.length > 10;
                  const hasValidDate = event.date && /^\d{4}-\d{2}-\d{2}$/.test(event.date);
                  return hasValidLink && hasValidDate;
                });

                // Filter by user-selected interests if provided
                const selectedInterestSet = new Set((interests || []).map((i: string) => (i || '').toLowerCase()));
                const filteredByInterest = selectedInterestSet.size === 0
                  ? events
                  : events.filter((ev: any) => {
                      const evInterests = (ev.interests || []).map((x: string) => (x || '').toLowerCase());
                      return evInterests.some((x: string) => selectedInterestSet.has(x));
                    });

                logToFile('[DISCOVERY] Final events to return', { count: filteredByInterest.length, events: filteredByInterest, llmTime: Date.now() - llmStart, totalTime: Date.now() - startTime });
                lastDiscoveryProgress.step = 'done';

                // Persist new rotation offset
                try {
                  if (rotationKey && searchInterests.length > 0) {
                    const nextOffset = Number((lastDiscoveryProgress as any).nextOffset || interestsLimit) % searchInterests.length;
                    db.prepare(`INSERT INTO discovery_state (key, offset) VALUES (@key, @offset)
                                ON CONFLICT(key) DO UPDATE SET offset = excluded.offset`).run({ key: rotationKey, offset: nextOffset });
                  }
                } catch {}
                
                // Save events to persistent database
                try {
                  for (const event of filteredByInterest) {
                    db.prepare(`INSERT OR IGNORE INTO events 
                      (id, title, description, date, time, location, event_link, image_url, interests, vibes)
                      VALUES (@id, @title, @description, @date, @time, @location, @event_link, @image_url, @interests, @vibes)
                    `).run({
                      id: crypto.randomUUID(),
                      title: event.title,
                      description: event.description || '',
                      date: event.date,
                      time: event.time || 'See website',
                      location: event.location,
                      event_link: event.event_link,
                      image_url: event.image_url || null,
                      interests: JSON.stringify(event.interests || []),
                      vibes: JSON.stringify(event.vibes || [])
                    });
                  }
                  console.log('[discover-events] Saved', events.length, 'events to persistent database');
                } catch (e) {
                  console.error('[discover-events] Failed to save to database:', e);
                }
                
                // Cache the results for 10 minutes
                discoveryCache.set(cacheKey, {
                  expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
                  events: filteredByInterest
                });
                
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ events: filteredByInterest, scrapingStatus }));
                return;
              } catch (e) {
                logToFile('[DISCOVERY] FATAL ERROR', { error: e.message, stack: e.stack });
                console.error('[discover-events] Fatal error:', e);
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "discover failed" }));
                return;
              }
            }
            next();
          });
        },
      },
    ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  };
});
