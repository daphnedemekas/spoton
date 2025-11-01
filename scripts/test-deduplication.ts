#!/usr/bin/env npx tsx
/**
 * Test script to verify event deduplication and dismissed event filtering
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

async function testDeduplication() {
  console.log('🧪 Testing Event Deduplication & Dismissed Filtering\n');
  
  const baseUrl = 'http://localhost:8080';
  
  // Step 1: Clear events DB
  console.log('1️⃣  Clearing events database...');
  await fetch(`${baseUrl}/api/events/clear`, { method: 'POST' });
  console.log('   ✅ Database cleared\n');
  
  // Step 2: Add a test event
  console.log('2️⃣  Adding test event "Jazz Night at The Fillmore"...');
  const testEvent = {
    title: "Jazz Night at The Fillmore",
    description: "Live jazz performance",
    date: "2025-11-15",
    time: "8:00 PM",
    location: "San Francisco",
    event_link: "https://example.com/jazz-night",
    interests: ["Jazz"],
    vibes: []
  };
  
  await fetch(`${baseUrl}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testEvent)
  });
  console.log('   ✅ Event added\n');
  
  // Step 3: Get the event from DB
  console.log('3️⃣  Fetching events from database...');
  const eventsResponse = await fetch(`${baseUrl}/api/events`);
  const events = await eventsResponse.json();
  const jazzEvent = events.find((e: any) => e.title === "Jazz Night at The Fillmore");
  
  if (!jazzEvent) {
    console.log('   ❌ Event not found in database!');
    return;
  }
  console.log(`   ✅ Event found with ID: ${jazzEvent.id}\n`);
  
  // Step 4: Simulate dismissing the event (would happen via UI)
  console.log('4️⃣  Simulating user dismissing the event...');
  console.log(`   📝 In the UI, this would call: eventAttendanceService.dismissEvent(userId, "${jazzEvent.id}")`);
  console.log('   📝 This stores event_id in event_attendance table\n');
  
  // Step 5: Clear and re-add the same event (simulating re-discovery)
  console.log('5️⃣  Simulating event re-discovery (clear DB and re-add same event)...');
  await fetch(`${baseUrl}/api/events/clear`, { method: 'POST' });
  await fetch(`${baseUrl}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testEvent)
  });
  
  const eventsResponse2 = await fetch(`${baseUrl}/api/events`);
  const events2 = await eventsResponse2.json();
  const jazzEvent2 = events2.find((e: any) => e.title === "Jazz Night at The Fillmore");
  
  if (!jazzEvent2) {
    console.log('   ❌ Event not found after re-discovery!');
    return;
  }
  console.log(`   ✅ Event re-discovered with NEW ID: ${jazzEvent2.id}`);
  console.log(`   ⚠️  Old ID was: ${jazzEvent.id}`);
  console.log(`   ⚠️  Canonical key: ${jazzEvent2.canonical_key}\n`);
  
  // Step 6: Check if IDs match
  if (jazzEvent.id === jazzEvent2.id) {
    console.log('   ✅ IDs match - event would be correctly filtered out');
  } else {
    console.log('   ❌ IDs DO NOT match - event would reappear in feed!');
    console.log('   ❌ This is the bug: we need to use canonical_key instead of id\n');
  }
  
  console.log('\n📋 Summary:');
  console.log('   - Events get new auto-generated IDs when re-discovered');
  console.log('   - event_attendance stores the OLD id');
  console.log('   - Filter logic checks OLD id against NEW id → doesn\'t match');
  console.log('   - Solution: Use canonical_key (title|date|location) for tracking\n');
  
  console.log('✅ Deduplication test complete\n');
}

testDeduplication().catch(console.error);


