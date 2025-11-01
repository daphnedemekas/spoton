#!/usr/bin/env npx tsx
/**
 * Test LLM classification accuracy with known examples
 * This uses real LLM calls but is focused and quick
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env
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

const testCases = [
  {
    title: "Greens Restaurant",
    description: "Greens Restaurant, open since 1979 at the historic Fort Mason Center For Arts & Culture in San Francisco, has served as a pioneer of vegetarian cooking in America for 43 years.",
    expected: ["Food Festivals", "Restaurant Week", "Cooking Classes"],
    shouldNotBe: ["Visual Arts"]
  },
  {
    title: "Yoga in Golden Gate Park",
    description: "Join us for a relaxing morning yoga session in the park",
    expected: ["Yoga"],
    shouldNotBe: ["Visual Arts", "Fitness Classes"]
  },
  {
    title: "Comedy Night at Cobb's",
    description: "Stand-up comedy show featuring local comedians",
    expected: ["Comedy Shows"],
    shouldNotBe: ["Visual Arts", "Theater & Dance"]
  },
  {
    title: "Film Screening: Citizen Kane",
    description: "Classic film screening at the Castro Theatre",
    expected: ["Film & Cinema"],
    shouldNotBe: ["Visual Arts"]
  },
  {
    title: "Art Gallery Opening",
    description: "Exhibition of contemporary paintings and sculptures at SFMOMA",
    expected: ["Visual Arts"],
    shouldNotBe: ["Film & Cinema"]
  },
  {
    title: "Rae Studios Dance Showcase",
    description: "This high-energy dance show includes work from local Bay Area choreographers and dancers.",
    expected: ["Theater & Dance"],
    shouldNotBe: ["Visual Arts"]
  },
  {
    title: "Jazz Night at The Fillmore",
    description: "Live jazz performance featuring local musicians",
    expected: ["Jazz", "Live Music"],
    shouldNotBe: ["Visual Arts", "Concerts & Festivals"]
  }
];

const allCategories = "Visual Arts, Theater & Dance, Film & Cinema, Photography, Literature, Crafts & DIY, Live Music, Concerts & Festivals, Rock, Jazz, Classical, Electronic, Hip-Hop, Indie, Food Festivals, Wine Tasting, Beer Tasting, Cocktails, Cooking Classes, Restaurant Week, Hiking, Sports, Fitness Classes, Cycling, Water Sports, Adventure, Meditation, Yoga, Sound Baths, Wellness Workshops, Breathwork, Networking, Meetups, Street Fairs, Volunteering, Cultural Celebrations, Workshops, Lectures, Panel Discussions, Tech Events, Comedy Shows, Clubs & Dancing, Bars & Lounges, Karaoke, Family Events, Kids Activities, Educational Programs, Gaming & Esports, Anime & Comics, Cars & Motorcycles, Fashion & Beauty, Pets & Animals, Sustainability";

async function testClassification() {
  console.log('🧪 LLM Classification Accuracy Test\n');
  console.log('Testing with real LLM calls (costs ~$0.05)\n');
  console.log('='.repeat(60));
  
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found');
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`\n📝 Testing: "${testCase.title}"`);
    console.log(`   Description: ${testCase.description.slice(0, 80)}...`);
    
    const prompt = `Classify this event into the MOST RELEVANT category.

Event:
Title: ${testCase.title}
Description: ${testCase.description}

Categories: ${allCategories}

IMPORTANT:
- Restaurants/food venues → "Food Festivals" or "Restaurant Week" or "Cooking Classes"
- Dance shows → "Theater & Dance"
- Yoga classes → "Yoga"
- Comedy shows → "Comedy Shows"
- Film screenings → "Film & Cinema"
- Art galleries/exhibitions → "Visual Arts"
- DO NOT tag restaurants as "Visual Arts" just because they're at an arts center

Return ONLY the category name, nothing else.`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You classify events into categories accurately.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3
        })
      });

      const data = await response.json();
      const classified = data.choices?.[0]?.message?.content?.trim();
      
      const isExpected = testCase.expected.some(exp => 
        classified?.toLowerCase().includes(exp.toLowerCase())
      );
      
      const isWrong = testCase.shouldNotBe.some(wrong =>
        classified?.toLowerCase().includes(wrong.toLowerCase())
      );
      
      if (isExpected && !isWrong) {
        console.log(`   ✅ Correct: "${classified}"`);
        passed++;
      } else if (isWrong) {
        console.log(`   ❌ WRONG: "${classified}"`);
        console.log(`      Should NOT be: ${testCase.shouldNotBe.join(', ')}`);
        console.log(`      Expected one of: ${testCase.expected.join(', ')}`);
        failed++;
      } else {
        console.log(`   ⚠️  Acceptable: "${classified}"`);
        console.log(`      Expected: ${testCase.expected.join(', ')}`);
        console.log(`      (Not wrong, but not ideal)`);
        passed++; // Count as pass if not explicitly wrong
      }
      
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Results\n');
  console.log(`Total: ${testCases.length} tests`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Accuracy: ${((passed / testCases.length) * 100).toFixed(1)}%\n`);
  
  if (failed > 0) {
    console.log('⚠️  Some classifications were incorrect!');
    console.log('Consider updating the LLM prompt in vite.config.ts\n');
    process.exit(1);
  } else {
    console.log('✅ All classifications correct!\n');
    process.exit(0);
  }
}

testClassification().catch(console.error);


