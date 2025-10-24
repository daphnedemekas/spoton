#!/usr/bin/env tsx
/**
 * Standalone script to test the event discovery pipeline
 * 
 * Usage:
 *   npm run discover -- --city "San Francisco" --interests "music,tech" --limit 20
 * 
 * Or with tsx directly:
 *   npx tsx scripts/test-discovery.ts --city "San Francisco"
 */

import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";

// Load environment variables from .env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

// Parse command line arguments
const args = process.argv.slice(2);
const parseArgs = () => {
  const config: any = {
    city: "San Francisco",
    interests: [],
    vibes: [],
    limit: 20,
    sitesLimit: 12,
    resultsPerQuery: 8,
    interestsLimit: 3,
    skipRanking: false,
    timeoutMs: 60000,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const value = args[i + 1];
      
      if (key === "interests" || key === "vibes") {
        config[key] = value ? value.split(",").map(s => s.trim()) : [];
      } else if (["limit", "sitesLimit", "resultsPerQuery", "interestsLimit", "timeoutMs"].includes(key)) {
        config[key] = parseInt(value) || config[key];
      } else if (key === "skipRanking") {
        config[key] = value === "true";
      } else {
        config[key] = value || config[key];
      }
      i++;
    }
  }

  return config;
};

const config = parseArgs();

// Logging utilities
const logDir = path.resolve(process.cwd(), "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logFile = path.join(logDir, `discovery-test-${Date.now()}.log`);
const log = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;
  fs.appendFileSync(logFile, logLine);
  console.log(message, data || '');
};

log("=== Discovery Pipeline Test ===");
log("Configuration:", config);
log(`Log file: ${logFile}`);

// OpenAI utilities
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || 'BSAWwQU-MKtZyW9GkCIekHaoLfFbiNI';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

if (!OPENAI_API_KEY) {
  console.error("ERROR: OPENAI_API_KEY not found in environment");
  process.exit(1);
}

const openAIState = {
  lastCallTs: 0,
  minIntervalMs: 2000, // 30 RPM
  cooldownUntil: 0,
};

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function rateLimitGate() {
  if (Date.now() < openAIState.cooldownUntil) {
    const waitMs = openAIState.cooldownUntil - Date.now();
    log(`[openai][cooldown] waiting ${waitMs}ms`);
    await sleep(waitMs);
  }
  const nowTs = Date.now();
  const delta = nowTs - openAIState.lastCallTs;
  if (delta < openAIState.minIntervalMs) {
    await sleep(openAIState.minIntervalMs - delta);
  }
  openAIState.lastCallTs = Date.now();
}

async function callOpenAI(payload: any, label: string) {
  const maxRetries = 1;
  let attempt = 0;
  let lastErr: any;
  
  while (attempt <= maxRetries) {
    try {
      await rateLimitGate();
      
      log(`[OPENAI] Request: ${label}`, { model: payload?.model });
      
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
        log(`[openai][backoff] attempt=${attempt} status=${res.status} sleep=${backoffMs}ms`);
        
        if (res.status === 429) {
          openAIState.cooldownUntil = Date.now() + 300_000;
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
      const content = data?.choices?.[0]?.message?.content;
      log(`[OPENAI] Response: ${label}`, { status: 'ok', contentLength: content?.length });
      
      return data;
    } catch (err: any) {
      lastErr = err;
      log(`[openai][error] attempt=${attempt} err=${err?.message || err}`);
      if (attempt >= maxRetries) break;
      
      const backoffMs = Math.min(8000, 1000 * Math.pow(2, attempt));
      await sleep(backoffMs);
      attempt++;
    }
  }
  
  throw lastErr || new Error('OpenAI request failed');
}

// Main discovery pipeline
async function runDiscovery() {
  const startTime = Date.now();
  const city = config.city;
  const interests: string[] = config.interests.length > 0 ? config.interests : ['music', 'food', 'tech'];
  const vibes: string[] = config.vibes;
  
  log("\n=== STEP 1: Brave Search ===");
  log("Searching for event websites...");
  
  const braveWebsites: any[] = [];
  const seenUrls = new Set<string>();
  let queryCount = 0;
  
  const now = new Date();
  const searchDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    return {
      date: date.toISOString().split('T')[0],
      dayName: date.toLocaleDateString('en-US', { weekday: 'long' }),
      monthDay: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    };
  });
  
  for (const interest of interests.slice(0, config.interestsLimit)) {
    const queryStyles = [
      `${interest} events ${city} ${searchDays[0].monthDay}`,
      `${interest} ${city} this week`,
      `upcoming ${interest} ${city} calendar`,
      `${city} ${interest} schedule ${searchDays[0].dayName}`
    ];
    
    for (const searchQuery of queryStyles.slice(0, 2)) {
      try {
        if (queryCount > 0) {
          await new Promise(resolve => setTimeout(resolve, 1100));
        }
        queryCount++;
        
        log(`[BRAVE] Query: ${searchQuery}`);
        
        const braveResponse = await fetch(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchQuery)}&count=${config.resultsPerQuery}`,
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
          log(`[BRAVE] Found ${results.length} results`);
          
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
          log(`[BRAVE] Error: ${braveResponse.status}`);
        }
      } catch (error: any) {
        log(`[BRAVE] Failed: ${error.message}`);
      }
    }
  }
  
  log(`\nTotal websites found: ${braveWebsites.length}`);
  log("Websites:", braveWebsites.map(w => ({ url: w.url, interest: w.interest })));
  
  log("\n=== STEP 2: Find Event Links ===");
  log(`Scraping ${Math.min(config.sitesLimit, braveWebsites.length)} listing pages...`);
  
  const eventLinks: Set<string> = new Set();
  const scrapingStatus: any[] = [];
  
  for (const website of braveWebsites.slice(0, config.sitesLimit)) {
    try {
      log(`[SCRAPE] ${website.url}`);
      
      const response = await fetch(website.url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000)
      });
      
      if (response.ok) {
        const html = await response.text();
        const $ = cheerio.load(html);
        const baseUrl = new URL(website.url);
        let foundCount = 0;
        
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
            !lowerUrl.endsWith('/events') &&
            eventLinks.size < 60
          ) {
            eventLinks.add(fullUrl);
            foundCount++;
          }
        });
        
        log(`  Found ${foundCount} event links`);
        scrapingStatus.push({ url: website.url, status: 'success', linksFound: foundCount });
      }
    } catch (error: any) {
      log(`  Failed: ${error.message}`);
      scrapingStatus.push({ url: website.url, status: 'failed' });
    }
  }
  
  log(`\nTotal event links found: ${eventLinks.size}`);
  
  log("\n=== STEP 3: Scrape Event Pages ===");
  log(`Scraping ${Math.min(config.limit, eventLinks.size)} event pages...`);
  
  const extractedEvents: any[] = [];
  const candidatePages: any[] = [];
  const linksArr = Array.from(eventLinks).slice(0, config.limit);
  const concurrency = 4;
  
  for (let i = 0; i < linksArr.length; i += concurrency) {
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
        let found = false;
        
        // Try JSON-LD first
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
                  title: item.name || '',
                  description: item.description || '',
                  date: dateStr,
                  time: timeStr,
                  location: item.location?.name || item.location?.address?.addressLocality || city,
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
          const title = $('h1').first().text().trim() || $('[class*="title"]').first().text().trim();
          const description = $('meta[name="description"]').attr('content') || $('[class*="description"]').first().text().trim().substring(0, 300);
          
          if (title && title.length > 3) {
            candidatePages.push({ url: link, title, description: description || '' });
          }
        }
      } catch {}
    }));
  }
  
  log(`\nStructured events found: ${extractedEvents.length}`);
  log(`Candidate pages needing LLM validation: ${candidatePages.length}`);
  
  log("\n=== STEP 4: LLM Validation ===");
  
  if (candidatePages.length > 0 && !config.skipRanking) {
    const pagesToValidate = candidatePages.slice(0, 30); // Validate up to 30 pages for more events
    log(`Validating ${pagesToValidate.length} candidate pages with LLM...`);
    
    try {
      const today = new Date().toISOString().split('T')[0];
      const validationResponse = await callOpenAI({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: `You extract specific events from web pages. Today is ${today}. User city: ${city}.

GOAL: Return individual event cards, NOT listing pages.

Rules:
- If a page describes ONE specific event → extract that event
- If a page lists MULTIPLE events (like a calendar) → extract EACH event separately
- Event descriptions should describe what happens at THIS EVENT
- Only include events in ${city} or explicitly online
- Dates must be YYYY-MM-DD format`
          },
          {
            role: 'user',
            content: `Extract specific events from these pages. For each page, return an array of events (even if just 1 event). Return ALL valid events, no limit.

${pagesToValidate.map(p => `URL: ${p.url}\nTitle: ${p.title}\nDescription: ${p.description}`).join('\n\n')}

For each event return:
- title: Name of the specific event (e.g., "Artist Name at Venue")
- description: 1-2 sentences about what happens at THIS specific event
- date: YYYY-MM-DD (extract from page data, must be valid)
- time: Extract actual time if available (e.g. "7:00 PM", "8:30 PM"), or "See website" if not found
- location: "San Francisco" or "Oakland" + specific venue name
- event_link: The URL

Return JSON: {"validations": [{"url": "...", "isEvent": true/false, "events": [{"title":"...","description":"...","date":"YYYY-MM-DD","time":"...","location":"...","event_link":"..."}]}]}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
      }, 'validate-candidates');
      
      const content = validationResponse.choices?.[0]?.message?.content;
      const parsed = JSON.parse(content || '{}');
      
      let added = 0;
      let skipped = 0;
      
      for (const v of (parsed.validations || [])) {
        if (!v?.isEvent) {
          skipped++;
          continue;
        }
        
        const eventsArr = Array.isArray(v.events) ? v.events : [];
        for (const ev of eventsArr) {
          const loc = (ev.location || '').toLowerCase();
          const isOnline = loc.includes('online') || loc.includes('virtual');
          const inCity = loc.includes(city.toLowerCase());
          
          if (!isOnline && !inCity) {
            skipped++;
            continue;
          }
          
          if (!ev.title || !ev.date || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date) || !ev.event_link) {
            skipped++;
            continue;
          }
          
          extractedEvents.push({
            title: ev.title,
            description: ev.description || `Event in ${city}`,
            date: ev.date,
            time: ev.time || 'See website',
            location: ev.location || city,
            event_link: ev.event_link,
            interests: interests.length > 0 ? [interests[0]] : ['General'],
            vibes: vibes.length > 0 ? [vibes[0]] : ['Fun']
          });
          added++;
        }
      }
      
      log(`LLM validated: ${added} events added, ${skipped} skipped`);
    } catch (e: any) {
      log(`LLM validation error: ${e.message}`);
    }
  }
  
  log("\n=== STEP 5: Final LLM Ranking ===");
  
  // If we have 100+ structured events, skip expensive LLM ranking and use them directly
  if (extractedEvents.length >= 100) {
    log(`Found ${extractedEvents.length} high-quality structured events - skipping LLM ranking for efficiency`);
    
    // Basic deduplication and filtering
    const seen = new Set();
    const dedupedEvents = extractedEvents.filter(event => {
      const key = `${event.title?.toLowerCase()}-${event.date}-${event.location?.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return event.title && event.date && event.event_link;
    });
    
    // Sort by date (upcoming first)
    dedupedEvents.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA.getTime() - dateB.getTime();
    });
    
    const finalEvents = dedupedEvents.slice(0, 50); // Return top 50 events
    
    log("\n=== RESULTS ===");
    log(`Total time: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    log(`Events discovered: ${finalEvents.length}`);
    log(`\nSample events (first 10):`);
    
    finalEvents.slice(0, 10).forEach((event: any, idx: number) => {
      log(`\n${idx + 1}. ${event.title}`);
      log(`   Date: ${event.date} at ${event.time}`);
      log(`   Location: ${event.location}`);
      log(`   Link: ${event.event_link}`);
    });
    
    // Write results to JSON file
    const resultsFile = path.join(logDir, `discovery-results-${Date.now()}.json`);
    fs.writeFileSync(resultsFile, JSON.stringify({
      config,
      scrapingStatus: [],
      events: finalEvents,
      stats: {
        totalTime: Date.now() - startTime,
        websitesFound: braveWebsites.length,
        eventLinksFound: eventLinks.size,
        eventsExtracted: extractedEvents.length,
        finalEvents: finalEvents.length,
      }
    }, null, 2));
    
    log(`\nResults saved to: ${resultsFile}`);
    log("\n=== DONE ===");
    log(`Full log saved to: ${logFile}`);
    return;
  }
  
  if (extractedEvents.length > 0 && !config.skipRanking) {
    log(`Ranking ${extractedEvents.length} events with LLM...`);
    
    try {
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
- Return ALL quality events (15-30+ events), prioritized by relevance`;
      
      const rankingResponse = await callOpenAI({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert event curator. Analyze events and return ALL quality ones for the user. Always return valid JSON. Prefer inclusivity - keep all relevant events.`
          },
          {
            role: 'user',
            content: comprehensivePrompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }, 'comprehensive_event_processing');
      
      const content = rankingResponse.choices?.[0]?.message?.content;
      const eventsData = JSON.parse(content || '{}');
      
      const finalEvents = (eventsData.events || []).filter((event: any) => {
        const hasValidLink = event.event_link && 
          event.event_link.startsWith('http') &&
          event.event_link.length > 10;
        const hasValidDate = event.date && /^\d{4}-\d{2}-\d{2}$/.test(event.date);
        return hasValidLink && hasValidDate;
      });
      
      log(`Final ranked events: ${finalEvents.length}`);
      
      log("\n=== RESULTS ===");
      log(`Total time: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
      log(`Events discovered: ${finalEvents.length}`);
      log(`\nEvents:`);
      
      finalEvents.forEach((event: any, idx: number) => {
        log(`\n${idx + 1}. ${event.title}`);
        log(`   Date: ${event.date} at ${event.time}`);
        log(`   Location: ${event.location}`);
        log(`   Link: ${event.event_link}`);
        log(`   Description: ${event.description?.substring(0, 150)}...`);
      });
      
      // Write results to JSON file
      const resultsFile = path.join(logDir, `discovery-results-${Date.now()}.json`);
      fs.writeFileSync(resultsFile, JSON.stringify({
        config,
        scrapingStatus,
        events: finalEvents,
        stats: {
          totalTime: Date.now() - startTime,
          websitesFound: braveWebsites.length,
          eventLinksFound: eventLinks.size,
          eventsExtracted: extractedEvents.length,
          finalEvents: finalEvents.length,
        }
      }, null, 2));
      
      log(`\nResults saved to: ${resultsFile}`);
      
    } catch (e: any) {
      log(`LLM ranking error: ${e.message}`);
      log(`Returning ${extractedEvents.length} unranked events`);
    }
  } else {
    log("\n=== RESULTS ===");
    log(`Total time: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    log(`Events discovered: ${extractedEvents.length}`);
    log(`\nEvents:`);
    
    extractedEvents.forEach((event: any, idx: number) => {
      log(`\n${idx + 1}. ${event.title}`);
      log(`   Date: ${event.date} at ${event.time}`);
      log(`   Location: ${event.location}`);
      log(`   Link: ${event.event_link}`);
    });
  }
  
  log("\n=== DONE ===");
  log(`Full log saved to: ${logFile}`);
}

// Run the discovery pipeline
runDiscovery().catch((error) => {
  log("FATAL ERROR", error);
  console.error(error);
  process.exit(1);
});

