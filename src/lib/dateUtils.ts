import type { Event } from "@/types/event";

/**
 * Check if a date string is within the current week
 */
export function isThisWeek(dateStr: string): boolean {
  const eventDate = new Date(dateStr);
  const now = new Date();

  // Get start of current week (Sunday)
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  // Get end of current week (Saturday)
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  return eventDate >= startOfWeek && eventDate <= endOfWeek;
}

/**
 * Filter events to only those occurring this week
 */
export function filterThisWeek(events: Event[]): Event[] {
  return events.filter(event => isThisWeek(event.date));
}

/**
 * Check if a date string is today
 */
export function isToday(dateStr: string): boolean {
  const eventDate = new Date(dateStr);
  const today = new Date();

  return (
    eventDate.getFullYear() === today.getFullYear() &&
    eventDate.getMonth() === today.getMonth() &&
    eventDate.getDate() === today.getDate()
  );
}

/**
 * Filter events to only those occurring today
 */
export function filterToday(events: Event[]): Event[] {
  return events.filter(event => isToday(event.date));
}

/**
 * Check if a date is in the past
 */
export function isPast(dateStr: string): boolean {
  const eventDate = new Date(dateStr);
  const now = new Date();
  return eventDate < now;
}

/**
 * Check if a date is in the future
 */
export function isFuture(dateStr: string): boolean {
  const eventDate = new Date(dateStr);
  const now = new Date();
  return eventDate > now;
}

/**
 * Get events grouped by date
 */
export function groupEventsByDate(events: Event[]): Record<string, Event[]> {
  return events.reduce((acc, event) => {
    const date = event.date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(event);
    return acc;
  }, {} as Record<string, Event[]>);
}
