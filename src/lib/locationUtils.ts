/**
 * Canonicalize city names to standard format
 */
export function canonicalizeCity(name: string): string {
  const n = name.trim().toLowerCase();
  const map: Record<string, string> = {
    'sf': 'San Francisco',
    's.f.': 'San Francisco',
    'san fran': 'San Francisco',
    'san francisco': 'San Francisco',
    'oakland': 'Oakland',
    'berkeley': 'Berkeley',
    'pacifica': 'Pacifica',
    'sausalito': 'Sausalito',
    'san mateo': 'San Mateo',
    'san jose': 'San Jose',
    'alameda': 'Alameda',
    'daly city': 'Daly City',
    'mill valley': 'Mill Valley',
    'richmond': 'Richmond',
    'emeryville': 'Emeryville',
    'mountain view': 'Mountain View',
    'palo alto': 'Palo Alto',
    'redwood city': 'Redwood City',
    'menlo park': 'Menlo Park',
    'sunnyvale': 'Sunnyvale',
    'online': 'Online',
  };
  return map[n] || name.trim();
}

/**
 * Resolve display location from event title and location
 * Handles cases where location is repeated in title
 */
export function resolveDisplayLocation(title: string, location: string): string {
  const loc = (location || '').trim();
  if (!loc) return 'Location TBD';

  const canon = canonicalizeCity(loc);

  // Check if the title ends with the canonical city name
  const titleLower = title.toLowerCase();
  const canonLower = canon.toLowerCase();

  if (titleLower.endsWith(` in ${canonLower}`) || titleLower.endsWith(` - ${canonLower}`)) {
    // Return just the canonical city name to avoid duplication
    return canon;
  }

  return canon;
}
