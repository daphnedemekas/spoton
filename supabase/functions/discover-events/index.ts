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
    const { userId } = await req.json();
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

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

    const userInterests = interests.map(i => i.interest).join(', ');
    const userVibes = vibes.map(v => v.vibe).join(', ');
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

    // Get API key
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Step 1: Ask Gemini for best websites to scrape based on interests
    const interestsList = interests.slice(0, 4).map(i => i.interest);
    
    console.log('Asking Gemini for website suggestions...');
    
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
            content: `You are an event and activity discovery expert. Given user interests and a city, suggest the best websites to scrape for relevant events, activities, and experiences.`
          },
          {
            role: 'user',
            content: `City: ${city}
Interests: ${interestsList.join(', ')}

Suggest up to 50 specific URLs to scrape for these interests in ${city}. Think broadly - not just event platforms, but ANY website that would have relevant activities or opportunities:

EXAMPLES of what to include:
- Event platforms (Eventbrite, local event calendars)
- Venue websites (music venues, theaters, galleries, comedy clubs)
- Activity-specific sites (yoga studios, meditation centers, climbing gyms, makerspaces)
- Outdoor recreation (AllTrails, park websites, hiking groups)
- Community centers and libraries
- Meetup alternatives and local groups
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

    const suggestedWebsites = typeof websiteToolCall.function.arguments === 'string' 
      ? JSON.parse(websiteToolCall.function.arguments)
      : websiteToolCall.function.arguments;

    console.log(`Gemini suggested ${suggestedWebsites.websites.length} websites to scrape`);

    // Step 2: Scrape the suggested websites
    const allScrapedData: any[] = [];
    
    // Step 2a: Scrape standard platforms (Eventbrite, Ticketmaster, Eventful)
    console.log('Scraping standard event platforms...');
    
    // Scrape Eventbrite
    for (const interest of interestsList) {
      const eventbriteUrl = `https://www.eventbrite.com/d/${city.toLowerCase().replace(/\s+/g, '-')}/events--${interest.toLowerCase().replace(/\s+/g, '-')}/`;
      console.log('Scraping Eventbrite:', eventbriteUrl);
      
      try {
        const response = await fetch(eventbriteUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          signal: AbortSignal.timeout(10000)
        });
        
        if (response.ok) {
          const html = await response.text();
          allScrapedData.push({
            source: 'eventbrite',
            interest,
            url: eventbriteUrl,
            content: html.substring(0, 50000)
          });
          console.log(`Scraped Eventbrite for ${interest}`);
        }
      } catch (error) {
        console.log(`Failed to scrape Eventbrite for ${interest}:`, error);
      }
    }
    
    // Scrape Ticketmaster
    for (const interest of interestsList.slice(0, 2)) {
      const ticketmasterUrl = `https://www.ticketmaster.com/search?q=${encodeURIComponent(interest + ' ' + city)}`;
      console.log('Scraping Ticketmaster:', ticketmasterUrl);
      
      try {
        const response = await fetch(ticketmasterUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          signal: AbortSignal.timeout(10000)
        });
        
        if (response.ok) {
          const html = await response.text();
          allScrapedData.push({
            source: 'ticketmaster',
            interest,
            url: ticketmasterUrl,
            content: html.substring(0, 50000)
          });
          console.log(`Scraped Ticketmaster for ${interest}`);
        }
      } catch (error) {
        console.log(`Failed to scrape Ticketmaster for ${interest}:`, error);
      }
    }

    // Scrape Eventful
    const eventfulUrl = `https://eventful.com/events?l=${encodeURIComponent(city)}`;
    console.log('Scraping Eventful:', eventfulUrl);
    
    try {
      const response = await fetch(eventfulUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(10000)
      });
      
      if (response.ok) {
        const html = await response.text();
        allScrapedData.push({
          source: 'eventful',
          interest: 'general',
          url: eventfulUrl,
          content: html.substring(0, 50000)
        });
        console.log('Scraped Eventful');
      }
    } catch (error) {
      console.log('Failed to scrape Eventful:', error);
    }

    // Step 2b: Scrape Gemini-suggested websites
    console.log('Scraping Gemini-suggested websites...');
    
    for (const website of suggestedWebsites.websites) {
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
          console.log(`Successfully scraped ${website.source} for ${website.interest}`);
        }
      } catch (error) {
        console.log(`Failed to scrape ${website.url}:`, error);
      }
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

Extract 15-20 unique upcoming events happening between ${today} and ${nextWeek}.

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

    // Clear all old events first
    const { error: deleteError } = await supabaseClient
      .from('events')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

    if (deleteError) {
      console.error('Error deleting old events:', deleteError);
      // Continue anyway - we still want to insert new events
    } else {
      console.log('Successfully cleared old events');
    }

    // Insert new events into database
    const eventsToInsert = validEvents.map((event: any) => ({
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

    console.log('Successfully inserted', insertedEvents?.length, 'events');

    return new Response(
      JSON.stringify({ 
        success: true, 
        eventsCount: insertedEvents?.length || 0,
        message: `Discovered ${insertedEvents?.length || 0} events in ${city}`
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