import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

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
            content: 'You are a creative and upbeat assistant helping generate short, engaging loading messages for an event discovery app.'
          },
          {
            role: 'user',
            content: 'Generate 5 short, fun, and engaging loading messages (max 8 words each) to show while we\'re discovering amazing events for users. Messages should be exciting and keep users engaged. Return them using the return_messages function.'
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_messages",
              description: "Return loading messages",
              parameters: {
                type: "object",
                properties: {
                  messages: {
                    type: "array",
                    items: { type: "string" }
                  }
                },
                required: ["messages"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "return_messages" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      // Return default messages on error
      return new Response(
        JSON.stringify({ 
          messages: [
            "Finding your perfect events...",
            "Discovering amazing experiences...",
            "Curating events just for you...",
            "Almost there...",
            "Getting everything ready..."
          ]
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error('No messages returned');
    }

    const messagesData = typeof toolCall.function.arguments === 'string' 
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

    return new Response(
      JSON.stringify(messagesData),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in loading-messages function:', error);
    
    // Return default messages on error
    return new Response(
      JSON.stringify({ 
        messages: [
          "Finding your perfect events...",
          "Discovering amazing experiences...",
          "Curating events just for you...",
          "Almost there...",
          "Getting everything ready..."
        ]
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});