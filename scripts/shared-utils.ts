/**
 * Shared utilities for test scripts
 */

export interface EventItem {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  vibes: string[];
  interests: string[];
  image_url?: string;
  event_link?: string;
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Filter events to only those occurring this week
 */
export function filterThisWeek(events: EventItem[]): EventItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekFromNow = new Date(today);
  weekFromNow.setDate(today.getDate() + 7);

  return events.filter(ev => {
    const d = new Date(ev.date);
    return d >= today && d <= weekFromNow;
  });
}

/**
 * Fetch JSON from a URL with error handling
 */
export async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      console.error(`GET ${url} => ${res.status}`);
      return null;
    }
    return await res.json() as T;
  } catch (err) {
    console.error(`GET ${url} failed:`, err);
    return null;
  }
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

/**
 * Format timestamp as HH:MM:SS.mmm
 */
export function formatTimestamp(date: Date = new Date()): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

/**
 * Log with timestamp
 */
export function logWithTime(message: string): void {
  console.log(`[${formatTimestamp()}] ${message}`);
}
