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

    // Use Lovable AI with web search to find real events
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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
            content: `You are an event discovery assistant. Your job is to find REAL upcoming events from actual event sources on the web. Always search for and return events with VALID, WORKING URLs. Return events in the specified JSON format using the return_events function.`
          },
          {
            role: 'user',
            content: `Find 8-10 upcoming events in ${city} happening between ${today} and ${nextWeek}.

Search for events matching these interests: ${userInterests}
And these vibes: ${userVibes}
${interactionContext}

CRITICAL URL REQUIREMENTS - READ CAREFULLY:
1. For EACH event, provide a REAL, SPECIFIC event page URL using these exact formats:
   
   EVENTBRITE: https://www.eventbrite.com/e/[specific-event-name]-tickets-[actual-number-id]
   Example: https://www.eventbrite.com/e/tech-meetup-ai-showcase-tickets-123456789
   
   MEETUP: https://www.meetup.com/[group-slug]/events/[actual-event-id]/
   Example: https://www.meetup.com/sf-tech-community/events/298765432/
   
   FACEBOOK: https://www.facebook.com/events/[actual-event-id]
   Example: https://www.facebook.com/events/987654321012345
   
   VENUE SITES: https://[venue-domain]/events/[specific-event-page]
   Example: https://www.sfmoma.org/events/friday-nights-march-2025/

2. CRITICAL: Each URL must have a REAL event ID or specific event slug
   - NEVER use generic paths like /events/ or /calendar/
   - NEVER use placeholder IDs like 123 or xxx
   - Each URL must point to ONE specific event page

3. If you cannot construct a properly formatted URL with real-looking IDs, DO NOT include that event

4. Prioritize Eventbrite and Meetup - they have the most consistent URL structures

5. Use interaction history to personalize:
   - Find MORE events similar to saved ones
   - AVOID events similar to removed ones

Return events using the return_events function with valid URLs.`
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
                        vibes: { type: "array", items: { type: "string" } }
                      },
                      required: ["title", "description", "date", "location", "event_link", "interests", "vibes"],
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