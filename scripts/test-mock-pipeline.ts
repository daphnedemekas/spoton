#!/usr/bin/env npx tsx
/**
 * Mock-based test suite that doesn't call real APIs
 * Tests the logic without spending money on OpenAI/Brave
 */

console.log('🧪 Mock Pipeline Test Suite (No API Calls)\n');
console.log('='.repeat(60));
console.log();

// Mock data
const mockBraveResults = {
  web: {
    results: [
      { url: 'https://sf.funcheap.com/events/', title: 'SF Fun Cheap Events' },
      { url: 'https://www.eventbrite.com/d/ca--san-francisco/events/', title: 'Eventbrite SF' },
      { url: 'https://www.sfstation.com/events/', title: 'SF Station' }
    ]
  }
};

const mockScrapedHTML = `
<html>
  <body>
    <a href="/event/yoga-golden-gate-park">Yoga in Golden Gate Park</a>
    <a href="/event/comedy-night-cobbs">Comedy Night at Cobb's</a>
    <a href="/event/film-screening-castro">Film Screening: Citizen Kane</a>
  </body>
</html>
`;

const mockEventPage = `
<html>
  <head>
    <script type="application/ld+json">
    {
      "@type": "Event",
      "name": "Yoga in Golden Gate Park",
      "description": "Join us for a relaxing morning yoga session",
      "startDate": "2025-11-15T09:00:00",
      "location": {
        "name": "Golden Gate Park",
        "address": "San Francisco, CA"
      },
      "url": "https://example.com/event/yoga"
    }
    </script>
  </head>
</html>
`;

const mockLLMResponse = {
  isEvent: true,
  events: [
    {
      title: "Yoga in Golden Gate Park",
      description: "Join us for a relaxing morning yoga session in the park",
      date: "2025-11-15",
      time: "9:00 AM",
      location: "Golden Gate Park, San Francisco",
      event_link: "https://example.com/event/yoga",
      interests: ["Yoga"]
    },
    {
      title: "Comedy Night at Cobb's",
      description: "Stand-up comedy show featuring local comedians",
      date: "2025-11-16",
      time: "8:00 PM",
      location: "Cobb's Comedy Club, San Francisco",
      event_link: "https://example.com/event/comedy",
      interests: ["Comedy Shows"]
    }
  ]
};

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function pass(name: string, details: string) {
  results.push({ name, passed: true, details });
  console.log(`✅ ${name}`);
  console.log(`   ${details}\n`);
}

function fail(name: string, details: string) {
  results.push({ name, passed: false, details });
  console.log(`❌ ${name}`);
  console.log(`   ${details}\n`);
}

// Test 1: Canonical Key Generation
console.log('Test 1: Canonical Key Generation');
console.log('-'.repeat(60));
function generateCanonicalKey(title: string, date: string, location: string): string {
  return `${title.toLowerCase()}|${date.slice(0, 10)}|${location.toLowerCase()}`;
}

const event1 = { title: "Yoga Class", date: "2025-11-15", location: "Golden Gate Park, SF" };
const event2 = { title: "Yoga Class", date: "2025-11-15", location: "Golden Gate Park, SF" };
const event3 = { title: "Yoga Class", date: "2025-11-16", location: "Golden Gate Park, SF" };

const key1 = generateCanonicalKey(event1.title, event1.date, event1.location);
const key2 = generateCanonicalKey(event2.title, event2.date, event2.location);
const key3 = generateCanonicalKey(event3.title, event3.date, event3.location);

if (key1 === key2 && key1 !== key3) {
  pass('Canonical Key Generation', `Same events produce same key, different events produce different keys`);
} else {
  fail('Canonical Key Generation', `Key logic broken: key1=${key1}, key2=${key2}, key3=${key3}`);
}

// Test 2: Location Filtering
console.log('Test 2: Location Filtering');
console.log('-'.repeat(60));
function isValidLocation(location: string, title: string, description: string): boolean {
  const combined = `${location} ${title} ${description}`.toLowerCase();
  const isOnline = combined.includes('online') || combined.includes('virtual');
  const inCity = combined.includes('san francisco') || combined.includes('oakland') || combined.includes('sf');
  const otherCities = ['toronto', 'new york', 'los angeles', 'chicago', 'boston'];
  const hasOtherCity = otherCities.some(city => combined.includes(city));
  
  return isOnline || (inCity && !hasOtherCity);
}

const validEvents = [
  { location: "The Fillmore, San Francisco", title: "Jazz Night", description: "Live music", expected: true },
  { location: "Online", title: "Virtual Workshop", description: "Remote event", expected: true },
  { location: "Oakland Museum", title: "Art Show", description: "Gallery opening", expected: true },
  { location: "Toronto Gallery", title: "Art Show", description: "Exhibition", expected: false },
  { location: "SF Gallery", title: "Shows in Toronto", description: "Toronto artists", expected: false },
  { location: "San Francisco", title: "Explore shows in New York", description: "Comprehensive listing from around the world", expected: false },
];

let locationTestsPassed = 0;
validEvents.forEach(event => {
  const result = isValidLocation(event.location, event.title, event.description);
  if (result === event.expected) {
    locationTestsPassed++;
  } else {
    console.log(`   ⚠️  Failed: "${event.title}" at "${event.location}" - expected ${event.expected}, got ${result}`);
  }
});

if (locationTestsPassed === validEvents.length) {
  pass('Location Filtering', `All ${validEvents.length} location tests passed`);
} else {
  fail('Location Filtering', `Only ${locationTestsPassed}/${validEvents.length} tests passed`);
}

// Test 3: Interest Classification
console.log('Test 3: Interest Classification (Mock)');
console.log('-'.repeat(60));
function mockClassifyInterest(title: string, description: string): string[] {
  const combined = `${title} ${description}`.toLowerCase();
  
  if (combined.includes('yoga')) return ['Yoga'];
  if (combined.includes('comedy') || combined.includes('stand-up')) return ['Comedy Shows'];
  if (combined.includes('film') || combined.includes('screening') || combined.includes('cinema')) return ['Film & Cinema'];
  if (combined.includes('dance') || combined.includes('choreograph')) return ['Theater & Dance'];
  if (combined.includes('restaurant') || combined.includes('dining') || combined.includes('food')) return ['Food Festivals'];
  if (combined.includes('gallery') || combined.includes('exhibition') || combined.includes('painting')) return ['Visual Arts'];
  if (combined.includes('jazz')) return ['Jazz'];
  
  return [];
}

const classificationTests = [
  { title: "Yoga in the Park", description: "Morning yoga session", expected: "Yoga" },
  { title: "Comedy Night", description: "Stand-up comedy show", expected: "Comedy Shows" },
  { title: "Film Screening", description: "Classic film at Castro Theatre", expected: "Film & Cinema" },
  { title: "Dance Showcase", description: "Choreography by local dancers", expected: "Theater & Dance" },
  { title: "Greens Restaurant", description: "Vegetarian dining at Fort Mason Center For Arts & Culture", expected: "Food Festivals" },
  { title: "Art Gallery Opening", description: "Exhibition of paintings", expected: "Visual Arts" },
  { title: "Jazz Night", description: "Live jazz performance", expected: "Jazz" },
];

let classificationPassed = 0;
classificationTests.forEach(test => {
  const result = mockClassifyInterest(test.title, test.description);
  if (result.includes(test.expected)) {
    classificationPassed++;
  } else {
    console.log(`   ⚠️  Failed: "${test.title}" - expected ${test.expected}, got ${result.join(', ') || 'none'}`);
  }
});

if (classificationPassed === classificationTests.length) {
  pass('Interest Classification', `All ${classificationTests.length} classification tests passed`);
} else {
  fail('Interest Classification', `Only ${classificationPassed}/${classificationTests.length} tests passed`);
}

// Test 4: Deduplication Logic
console.log('Test 4: Deduplication Logic');
console.log('-'.repeat(60));
const events = [
  { id: '1', title: "Yoga Class", date: "2025-11-15", location: "Golden Gate Park" },
  { id: '2', title: "Yoga Class", date: "2025-11-15", location: "Golden Gate Park" }, // Duplicate
  { id: '3', title: "Comedy Night", date: "2025-11-16", location: "Cobb's" },
  { id: '4', title: "Yoga Class", date: "2025-11-16", location: "Golden Gate Park" }, // Different date
];

const seenKeys = new Set<string>();
const uniqueEvents = events.filter(event => {
  const key = generateCanonicalKey(event.title, event.date, event.location);
  if (seenKeys.has(key)) return false;
  seenKeys.add(key);
  return true;
});

if (uniqueEvents.length === 3 && uniqueEvents.find(e => e.id === '2') === undefined) {
  pass('Deduplication Logic', `Correctly filtered ${events.length} events to ${uniqueEvents.length} unique events`);
} else {
  fail('Deduplication Logic', `Expected 3 unique events, got ${uniqueEvents.length}`);
}

// Test 5: User Interest Filtering
console.log('Test 5: User Interest Filtering');
console.log('-'.repeat(60));
const userInterests = new Set(['Yoga', 'Film & Cinema', 'Jazz']);
const allEvents = [
  { title: "Yoga Class", interests: ["Yoga"] },
  { title: "Comedy Night", interests: ["Comedy Shows"] },
  { title: "Film Screening", interests: ["Film & Cinema"] },
  { title: "Jazz Concert", interests: ["Jazz"] },
  { title: "Art Gallery", interests: ["Visual Arts"] },
];

const filteredEvents = allEvents.filter(event => 
  event.interests.some(interest => userInterests.has(interest))
);

if (filteredEvents.length === 3) {
  pass('User Interest Filtering', `Correctly filtered to ${filteredEvents.length} matching events`);
} else {
  fail('User Interest Filtering', `Expected 3 events, got ${filteredEvents.length}`);
}

// Test 6: Non-Event Text Filtering
console.log('Test 6: Non-Event Text Filtering');
console.log('-'.repeat(60));
function isNonEventText(title: string, description: string): boolean {
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();
  const nonEventPhrases = [
    'technical problem', 'clear your cache', 'clear cache', 'cookies',
    'update your browser', 'try a different', 'error', 'page not found',
    'sign in', 'log in', 'register', 'subscribe', 'newsletter',
    'privacy policy', 'terms of service', 'contact us', 'about us',
    'follow us', 'share this', 'click here', 'learn more',
    'loading...', 'please wait', 'redirecting',
    'explore shows', 'explore events', 'comprehensive listing',
    'around the world', 'current shows', 'upcoming shows',
    'view all', 'see all', 'browse events', 'event calendar'
  ];
  
  return nonEventPhrases.some(phrase => titleLower.includes(phrase) || descLower.includes(phrase)) || title.length > 150;
}

const nonEventTests = [
  { title: "Yoga in the Park", description: "Morning session", isNonEvent: false },
  { title: "If you're having technical problems, clear your cache", description: "Help text", isNonEvent: true },
  { title: "Explore shows in New York", description: "Comprehensive listing", isNonEvent: true },
  { title: "Sign in to view events", description: "Login page", isNonEvent: true },
  { title: "Jazz Night at The Fillmore", description: "Live music", isNonEvent: false },
  { title: "A".repeat(200), description: "Too long", isNonEvent: true },
];

let nonEventTestsPassed = 0;
nonEventTests.forEach(test => {
  const result = isNonEventText(test.title, test.description);
  if (result === test.isNonEvent) {
    nonEventTestsPassed++;
  } else {
    console.log(`   ⚠️  Failed: "${test.title.slice(0, 50)}..." - expected isNonEvent=${test.isNonEvent}, got ${result}`);
  }
});

if (nonEventTestsPassed === nonEventTests.length) {
  pass('Non-Event Text Filtering', `All ${nonEventTests.length} non-event tests passed`);
} else {
  fail('Non-Event Text Filtering', `Only ${nonEventTestsPassed}/${nonEventTests.length} tests passed`);
}

// Test 7: Dismissed Event Filtering
console.log('Test 7: Dismissed Event Filtering');
console.log('-'.repeat(60));
const dismissedKeys = new Set([
  generateCanonicalKey("Yoga Class", "2025-11-15", "Golden Gate Park")
]);

const eventsToShow = [
  { title: "Yoga Class", date: "2025-11-15", location: "Golden Gate Park" },
  { title: "Comedy Night", date: "2025-11-16", location: "Cobb's" },
];

const nonDismissedEvents = eventsToShow.filter(event => {
  const key = generateCanonicalKey(event.title, event.date, event.location);
  return !dismissedKeys.has(key);
});

if (nonDismissedEvents.length === 1 && nonDismissedEvents[0].title === "Comedy Night") {
  pass('Dismissed Event Filtering', `Correctly filtered out dismissed events`);
} else {
  fail('Dismissed Event Filtering', `Expected 1 event (Comedy Night), got ${nonDismissedEvents.length}`);
}

// Summary
console.log('='.repeat(60));
console.log('\n📊 Test Summary\n');
const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;
console.log(`Total: ${results.length} tests`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%\n`);

if (failed > 0) {
  console.log('⚠️  Some tests failed! Review the logic above.\n');
  process.exit(1);
} else {
  console.log('✅ All tests passed! Logic is sound.\n');
  console.log('💡 Note: This test suite uses mocks and doesn\'t call real APIs.');
  console.log('   Run `npm run test:pipeline` to test with real API calls (costs money).\n');
  process.exit(0);
}

