export default {
  async fetch(request, env) {
    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Only allow POST for summarization
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    try {
      // Parse request JSON
      const { text, summaryLength = 'default', summaryType = 'standard', language = 'English' } = await request.json();

      // Map summaryLength to max tokens
      let max_length = 150;
      if (summaryLength === 'short') max_length = 50;
      else if (summaryLength === 'detailed') max_length = 300;

      // Map summaryType to instruction
      let instruction = '';
      switch (summaryType) {
        case 'bullets':
          instruction = 'Summarize the following as bullet points:';
          break;
        case 'action':
          instruction = 'List the action items from the following:';
          break;
        case 'tldr':
          instruction = 'Write a TL;DR for the following:';
          break;
        case 'headline':
          instruction = 'Give a headline for the following:';
          break;
        default:
          instruction = 'Summarize the following:';
      }

      // Prepend instruction and grammar correction to text
      const input_text = `Correct all spelling and grammar mistakes, then summarize the following as clearly as possible:\n${instruction}\n${text}`;

      // Call the BART summarization model (Cloudflare AI)
      const result = await env.AI.run('@cf/facebook/bart-large-cnn', {
        input_text,
        max_length
      });

      // Prepare JSON response (only summary)
      const payload = { summary: result.summary };

      // Return with CORS headers
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    } catch (err) {
      // Return error as JSON
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
};