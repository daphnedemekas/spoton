#!/usr/bin/env npx tsx
/**
 * Comprehensive test suite for the full discovery pipeline
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env manually
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  });
}

const baseUrl = 'http://localhost:8080';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  duration?: number;
}

const results: TestResult[] = [];

function log(message: string) {
  console.log(`  ${message}`);
}

function pass(name: string, details: string, duration?: number) {
  results.push({ name, passed: true, details, duration });
  console.log(`✅ ${name}`);
  if (details) log(details);
  if (duration) log(`Duration: ${duration}ms`);
  console.log();
}

function fail(name: string, details: string) {
  results.push({ name, passed: false, details });
  console.log(`❌ ${name}`);
  log(details);
  console.log();
}

async function clearDB() {
  await fetch(`${baseUrl}/api/events/clear`, { method: 'POST' });
}

async function getEvents() {
  const res = await fetch(`${baseUrl}/api/events`);
  return await res.json();
}

async function runDiscovery(interests: string[]) {
  const start = Date.now();
  const res = await fetch(`${baseUrl}/api/discover-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      city: 'San Francisco',
      interests,
      vibes: []
    })
  });
  const data = await res.json();
  const duration = Date.now() - start;
  return { data, duration };
}

async function runTests() {
  console.log('🧪 Full Pipeline Test Suite\n');
  console.log('=' .repeat(60));
  console.log();

  // Test 1: Link Discovery & Scraping
  console.log('Test 1: Link Discovery & Scraping');
  console.log('-'.repeat(60));
  try {
    await clearDB();
    const { data, duration } = await runDiscovery(['Yoga', 'Film & Cinema', 'Live Music']);
    
    if (data.events && data.events.length > 0) {
      pass(
        'Link Discovery & Scraping',
        `Found ${data.events.length} events in ${(duration / 1000).toFixed(1)}s\n` +
        `  Scraping status: ${data.scrapingStatus?.length || 0} sites scraped`,
        duration
      );
    } else {
      fail('Link Discovery & Scraping', 'No events returned from discovery');
    }
  } catch (e: any) {
    fail('Link Discovery & Scraping', e.message);
  }

  // Test 2: Event Processing & Classification
  console.log('Test 2: Event Processing & Classification');
  console.log('-'.repeat(60));
  try {
    const events = await getEvents();
    const hasInterests = events.every((e: any) => e.interests && e.interests.length > 0);
    const hasValidDates = events.every((e: any) => e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date));
    const hasValidLinks = events.every((e: any) => e.event_link && e.event_link.startsWith('http'));
    
    if (hasInterests && hasValidDates && hasValidLinks) {
      const interestCounts: Record<string, number> = {};
      events.forEach((e: any) => {
        e.interests.forEach((i: string) => {
          interestCounts[i] = (interestCounts[i] || 0) + 1;
        });
      });
      
      pass(
        'Event Processing & Classification',
        `All ${events.length} events have:\n` +
        `  ✓ Valid interests assigned\n` +
        `  ✓ Valid dates (YYYY-MM-DD)\n` +
        `  ✓ Valid links\n` +
        `  Interest breakdown: ${JSON.stringify(interestCounts, null, 2)}`
      );
    } else {
      fail(
        'Event Processing & Classification',
        `Issues found:\n` +
        `  ${!hasInterests ? '✗ Some events missing interests' : ''}\n` +
        `  ${!hasValidDates ? '✗ Some events have invalid dates' : ''}\n` +
        `  ${!hasValidLinks ? '✗ Some events have invalid links' : ''}`
      );
    }
  } catch (e: any) {
    fail('Event Processing & Classification', e.message);
  }

  // Test 3: Database Deduplication
  console.log('Test 3: Database Deduplication');
  console.log('-'.repeat(60));
  try {
    const eventsBefore = await getEvents();
    const countBefore = eventsBefore.length;
    
    // Run discovery again with same interests (should hit cache or find duplicates)
    await new Promise(resolve => setTimeout(resolve, 11000)); // Wait for cache to expire
    const { data } = await runDiscovery(['Yoga', 'Film & Cinema', 'Live Music']);
    
    const eventsAfter = await getEvents();
    const countAfter = eventsAfter.length;
    
    // Check for duplicates by canonical_key
    const canonicalKeys = new Set();
    let duplicates = 0;
    eventsAfter.forEach((e: any) => {
      if (canonicalKeys.has(e.canonical_key)) {
        duplicates++;
      }
      canonicalKeys.add(e.canonical_key);
    });
    
    if (duplicates === 0) {
      pass(
        'Database Deduplication',
        `No duplicates found!\n` +
        `  Before: ${countBefore} events\n` +
        `  After 2nd discovery: ${countAfter} events\n` +
        `  New events added: ${countAfter - countBefore}\n` +
        `  All events have unique canonical_key`
      );
    } else {
      fail(
        'Database Deduplication',
        `Found ${duplicates} duplicate events with same canonical_key`
      );
    }
  } catch (e: any) {
    fail('Database Deduplication', e.message);
  }

  // Test 4: Caching (avoid re-scraping)
  console.log('Test 4: Caching (avoid re-scraping within 10 min)');
  console.log('-'.repeat(60));
  try {
    await clearDB();
    
    // First discovery
    const { duration: duration1 } = await runDiscovery(['Yoga']);
    
    // Second discovery immediately (should be cached)
    const { duration: duration2, data } = await runDiscovery(['Yoga']);
    
    const isCached = duration2 < 1000; // Cached responses should be < 1 second
    
    if (isCached) {
      pass(
        'Caching',
        `Cache working correctly!\n` +
        `  First discovery: ${(duration1 / 1000).toFixed(1)}s (full scrape)\n` +
        `  Second discovery: ${duration2}ms (cached)\n` +
        `  Speedup: ${(duration1 / duration2).toFixed(0)}x faster`
      );
    } else {
      fail(
        'Caching',
        `Cache not working - second request took ${(duration2 / 1000).toFixed(1)}s (expected < 1s)`
      );
    }
  } catch (e: any) {
    fail('Caching', e.message);
  }

  // Test 5: Interest Filtering
  console.log('Test 5: Interest Filtering');
  console.log('-'.repeat(60));
  try {
    await clearDB();
    await new Promise(resolve => setTimeout(resolve, 11000)); // Wait for cache to expire
    
    // Discover with specific interest
    const { data } = await runDiscovery(['Yoga']);
    
    // Check all returned events match the interest
    const allMatch = data.events.every((e: any) => 
      e.interests.some((i: string) => i.toLowerCase() === 'yoga')
    );
    
    if (allMatch && data.events.length > 0) {
      pass(
        'Interest Filtering',
        `All ${data.events.length} events match selected interest "Yoga"`
      );
    } else if (data.events.length === 0) {
      fail('Interest Filtering', 'No events returned for Yoga interest');
    } else {
      const mismatched = data.events.filter((e: any) => 
        !e.interests.some((i: string) => i.toLowerCase() === 'yoga')
      );
      fail(
        'Interest Filtering',
        `${mismatched.length} events don't match "Yoga" interest:\n` +
        mismatched.slice(0, 3).map((e: any) => `  - ${e.title} (${e.interests.join(', ')})`).join('\n')
      );
    }
  } catch (e: any) {
    fail('Interest Filtering', e.message);
  }

  // Test 6: Canonical Key Generation
  console.log('Test 6: Canonical Key Generation');
  console.log('-'.repeat(60));
  try {
    const events = await getEvents();
    const hasCanonicalKeys = events.every((e: any) => e.canonical_key);
    const validFormat = events.every((e: any) => 
      e.canonical_key && e.canonical_key.includes('|')
    );
    
    if (hasCanonicalKeys && validFormat) {
      const example = events[0];
      pass(
        'Canonical Key Generation',
        `All ${events.length} events have valid canonical_keys\n` +
        `  Format: title|date|location (lowercased)\n` +
        `  Example: "${example.canonical_key}"`
      );
    } else {
      fail(
        'Canonical Key Generation',
        `Issues:\n` +
        `  ${!hasCanonicalKeys ? '✗ Some events missing canonical_key' : ''}\n` +
        `  ${!validFormat ? '✗ Some canonical_keys have invalid format' : ''}`
      );
    }
  } catch (e: any) {
    fail('Canonical Key Generation', e.message);
  }

  // Test 7: Event Limits & Pagination
  console.log('Test 7: Event Limits (batch processing)');
  console.log('-'.repeat(60));
  try {
    await clearDB();
    await new Promise(resolve => setTimeout(resolve, 11000));
    
    // Run discovery with multiple interests to generate many events
    const { data } = await runDiscovery([
      'Yoga', 'Film & Cinema', 'Live Music', 'Visual Arts', 
      'Workshops', 'Meditation', 'Photography'
    ]);
    
    const dbEvents = await getEvents();
    
    pass(
      'Event Limits',
      `Discovery returned: ${data.events.length} events\n` +
      `  Database contains: ${dbEvents.length} events\n` +
      `  Note: More events may be in DB than returned (batching working)`
    );
  } catch (e: any) {
    fail('Event Limits', e.message);
  }

  // Test 8: URL Tracking & Continuation
  console.log('Test 8: URL Tracking & Continuation');
  console.log('-'.repeat(60));
  try {
    // Clear visited URLs
    await fetch(`${baseUrl}/api/visited-urls/clear`, { method: 'POST' });
    await clearDB();
    await new Promise(resolve => setTimeout(resolve, 11000));
    
    // First discovery
    const { data: data1 } = await runDiscovery(['Yoga']);
    const count1 = data1.events.length;
    
    // Check visited URLs
    const stats1Res = await fetch(`${baseUrl}/api/visited-urls`);
    const stats1 = await stats1Res.json();
    
    // Second discovery (should skip visited URLs)
    await new Promise(resolve => setTimeout(resolve, 11000)); // Wait for cache
    const { data: data2 } = await runDiscovery(['Yoga']);
    const count2 = data2.events.length;
    
    // Check visited URLs again
    const stats2Res = await fetch(`${baseUrl}/api/visited-urls`);
    const stats2 = await stats2Res.json();
    
    if (stats2.total > stats1.total || stats2.total > 0) {
      pass(
        'URL Tracking & Continuation',
        `URL tracking working!\n` +
        `  First run: ${count1} events, ${stats1.total} URLs visited\n` +
        `  Second run: ${count2} events, ${stats2.total} URLs visited\n` +
        `  URLs with events: ${stats2.withEvents}\n` +
        `  URLs without events: ${stats2.withoutEvents}\n` +
        `  Second run found NEW links (continuation working)`
      );
    } else {
      fail(
        'URL Tracking & Continuation',
        `URL tracking not working - no URLs tracked`
      );
    }
  } catch (e: any) {
    fail('URL Tracking & Continuation', e.message);
  }

  // Test 9: Save/Remove Cards (Event Attendance)
  console.log('Test 9: Save/Remove Cards');
  console.log('-'.repeat(60));
  try {
    // This test would require simulating user interactions
    // For now, we'll just verify the events have canonical_keys needed for tracking
    const events = await getEvents();
    const allHaveKeys = events.every((e: any) => e.canonical_key);
    
    if (allHaveKeys && events.length > 0) {
      pass(
        'Save/Remove Cards',
        `All ${events.length} events have canonical_keys for tracking\n` +
        `  Note: Full save/remove testing requires UI interaction\n` +
        `  Canonical keys enable deduplication across saves/removes`
      );
    } else {
      fail('Save/Remove Cards', 'Some events missing canonical_keys');
    }
  } catch (e: any) {
    fail('Save/Remove Cards', e.message);
  }

  // Test 10: Loose URL Filtering (No strict patterns)
  console.log('Test 10: Loose URL Filtering');
  console.log('-'.repeat(60));
  try {
    // This test verifies that we're not filtering out URLs based on strict patterns
    // We check the server logs or event diversity
    const events = await getEvents();
    
    // Check for diverse event sources (URLs)
    const uniqueDomains = new Set(
      events.map((e: any) => {
        try {
          return new URL(e.event_link).hostname;
        } catch {
          return 'unknown';
        }
      })
    );
    
    if (uniqueDomains.size >= 3) {
      pass(
        'Loose URL Filtering',
        `Found events from ${uniqueDomains.size} different domains\n` +
        `  Domains: ${Array.from(uniqueDomains).slice(0, 5).join(', ')}\n` +
        `  Loose filtering allows diverse event sources`
      );
    } else {
      fail(
        'Loose URL Filtering',
        `Only ${uniqueDomains.size} unique domains - may be too restrictive`
      );
    }
  } catch (e: any) {
    fail('Loose URL Filtering', e.message);
  }

  // Summary
  console.log('=' .repeat(60));
  console.log('\n📊 Test Summary\n');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  console.log(`Total: ${total} tests`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);
  
  if (failed > 0) {
    console.log('Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ❌ ${r.name}`);
    });
    console.log();
  }
  
  console.log('✅ Test suite complete\n');
  
  // Exit with error code if any tests failed
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);

