import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract user ID from JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }
    
    const userId = user.id;

    // Get user profile and preferences
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('city')
      .eq('id', userId)
      .single();

    const { data: interests } = await supabaseClient
      .from('user_interests')
      .select('interest')
      .eq('user_id', userId);

    const { data: vibes } = await supabaseClient
      .from('user_vibes')
      .select('vibe')
      .eq('user_id', userId);

    // Get interaction history for personalization
    const { data: interactions } = await supabaseClient
      .from('event_interactions')
      .select('event_title, event_description, interaction_type')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!profile || !interests || !vibes) {
      throw new Error('User profile not found');
    }

    // Prioritize wellness interests (always include yoga, meditation, etc.)
    const allInterests = interests.map(i => i.interest);
    const wellnessInterests = allInterests.filter(i => 
      ['Yoga', 'Meditation', 'Sound Baths', 'Breathwork', 'Fitness Classes'].includes(i)
    );
    const otherInterests = allInterests.filter(i => 
      !['Yoga', 'Meditation', 'Sound Baths', 'Breathwork', 'Fitness Classes'].includes(i)
    );
    
    // Shuffle only the non-wellness interests for variety
    const shuffledOthers = otherInterests.sort(() => Math.random() - 0.5);
    
    // Combine: wellness interests first, then shuffled others
    const shuffledInterests = [...wellnessInterests, ...shuffledOthers];
    const shuffledVibes = vibes.map(v => v.vibe).sort(() => Math.random() - 0.5);
    
    const userInterests = shuffledInterests.join(', ');
    const userVibes = shuffledVibes.join(', ');
    const city = profile.city;

    // Build interaction context
    const savedEvents = interactions?.filter(i => i.interaction_type === 'saved') || [];
    const removedEvents = interactions?.filter(i => i.interaction_type === 'removed') || [];
    
    let interactionContext = '';
    if (savedEvents.length > 0) {
      interactionContext += `\n\nEvents the user has SAVED (they liked these):\n${savedEvents.map(e => `- ${e.event_title}: ${e.event_description}`).join('\n')}`;
    }
    if (removedEvents.length > 0) {
      interactionContext += `\n\nEvents the user REMOVED (they didn't like these):\n${removedEvents.map(e => `- ${e.event_title}: ${e.event_description}`).join('\n')}`;
    }

    console.log('Searching for events in:', city);
    console.log('User interests:', userInterests);
    console.log('User vibes:', userVibes);

    // Get API keys
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const BRAVE_API_KEY = Deno.env.get('BRAVE_SEARCH_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    
    // Generate array of next 7 days for day-by-day searching
    const searchDays = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      return {
        date: date.toISOString().split('T')[0],
        dayName: date.toLocaleDateString('en-US', { weekday: 'long' }),
        monthDay: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      };
    });

    // Step 1: Check for cached website suggestions
    const interestsList = shuffledInterests; // Use shuffled interests
    
    console.log('Checking for cached website suggestions...');
    
    const { data: cachedSuggestions } = await supabaseClient
      .from('website_suggestions')
      .select('websites, created_at')
      .eq('city', city)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let suggestedWebsites;

    // Use cache if less than 7 days old, otherwise fetch new suggestions
    const cacheMaxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    const isCacheValid = cachedSuggestions && 
      (new Date().getTime() - new Date(cachedSuggestions.created_at).getTime()) < cacheMaxAge;

    if (isCacheValid) {
      console.log('Using cached website suggestions');
      suggestedWebsites = cachedSuggestions.websites;
    } else {
      console.log('Fetching new website suggestions from Gemini...');
      
      const websiteSuggestionResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content: `You are an event and activity discovery expert. Given user interests and a city, suggest the best websites to scrape for relevant events, activities, and experiences. Focus on variety and lesser-known local venues. IMPORTANT: Always include specific venues for wellness activities like yoga studios, meditation centers, sound healing spaces, and fitness studios when those interests are mentioned.`
            },
            {
              role: 'user',
              content: `City: ${city}
Interests: ${interestsList.join(', ')}

Suggest up to 15 specific URLs to scrape for these interests in ${city}. Think broadly - not just event platforms, but ANY website that would have relevant activities or opportunities:

EXAMPLES of what to include:
- Event platforms (Eventbrite, local event calendars, Meetup)
- Venue websites (music venues, theaters, galleries, comedy clubs)
- Activity-specific sites (yoga studios, meditation centers, climbing gyms)
- Outdoor recreation (AllTrails, park websites, hiking groups)
- Community centers and libraries
- Festival and market calendars
- Sports leagues and recreational programs
- Workshop and class providers

Return actual scrapable URLs that would list current/upcoming activities, not just homepages. Be specific and creative based on the user's interests.`
            }
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "suggest_websites",
                description: "Return website URLs to scrape",
                parameters: {
                  type: "object",
                  properties: {
                    websites: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          url: { type: "string" },
                          source: { type: "string" },
                          interest: { type: "string" }
                        },
                        required: ["url", "source", "interest"]
                      }
                    }
                  },
                  required: ["websites"]
                }
              }
            }
          ],
          tool_choice: { type: "function", function: { name: "suggest_websites" } }
        }),
      });

      if (!websiteSuggestionResponse.ok) {
        console.error('Failed to get website suggestions');
        throw new Error('Failed to get website suggestions');
      }

      const websiteData = await websiteSuggestionResponse.json();
      const websiteToolCall = websiteData.choices?.[0]?.message?.tool_calls?.[0];
      
      if (!websiteToolCall) {
        throw new Error('No website suggestions returned');
      }

      suggestedWebsites = typeof websiteToolCall.function.arguments === 'string' 
        ? JSON.parse(websiteToolCall.function.arguments)
        : websiteToolCall.function.arguments;

      console.log(`Gemini suggested ${suggestedWebsites.websites.length} websites to scrape`);

      // Cache the suggestions
      await supabaseClient
        .from('website_suggestions')
        .upsert({
          city,
          interests: interestsList,
          websites: suggestedWebsites
        });
      
      console.log('Cached website suggestions for future use');
    }

    // Step 1b: Use Brave Search API to find additional event sites
    const braveWebsites: any[] = [];
    if (BRAVE_API_KEY) {
      console.log('Using Brave Search to find event sites...');
      
      // Search for ALL user interests
      const searchInterests = shuffledInterests;
      console.log('Searching Brave for all interests:', searchInterests.join(', '));
      
      for (const interest of searchInterests) {
        try {
          // Do 2 different searches per interest for more variety
          const queryStyles = [
            `${interest} events ${city} site:*.com OR site:*.org`,
            `upcoming ${interest} ${city} calendar`,
            `${interest} activities near ${city}`,
            `${city} ${interest} schedule`
          ];
          
          // Pick 2 different query styles for each interest
          const queries = [
            queryStyles[Math.floor(Math.random() * queryStyles.length)],
            queryStyles[Math.floor(Math.random() * queryStyles.length)]
          ];
          
          for (const searchQuery of queries) {
            const braveResponse = await fetch(
              `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchQuery)}&count=5`,
              {
                headers: {
                  'Accept': 'application/json',
                  'X-Subscription-Token': BRAVE_API_KEY
                }
              }
            );

            if (braveResponse.ok) {
              const braveData = await braveResponse.json();
              const results = braveData.web?.results || [];
              
              for (const result of results) {
                // Only filter out Meetup
                if (result.url && !result.url.includes('meetup.com')) {
                  braveWebsites.push({
                    url: result.url,
                    source: `Brave: ${result.title?.substring(0, 30) || 'Event Site'}`,
                    interest: interest
                  });
                }
              }
              console.log(`Brave found ${results.length} sites for "${interest}" with query: ${searchQuery}`);
            }
          }
        } catch (error) {
          console.log(`Brave search failed for ${interest}:`, error);
        }
      }
      
      console.log(`Brave Search suggested ${braveWebsites.length} total websites`);
    }

    // Combine and shuffle websites
    const allAvailableWebsites = [
      ...suggestedWebsites.websites,
      ...braveWebsites
    ];
    
    const uniqueWebsites = Array.from(
      new Map(allAvailableWebsites.map(w => [w.url, w])).values()
    );
    
    const shuffled = uniqueWebsites.sort(() => Math.random() - 0.5);
    
    // Split into priority (first 8) and background (rest)
    const priorityWebsites = shuffled.slice(0, 8);
    const backgroundWebsites = shuffled.slice(8, 40);
    
    console.log(`Priority batch: ${priorityWebsites.length} websites`);
    console.log(`Background batch: ${backgroundWebsites.length} websites`);

    // Scraping function
    const scrapingStatus: any[] = [];
    
    const scrapeWebsite = async (website: any, dataArray: any[]) => {
      console.log(`Scraping: ${website.url}`);
      
      try {
        const response = await fetch(website.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          signal: AbortSignal.timeout(10000)
        });
        
        if (response.ok) {
          const html = await response.text();
          dataArray.push({
            source: website.source,
            interest: website.interest,
            url: website.url,
            content: html.substring(0, 50000)
          });
          scrapingStatus.push({ url: website.url, source: website.source, interest: website.interest, status: 'success' });
          console.log(`Successfully scraped ${website.source} for ${website.interest}`);
        }
      } catch (error) {
        console.log(`Failed to scrape ${website.url}:`, error);
        scrapingStatus.push({ url: website.url, source: website.source, interest: website.interest, status: 'failed' });
      }
    };

    // Scrape priority websites first
    const priorityScrapedData: any[] = [];
    await Promise.all(priorityWebsites.map(website => scrapeWebsite(website, priorityScrapedData)));
    
    console.log(`Priority batch scraped: ${priorityScrapedData.length} pages`);

    if (priorityScrapedData.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Failed to scrape event platforms. Please try again.',
          eventsCount: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Process priority events and return immediately
    const priorityEvents = await processEventsFromScrapedData(
      priorityScrapedData,
      {
        city,
        userInterests,
        userVibes,
        interactionContext,
        today,
        currentYear,
        currentMonth,
        currentDay,
        LOVABLE_API_KEY: LOVABLE_API_KEY!,
        supabaseClient,
        userId
      }
    );

    // Start background processing for remaining websites
    if (backgroundWebsites.length > 0) {
      console.log(`Starting background processing for ${backgroundWebsites.length} websites`);
      
      const backgroundTask = async () => {
        const backgroundScrapedData: any[] = [];
        
        // Scrape background websites
        const CONCURRENCY_LIMIT = 10;
        for (let i = 0; i < backgroundWebsites.length; i += CONCURRENCY_LIMIT) {
          const batch = backgroundWebsites.slice(i, i + CONCURRENCY_LIMIT);
          await Promise.all(batch.map(website => scrapeWebsite(website, backgroundScrapedData)));
        }
        
        console.log(`Background batch scraped: ${backgroundScrapedData.length} pages`);
        
        if (backgroundScrapedData.length > 0) {
          await processEventsFromScrapedData(
            backgroundScrapedData,
            {
              city,
              userInterests,
              userVibes,
              interactionContext,
              today,
              currentYear,
              currentMonth,
              currentDay,
              LOVABLE_API_KEY: LOVABLE_API_KEY!,
              supabaseClient,
              userId,
              isBackground: true
            }
          );
          console.log('Background event processing complete');
        }
      };
      
      // Start background task (don't await)
      backgroundTask().catch(err => console.error('Background task error:', err));
    }

    // Return priority events immediately
    const { data: existingEvents } = await supabaseClient
      .from('events')
      .select('title');

    return new Response(
      JSON.stringify({ 
        success: true, 
        eventsCount: priorityEvents,
        existingCount: existingEvents?.length || 0,
        totalEvents: (existingEvents?.length || 0) + priorityEvents,
        message: `Added ${priorityEvents} new events in ${city}`,
        scrapingStatus: scrapingStatus,
        backgroundProcessing: backgroundWebsites.length > 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in discover-events function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to discover events' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

// Helper function to process scraped data and insert events
async function processEventsFromScrapedData(
  scrapedData: any[],
  context: {
    city: string;
    userInterests: string;
    userVibes: string;
    interactionContext: string;
    today: string;
    currentYear: number;
    currentMonth: number;
    currentDay: number;
    LOVABLE_API_KEY: string;
    supabaseClient: any;
    userId: string;
    isBackground?: boolean;
  }
): Promise<number> {
  const {
    city,
    userInterests,
    userVibes,
    interactionContext,
    today,
    currentYear,
    currentMonth,
    currentDay,
    LOVABLE_API_KEY,
    supabaseClient,
    userId,
    isBackground = false
  } = context;

  const extractionPrompts = [
    'Extract upcoming events that match user preferences with specific dates and locations.',
    'Find exciting local events happening soon that align with user interests.',
    'Discover unique activities and events in the area for the coming week.',
    'Identify interesting upcoming events from the scraped content.'
  ];
  const extractionPrompt = extractionPrompts[Math.floor(Math.random() * extractionPrompts.length)];

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `You are an event extraction assistant. Extract REAL upcoming events with EXACT URLs from HTML content. Only include events in ${city} or explicitly online/virtual events.`
        },
        {
          role: 'user',
          content: `HTML content from event platforms in ${city}:

${scrapedData.map((data: any, i: number) => `[Source ${i + 1}: ${data.source} - ${data.interest}]\n${data.content.substring(0, 15000)}\n---`).join('\n\n')}

Extract 20-30 unique events in the next 7 days (from ${today}).
User interests: ${userInterests}
User vibes: ${userVibes}
${interactionContext}

CRITICAL REQUIREMENTS:
1. **ONLY** events in ${city} OR explicitly online/virtual events
2. Extract SPECIFIC event page URLs (not listing pages like /events/ or /calendar/)
3. Parse event **times** from the HTML in a readable format:
   - Examples: "7:00 PM", "2:00 PM - 4:00 PM", "6:30 PM - 9:00 PM"
   - If you see "7pm" or "19:00" convert to "7:00 PM"
   - If no specific time is found, use "All Day"
   - Look for time information in event titles, descriptions, and structured data
4. Format dates as YYYY-MM-DD (Today is ${today} which is ${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')})
5. Extract detailed descriptions (2-3 sentences minimum)
6. Include specific venue names and addresses for in-person events
7. Remove duplicate events with same URL or same title/venue/date

IMPORTANT DATE PARSING:
- If you see "Mon Dec 15" or "December 15" without a year, assume ${currentYear}
- Only extract events within 7 days from ${today}
- Double-check all dates are in YYYY-MM-DD format`
        }
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_events",
            description: "Return discovered events",
            parameters: {
              type: "object",
              properties: {
                events: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      date: { type: "string" },
                      time: { type: "string" },
                      location: { type: "string" },
                      event_link: { type: "string" },
                      interests: { type: "array", items: { type: "string" } },
                      vibes: { type: "array", items: { type: "string" } }
                    },
                    required: ["title", "description", "date", "time", "location", "event_link", "interests", "vibes"]
                  }
                }
              },
              required: ["events"]
            }
          }
        }
      ],
      tool_choice: { type: "function", function: { name: "return_events" } }
    }),
  });

  if (!response.ok) {
    console.log('AI API error:', response.status);
    return 0;
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  
  if (!toolCall) {
    return 0;
  }

  const eventsData = typeof toolCall.function.arguments === 'string' 
    ? JSON.parse(toolCall.function.arguments)
    : toolCall.function.arguments;

  // Validate events
  const validEvents = [];
  
  for (const event of eventsData.events) {
    const hasValidLink = event.event_link && 
      event.event_link.startsWith('http') &&
      event.event_link.length > 10;
    
    const hasValidDate = event.date && 
      /^\d{4}-\d{2}-\d{2}$/.test(event.date);
    
    if (hasValidLink && hasValidDate) {
      validEvents.push(event);
    }
  }

  if (validEvents.length === 0) {
    return 0;
  }

  // Check for duplicates
  const { data: existingEvents } = await supabaseClient
    .from('events')
    .select('event_link, title, date');

  const { data: removedInteractions } = await supabaseClient
    .from('event_interactions')
    .select('event_title')
    .eq('user_id', userId)
    .eq('interaction_type', 'removed');

  const existingUrls = new Set(
    (existingEvents || []).map((e: any) => e.event_link?.toLowerCase())
  );
  
  const removedTitles = new Set(
    (removedInteractions || []).map((r: any) => 
      r.event_title.toLowerCase().replace(/[^\w\s]/g, '').trim()
    )
  );

  const newEvents = validEvents.filter((event: any) => {
    const urlExists = existingUrls.has(event.event_link.toLowerCase());
    const title = event.title.toLowerCase().replace(/[^\\w\\s]/g, '').trim();
    const wasRemoved = removedTitles.has(title);
    
    return !urlExists && !wasRemoved;
  });

  console.log(`Found ${newEvents.length} new events (${isBackground ? 'background' : 'priority'})`);

  if (newEvents.length === 0) {
    return 0;
  }

  // Insert events
  const eventsToInsert = newEvents.map((event: any) => ({
    title: event.title,
    description: event.description,
    date: event.date,
    time: event.time,
    location: event.location,
    event_link: event.event_link,
    interests: event.interests,
    vibes: event.vibes,
  }));

  const { data: insertedEvents, error: insertError } = await supabaseClient
    .from('events')
    .insert(eventsToInsert)
    .select();

  if (insertError) {
    console.error('Error inserting events:', insertError);
    return 0;
  }

  console.log(`Inserted ${insertedEvents?.length || 0} events (${isBackground ? 'background' : 'priority'})`);
  return insertedEvents?.length || 0;
}
