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
        model: 'openai/gpt-5-mini',
        messages: [
          {
            role: 'system',
            content: `You are an event discovery assistant. Search the web for real upcoming events happening in the specified city. Find events that match the user's interests and vibes. Return ONLY valid JSON with an array of events.`
          },
          {
            role: 'user',
            content: `Find 5-10 real upcoming events in ${city} between ${today} and ${nextWeek} that match these interests: ${userInterests} and vibes: ${userVibes}. 
            
CRITICAL REQUIREMENTS:
- Search the web for actual events from sources like Eventbrite, Meetup, local event calendars, venue websites, Facebook Events, etc.
- EVERY event MUST have a valid, working URL (event_link) to the actual event page
- EVERY event MUST have a valid image URL (image_url) - visit the event page to get the actual event image
- DO NOT include any events without both a valid event_link AND image_url

For each event, extract:
- title (string)
- description (string, 1-2 sentences)
- date (YYYY-MM-DD format)
- location (specific venue name and address)
- event_link (REQUIRED - URL to the actual event page, must be a valid working URL)
- image_url (REQUIRED - URL to event image from the event page, must be a valid image URL)
- interests (array of relevant interests from: ${userInterests})
- vibes (array of relevant vibes from: ${userVibes})

Return ONLY valid events that have both event_link AND image_url populated with real URLs.`
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
                        image_url: { type: "string" },
                        interests: { type: "array", items: { type: "string" } },
                        vibes: { type: "array", items: { type: "string" } }
                      },
                      required: ["title", "description", "date", "location", "event_link", "image_url", "interests", "vibes"],
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

    // Filter and validate events - only insert events with valid links and images
    const validEvents = eventsData.events.filter((event: any) => {
      const hasValidLink = event.event_link && 
        typeof event.event_link === 'string' && 
        event.event_link.startsWith('http');
      const hasValidImage = event.image_url && 
        typeof event.image_url === 'string' && 
        event.image_url.startsWith('http');
      
      if (!hasValidLink || !hasValidImage) {
        console.log(`Skipping event "${event.title}" - missing valid link or image`);
        return false;
      }
      return true;
    });

    if (validEvents.length === 0) {
      throw new Error('No valid events found with required URLs');
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