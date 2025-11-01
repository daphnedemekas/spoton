#!/usr/bin/env npx tsx
/**
 * Diagnostic script to trace the discovery pipeline and show where events are filtered out
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

async function diagnosePipeline() {
  console.log('🔍 Discovery Pipeline Diagnostic\n');
  console.log('This will trace a discovery run and show counts at each filtering step.\n');
  
  const baseUrl = 'http://localhost:8080';
  
  // Trigger discovery
  console.log('1️⃣  Starting discovery...\n');
  const startTime = Date.now();
  
  const response = await fetch(`${baseUrl}/api/discover-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      city: 'San Francisco',
      interests: ['Visual Arts', 'Film & Cinema', 'Photography', 'Literature', 'Live Music', 'Electronic', 'Indie', 'Yoga', 'Meditation', 'Workshops'],
      vibes: []
    })
  });
  
  const data = await response.json();
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`✅ Discovery completed in ${duration}s\n`);
  
  // Show pipeline breakdown
  console.log('📊 Pipeline Breakdown:\n');
  
  const scrapingStatus = data.scrapingStatus || [];
  const successfulScrapes = scrapingStatus.filter((s: any) => s.status === 'success').length;
  const failedScrapes = scrapingStatus.filter((s: any) => s.status === 'failed').length;
  
  console.log(`Step 1: Brave Search`);
  console.log(`   - Sites found: ${scrapingStatus.length}`);
  console.log(`   - Successfully scraped: ${successfulScrapes}`);
  console.log(`   - Failed: ${failedScrapes}\n`);
  
  console.log(`Step 2: Link Extraction`);
  console.log(`   - Links found: (check server terminal for "[DISCOVERY] Event links found")`);
  console.log(`   - Note: With new loose filtering, should see 50-100+ links\n`);
  
  console.log(`Step 3: Event Extraction`);
  console.log(`   - Raw events extracted: (check terminal logs for "[discover-events] OpenAI extracted")`);
  console.log(`   - Note: Events are extracted from HTML using JSON-LD or LLM\n`);
  
  console.log(`Step 3: LLM Validation & Classification`);
  console.log(`   - Events sent to LLM for validation/ranking`);
  console.log(`   - LLM classifies each event into interest categories`);
  console.log(`   - LLM filters out non-events and duplicates\n`);
  
  console.log(`Step 4: Backend Filtering`);
  console.log(`   - Filter: Valid link & date format`);
  console.log(`   - Filter: Has LLM-assigned interests`);
  console.log(`   - Filter: Interests match user's selected interests`);
  console.log(`   - Filter: Remove comedy (unless selected)`);
  console.log(`   - Result: ${data.events?.length || 0} events returned\n`);
  
  console.log(`Step 5: Database Save`);
  console.log(`   - Events saved to shared DB for all users`);
  console.log(`   - Deduplication by canonical_key (title|date|location)\n`);
  
  console.log(`Step 6: Frontend Filtering (Discover.tsx)`);
  console.log(`   - Filter: Remove interacted events (by canonical_key)`);
  console.log(`   - Filter: Prefer city/online events`);
  console.log(`   - Filter: Match user's selected interests`);
  console.log(`   - Sort: By preference score (interest matches + date proximity)`);
  console.log(`   - Shuffle: Interleave by interest for variety\n`);
  
  // Show final events
  console.log('📋 Final Events Returned:\n');
  if (data.events && data.events.length > 0) {
    data.events.forEach((e: any, i: number) => {
      console.log(`${i + 1}. ${e.title}`);
      console.log(`   Interests: ${e.interests?.join(', ') || 'none'}`);
      console.log(`   Date: ${e.date}, Location: ${e.location}\n`);
    });
  } else {
    console.log('   ⚠️  No events returned!\n');
  }
  
  // Check database
  console.log('🗄️  Checking database...\n');
  const dbResponse = await fetch(`${baseUrl}/api/events`);
  const dbEvents = await dbResponse.json();
  console.log(`   Total events in DB: ${dbEvents.length}\n`);
  
  // Analyze why events might be filtered out
  console.log('🔍 Common Reasons for Low Event Count:\n');
  console.log('1. LLM Classification:');
  console.log('   - LLM might classify events with interests not in your list');
  console.log('   - Solution: Check terminal logs for "[CLASSIFIER]" to see what\'s being classified\n');
  
  console.log('2. Interest Filtering:');
  console.log('   - Events are filtered to ONLY match your selected interests');
  console.log('   - If LLM classifies "Dance Show" as "Theater & Dance" but you only selected "Visual Arts", it\'s filtered out');
  console.log('   - Solution: Select more interests in your profile\n');
  
  console.log('3. Comedy Filtering:');
  console.log('   - Comedy events are aggressively filtered unless "Comedy Shows" is selected');
  console.log('   - Solution: Add "Comedy Shows" to your interests if you want comedy\n');
  
  console.log('4. Deduplication:');
  console.log('   - Events with same title+date+location are deduplicated');
  console.log('   - Interacted events (saved/dismissed) are filtered out\n');
  
  console.log('5. Scraping Failures:');
  console.log(`   - ${failedScrapes} sites failed to scrape`);
  console.log('   - Slow sites timeout after 12 seconds\n');
  
  console.log('💡 Recommendations:\n');
  if (data.events?.length < 10) {
    console.log('   ⚠️  Low event count detected!\n');
    console.log('   1. Check your profile interests - make sure you have 10+ selected');
    console.log('   2. Look at terminal logs for "[CLASSIFIER]" to see what interests are being assigned');
    console.log('   3. Run: npm run test:classification to verify LLM is classifying correctly');
    console.log('   4. Consider adding more broad interests like "Workshops", "Lectures", "Meetups"\n');
  } else {
    console.log('   ✅ Good event count! Pipeline is working well.\n');
  }
  
  console.log('✅ Diagnostic complete\n');
}

diagnosePipeline().catch(console.error);

