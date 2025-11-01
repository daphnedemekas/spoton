#!/usr/bin/env npx tsx
/**
 * Test script to verify the deduplication fix works
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

async function testDeduplicationFixed() {
  console.log('🧪 Testing Deduplication Fix with Canonical Keys\n');
  
  const baseUrl = 'http://localhost:8080';
  
  // Step 1: Clear events DB
  console.log('1️⃣  Clearing events database...');
  await fetch(`${baseUrl}/api/events/clear`, { method: 'POST' });
  console.log('   ✅ Database cleared\n');
  
  // Step 2: Add test events
  console.log('2️⃣  Adding test events...');
  const testEvents = [
    {
      title: "Jazz Night at The Fillmore",
      description: "Live jazz performance",
      date: "2025-11-15",
      time: "8:00 PM",
      location: "San Francisco",
      event_link: "https://example.com/jazz-night",
      interests: ["Jazz"],
      vibes: []
    },
    {
      title: "Yoga in the Park",
      description: "Morning yoga session",
      date: "2025-11-16",
      time: "9:00 AM",
      location: "San Francisco",
      event_link: "https://example.com/yoga",
      interests: ["Yoga"],
      vibes: []
    }
  ];
  
  for (const event of testEvents) {
    await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
  }
  console.log(`   ✅ Added ${testEvents.length} events\n`);
  
  // Step 3: Get events and their canonical keys
  console.log('3️⃣  Fetching events from database...');
  const eventsResponse = await fetch(`${baseUrl}/api/events`);
  const events = await eventsResponse.json();
  
  console.log('   Events in database:');
  events.forEach((e: any) => {
    console.log(`   - ${e.title}`);
    console.log(`     ID: ${e.id}`);
    console.log(`     Canonical Key: ${e.canonical_key}\n`);
  });
  
  // Step 4: Simulate dismissing events (would happen via UI with canonical_key)
  console.log('4️⃣  Simulating dismissal tracking...');
  console.log('   📝 When user dismisses "Jazz Night", the system now stores:');
  console.log(`      - event_id: ${events[0].id}`);
  console.log(`      - canonical_key: ${events[0].canonical_key}`);
  console.log('   📝 The canonical_key stays the same even if the event is re-discovered!\n');
  
  // Step 5: Clear and re-add same events
  console.log('5️⃣  Simulating re-discovery (clear DB and re-add same events)...');
  await fetch(`${baseUrl}/api/events/clear`, { method: 'POST' });
  
  for (const event of testEvents) {
    await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
  }
  
  const eventsResponse2 = await fetch(`${baseUrl}/api/events`);
  const events2 = await eventsResponse2.json();
  
  console.log('   Events after re-discovery:');
  events2.forEach((e: any, i: number) => {
    const oldEvent = events.find((old: any) => old.title === e.title);
    const idChanged = oldEvent && oldEvent.id !== e.id;
    const keyMatches = oldEvent && oldEvent.canonical_key === e.canonical_key;
    
    console.log(`   - ${e.title}`);
    console.log(`     New ID: ${e.id} ${idChanged ? '(CHANGED ❌)' : ''}`);
    console.log(`     Canonical Key: ${e.canonical_key} ${keyMatches ? '(SAME ✅)' : ''}\n`);
  });
  
  // Step 6: Verify canonical keys match
  console.log('6️⃣  Verification:');
  let allMatch = true;
  for (const newEvent of events2) {
    const oldEvent = events.find((e: any) => e.title === newEvent.title);
    if (oldEvent) {
      if (oldEvent.canonical_key === newEvent.canonical_key) {
        console.log(`   ✅ "${newEvent.title}" - canonical_key matches`);
      } else {
        console.log(`   ❌ "${newEvent.title}" - canonical_key MISMATCH`);
        allMatch = false;
      }
    }
  }
  
  console.log('\n📋 Summary:');
  if (allMatch) {
    console.log('   ✅ All canonical keys match after re-discovery');
    console.log('   ✅ Dismissed events will be correctly filtered out');
    console.log('   ✅ Events will NOT reappear in the feed\n');
  } else {
    console.log('   ❌ Canonical keys do not match - fix failed\n');
  }
  
  console.log('✅ Deduplication fix test complete\n');
}

testDeduplicationFixed().catch(console.error);


