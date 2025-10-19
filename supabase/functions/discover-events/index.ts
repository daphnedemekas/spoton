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

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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
                // Filter for actual event listing pages
                if (result.url && !result.url.includes('facebook.com') && !result.url.includes('twitter.com')) {
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

    // Combine Gemini and Brave suggestions and RANDOMIZE
    const allAvailableWebsites = [
      ...suggestedWebsites.websites,
      ...braveWebsites
    ];
    
    // Remove duplicates by URL
    const uniqueWebsites = Array.from(
      new Map(allAvailableWebsites.map(w => [w.url, w])).values()
    );
    
    // Shuffle and take up to 30 websites (more coverage per interest)
    const shuffled = uniqueWebsites.sort(() => Math.random() - 0.5);
    const allWebsites = shuffled.slice(0, 30);
    
    console.log(`Selected ${allWebsites.length} random websites from ${uniqueWebsites.length} unique sites (${allAvailableWebsites.length} total with duplicates)`);

    // Step 2: Scrape websites in parallel with concurrency limit
    console.log(`Scraping ${allWebsites.length} websites with parallel processing...`);
    const allScrapedData: any[] = [];
    const scrapingStatus: any[] = [];
    
    // Parallel scraping helper with concurrency limit
    const CONCURRENCY_LIMIT = 5;
    
    const scrapeWebsite = async (website: any) => {
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
          allScrapedData.push({
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
    
    // Process in batches with concurrency limit
    for (let i = 0; i < allWebsites.length; i += CONCURRENCY_LIMIT) {
      const batch = allWebsites.slice(i, i + CONCURRENCY_LIMIT);
      console.log(`Processing batch ${Math.floor(i / CONCURRENCY_LIMIT) + 1}/${Math.ceil(allWebsites.length / CONCURRENCY_LIMIT)}`);
      await Promise.all(batch.map(website => scrapeWebsite(website)));
    }

    console.log(`Total pages scraped: ${allScrapedData.length}`);

    if (allScrapedData.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Failed to scrape event platforms. Please try again.',
          eventsCount: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Step 3: Use Gemini to process and extract structured events
    // Vary the prompt slightly for different results each time
    const promptVariations = [
      'Extract upcoming events that match user preferences with specific dates and locations.',
      'Find exciting local events happening soon that align with user interests.',
      'Discover unique activities and events in the area for the coming week.',
      'Identify interesting upcoming events from the scraped content.'
    ];
    const extractionPrompt = promptVariations[Math.floor(Math.random() * promptVariations.length)];
    
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
            content: `You are an event extraction and ranking assistant. Parse HTML from various event platforms and extract REAL upcoming events with EXACT URLs. For each event, assign a relevance score (0-100) based on how well it matches the user's preferences.

SCORING CRITERIA (total 100 points):
- Interest Match (25 points): How many user interests align with the event
- Vibe Match (20 points): How well the event atmosphere matches user vibes
- Location Match (25 points): Events in ${city} get full points, nearby cities get partial, virtual/online get 0
- In-Person Bonus (15 points): In-person events get full points, virtual/online get 0
- Interaction History (10 points): Boost similar to saved events, downrank similar to removed events
- Date Proximity (5 points): Events sooner get higher scores

Return events sorted by score (highest first).`
          },
          {
            role: 'user',
            content: `Here is scraped HTML content from event platforms in ${city}:

${allScrapedData.map((data: any, i: number) => `[Source ${i + 1}: ${data.source} - ${data.interest}]
URL: ${data.url}
HTML Content:
${data.content}
---`).join('\n\n')}

Extract 15-20 unique upcoming events happening between ${today} and ${nextWeek}. ${extractionPrompt}

User preferences:
- Interests: ${userInterests}
- Vibes: ${userVibes}
${interactionContext}

REQUIREMENTS:
1. Extract SPECIFIC event page URLs from the HTML (not listing pages)
2. Parse event titles, dates, descriptions, and locations from the HTML
3. Identify if event is in-person or virtual/online - prefer in-person events
4. Check if event location is in ${city} - prioritize local events
5. Remove duplicate events (same URL or same title/venue/date)
6. Only include events with specific dates between ${today} and ${nextWeek}
7. Format dates as YYYY-MM-DD
8. Calculate relevance_score (0-100) for each event:
   - Give high scores to in-person events in ${city} that match user interests
   - Give lower scores to virtual/online events or events outside ${city}
   - Consider interaction history to boost/downrank events
9. Sort events by relevance_score (highest first)
10. Extract detailed descriptions (at least 2-3 sentences)
11. Include specific venue names and addresses in location field
12. Ensure each URL is a direct link to a specific event page, not a listing page

Return events using the return_events function.`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_events",
              description: "Return discovered events in structured format",
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
                        location: { type: "string" },
                        event_link: { type: "string" },
                        interests: { type: "array", items: { type: "string" } },
                        vibes: { type: "array", items: { type: "string" } },
                        relevance_score: { type: "number", description: "Score from 0-100 based on user preference match" }
                      },
                      required: ["title", "description", "date", "location", "event_link", "interests", "vibes", "relevance_score"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["events"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "return_events" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error('Failed to discover events');
    }

    const data = await response.json();
    console.log('AI response:', JSON.stringify(data, null, 2));

    // Extract events from tool call
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No events returned from AI');
    }

    const eventsData = typeof toolCall.function.arguments === 'string' 
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

    // Helper function to verify URL accessibility
    const verifyUrl = async (url: string): Promise<boolean> => {
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          headers: { 'User-Agent': 'Mozilla/5.0' },
          redirect: 'follow',
          signal: AbortSignal.timeout(5000)
        });
        return response.ok;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(`URL verification failed for ${url}: ${errorMessage}`);
        return false;
      }
    };

    // Filter and validate events with URL verification
    const validatedEvents = [];
    for (const event of eventsData.events) {
      // Validate URL format
      const hasValidLink = event.event_link && 
        typeof event.event_link === 'string' && 
        (event.event_link.startsWith('http://') || event.event_link.startsWith('https://')) &&
        event.event_link.length > 10 &&
        !event.event_link.includes('example.com') &&
        !event.event_link.includes('placeholder') &&
        event.event_link.includes('.');
      
      const hasValidDate = event.date && 
        typeof event.date === 'string' && 
        /^\d{4}-\d{2}-\d{2}$/.test(event.date);
      
      if (!hasValidLink) {
        console.log(`Skipping event "${event.title}" - invalid or placeholder link: ${event.event_link}`);
        continue;
      }
      if (!hasValidDate) {
        console.log(`Skipping event "${event.title}" - invalid date format: ${event.date}`);
        continue;
      }

      // Verify URL actually works
      const isWorking = await verifyUrl(event.event_link);
      if (!isWorking) {
        console.log(`Skipping event "${event.title}" - URL not accessible: ${event.event_link}`);
        continue;
      }

      validatedEvents.push(event);
    }

    console.log(`${validatedEvents.length} events passed validation and URL verification`);

    // If less than 5 valid events, retry once
    let finalEvents = validatedEvents;
    if (finalEvents.length < 5) {
      console.log('Too few valid events, retrying with stricter instructions...');
      
      const retryResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
              content: `You are an event discovery assistant. CRITICAL: Only return events with VERIFIED, ACCESSIBLE, SPECIFIC event page URLs. DO NOT use general venue URLs ending in /events/ or /whats-on/.`
            },
            {
              role: 'user',
              content: `Find ${10 - finalEvents.length} upcoming events in ${city} between ${today} and ${nextWeek} with SPECIFIC event page URLs (not general /events/ pages).

Interests: ${userInterests}
Vibes: ${userVibes}

Each URL must link to a SPECIFIC event page with details, dates, and registration.`
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
                          location: { type: "string" },
                          vibes: { type: "array", items: { type: "string" } },
                          interests: { type: "array", items: { type: "string" } },
                          event_link: { type: "string" }
                        },
                        required: ["title", "description", "date", "location", "vibes", "interests", "event_link"]
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

      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        const retryToolCall = retryData.choices[0]?.message?.tool_calls?.[0];
        
        if (retryToolCall?.function?.name === 'return_events') {
          const retryEventsData = JSON.parse(retryToolCall.function.arguments);
          
          for (const event of retryEventsData.events) {
            const url = event.event_link?.trim();
            if (!url || !url.startsWith('http')) continue;
            
            const isWorking = await verifyUrl(url);
            if (isWorking) {
              finalEvents.push(event);
              console.log(`Retry success: "${event.title}" with working URL`);
            }
          }
        }
      }
      
      console.log(`After retry: ${finalEvents.length} total valid events`);
    }

    const validEvents = finalEvents;

    if (validEvents.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'No valid events found. The AI could not find events with valid URLs. Please try again or adjust your preferences.',
          eventsCount: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Smart event updates: only insert new events, keep existing ones
    console.log('Fetching existing events for smart updates...');
    const { data: existingEvents } = await supabaseClient
      .from('events')
      .select('title, date, location, event_link');

    // Create a Set of existing event signatures for fast lookup
    const existingSignatures = new Set(
      (existingEvents || []).map(e => 
        `${e.title.toLowerCase().trim()}|${e.date}|${e.location.toLowerCase().trim()}`
      )
    );

    // Filter out events that already exist
    const newEvents = validEvents.filter((event: any) => {
      const signature = `${event.title.toLowerCase().trim()}|${event.date}|${event.location.toLowerCase().trim()}`;
      return !existingSignatures.has(signature);
    });

    console.log(`Found ${newEvents.length} new events out of ${validEvents.length} total (${existingEvents?.length || 0} already exist)`);

    if (newEvents.length === 0) {
      console.log('No new events to insert');
      return new Response(
        JSON.stringify({ 
          success: true, 
          eventsCount: 0,
          existingCount: existingEvents?.length || 0,
          message: 'All discovered events already exist in database',
          scrapingStatus: scrapingStatus
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert only new events
    const eventsToInsert = newEvents.map((event: any) => ({
      title: event.title,
      description: event.description,
      date: event.date,
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
      throw insertError;
    }

    console.log('Successfully inserted', insertedEvents?.length, 'new events');

    return new Response(
      JSON.stringify({ 
        success: true, 
        eventsCount: insertedEvents?.length || 0,
        existingCount: existingEvents?.length || 0,
        totalEvents: (existingEvents?.length || 0) + (insertedEvents?.length || 0),
        message: `Added ${insertedEvents?.length || 0} new events in ${city}`,
        scrapingStatus: scrapingStatus
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