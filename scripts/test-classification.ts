#!/usr/bin/env tsx
/**
 * Test script to verify LLM event classification
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

const testEvents = [
  {
    title: "Jazz Concert at The Fillmore",
    description: "Live jazz performance featuring local musicians",
    expected: ["Jazz", "Live Music", "Concerts & Festivals"]
  },
  {
    title: "Rae Studios Presents: 2025 Fall Showcase",
    description: "This high-energy dance show includes work from local Bay Area choreographers and dancers.",
    expected: ["Theater & Dance"]
  },
  {
    title: "Free Rooftop Yoga",
    description: "Join us for a relaxing yoga session on the rooftop",
    expected: ["Yoga"]
  },
  {
    title: "Comedy Night at Cobb's",
    description: "Stand-up comedy show featuring local comedians",
    expected: ["Comedy Shows"]
  },
  {
    title: "Art Gallery Opening",
    description: "Exhibition of contemporary paintings and sculptures",
    expected: ["Visual Arts"]
  },
  {
    title: "Film Screening: Citizen Kane",
    description: "Classic film screening at the Castro Theatre",
    expected: ["Film & Cinema"]
  },
  {
    title: "Electronic Music Festival",
    description: "All-day DJ sets and electronic music performances",
    expected: ["Electronic", "Concerts & Festivals", "Live Music"]
  }
];

const allInterestCategories = "Visual Arts, Theater & Dance, Film & Cinema, Photography, Literature, Crafts & DIY, Live Music, Concerts & Festivals, Rock, Jazz, Classical, Electronic, Hip-Hop, Indie, Food Festivals, Wine Tasting, Beer Tasting, Cocktails, Cooking Classes, Restaurant Week, Hiking, Sports, Fitness Classes, Cycling, Water Sports, Adventure, Meditation, Yoga, Sound Baths, Wellness Workshops, Breathwork, Networking, Meetups, Street Fairs, Volunteering, Cultural Celebrations, Workshops, Lectures, Panel Discussions, Tech Events, Comedy Shows, Clubs & Dancing, Bars & Lounges, Karaoke, Family Events, Kids Activities, Educational Programs, Gaming & Esports, Anime & Comics, Cars & Motorcycles, Fashion & Beauty, Pets & Animals, Sustainability";

async function testClassification() {
  console.log('🧪 Testing LLM Event Classification\n');
  
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in environment');
    process.exit(1);
  }

  for (const event of testEvents) {
    console.log(`\n📝 Testing: "${event.title}"`);
    console.log(`   Description: ${event.description}`);
    console.log(`   Expected: ${event.expected.join(' OR ')}`);
    
    const prompt = `Classify this event into the MOST RELEVANT category from this list: ${allInterestCategories}

Event:
Title: ${event.title}
Description: ${event.description}

Rules:
- Dance/choreography/ballet → "Theater & Dance"
- Yoga/meditation → "Yoga" or "Meditation"
- Comedy/stand-up → "Comedy Shows"
- Film/movie/screening → "Film & Cinema"
- Concert/band/DJ → "Live Music" or specific genre (Jazz, Electronic, etc.) or "Concerts & Festivals"
- Art gallery/exhibition/painting → "Visual Arts"
- DO NOT default to "Visual Arts" for non-art events

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
            { role: 'system', content: 'You are an expert at classifying events into categories.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3
        })
      });

      const data = await response.json();
      const classified = data.choices?.[0]?.message?.content?.trim();
      
      const isCorrect = event.expected.some(exp => 
        classified?.toLowerCase().includes(exp.toLowerCase())
      );
      
      if (isCorrect) {
        console.log(`   ✅ Result: "${classified}"`);
      } else {
        console.log(`   ❌ Result: "${classified}" (expected one of: ${event.expected.join(', ')})`);
      }
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n✅ Classification test complete\n');
}

testClassification().catch(console.error);

