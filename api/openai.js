// api/openai.js
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers for client-side fetch
  res.setHeader('Access-Control-Allow-Origin', '*'); // Adjust for production (e.g., your domain)
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Get API key from Vercel env var (secure!)
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI assistant for the Grade Calculator tool. Provide concise, friendly advice on grades, study tips, GPA calculation, or tool usage. Keep responses under 150 words. Be encouraging!'
          },
          { role: 'user', content: message }
        ],
        max_tokens: 150,
        temperature: 0.7
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      throw new Error(`OpenAI API Error: ${openaiResponse.status} - ${errorText}`);
    }

    const data = await openaiResponse.json();
    const aiReply = data.choices[0].message.content;

    res.status(200).json({ reply: aiReply });
  } catch (error) {
    console.error('OpenAI Proxy Error:', error);
    res.status(500).json({ error: 'Failed to get response from AI' });
  }
}