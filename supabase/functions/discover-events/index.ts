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

    if (!profile || !interests || !vibes) {
      throw new Error('User profile not found');
    }

    const userInterests = interests.map(i => i.interest).join(', ');
    const userVibes = vibes.map(v => v.vibe).join(', ');
    const city = profile.city;

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
            content: `You are an event discovery assistant with web search capabilities. Your job is to find REAL upcoming events by searching the web and extracting actual event details including REAL image URLs from the event pages you find. You must use your web search to find events and extract their actual data.`
          },
          {
            role: 'user',
            content: `Search the web and find 8-10 REAL upcoming events in ${city} happening between ${today} and ${nextWeek}.

Target events matching these interests: ${userInterests}
Target events matching these vibes: ${userVibes}

CRITICAL INSTRUCTIONS:
1. USE WEB SEARCH to find real events from:
   - Eventbrite.com events
   - Meetup.com events  
   - Facebook Events
   - Local venue websites (concert halls, theaters, etc.)
   - City event calendars

2. For EACH event you find:
   - Extract the ACTUAL event_link from the page
   - Extract the ACTUAL image_url from the event page (look for og:image, event poster, venue photo)
   - If you cannot find a real image URL on the event page, set image_url to null
   - Extract all other event details (title, description, location, etc.)
   - CRITICAL: The date field must be a SINGLE DATE in YYYY-MM-DD format, NOT a date range
   - If an event spans multiple days, pick the first day only

3. NEVER make up or generate fake URLs - only use actual URLs you find through web search
4. Only return events that have valid event_link URLs
5. Prefer events with real image URLs, but include events without images if they're good matches

Return the events using the return_events function.`
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
                        image_url: { type: "string", nullable: true },
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

    // Filter and validate events
    const validEvents = eventsData.events
      .filter((event: any) => {
        const hasValidLink = event.event_link && 
          typeof event.event_link === 'string' && 
          event.event_link.startsWith('http');
        
        // Validate date format (must be YYYY-MM-DD, not a range)
        const hasValidDate = event.date && 
          typeof event.date === 'string' && 
          /^\d{4}-\d{2}-\d{2}$/.test(event.date);
        
        if (!hasValidLink) {
          console.log(`Skipping event "${event.title}" - missing valid event link`);
          return false;
        }
        
        if (!hasValidDate) {
          console.log(`Skipping event "${event.title}" - invalid date format: ${event.date}`);
          return false;
        }
        
        return true;
      })
      .map((event: any) => {
        // Set image_url to null if it's not a valid URL
        const hasValidImage = event.image_url && 
          typeof event.image_url === 'string' && 
          event.image_url.startsWith('http');
        
        return {
          ...event,
          image_url: hasValidImage ? event.image_url : null
        };
      });

    if (validEvents.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'No valid events found. The AI could not find events with valid URLs and images. Please try again or adjust your preferences.',
          eventsCount: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Clear all old events (past events and current batch)
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    const { error: deleteError } = await supabaseClient
      .from('events')
      .delete()
      .lt('date', todayDate.toISOString().split('T')[0]); // Delete past events

    if (deleteError) {
      console.error('Error deleting past events:', deleteError);
    } else {
      console.log('Successfully cleared past events');
    }

    // Also clear all remaining events to replace with new batch
    const { error: clearError } = await supabaseClient
      .from('events')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (clearError) {
      console.error('Error clearing events:', clearError);
    } else {
      console.log('Successfully cleared all events for new batch');
    }

    // Insert new events into database
    const eventsToInsert = validEvents.map((event: any) => ({
      title: event.title,
      description: event.description,
      date: event.date,
      location: event.location,
      event_link: event.event_link,
      image_url: event.image_url,
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