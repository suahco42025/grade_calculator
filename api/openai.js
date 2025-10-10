// api/openai.js (Swapped to Groq - Free & Fast)
export default async function handler(req, res) {
  console.log('Groq proxy called:', req.method, req.body);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const apiKey = process.env.GROQ_API_KEY; // NEW: Use Groq env var
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    console.log('Fetching from Groq...');
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', { // Groq's OpenAI-compatible endpoint
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192', // Free, fast model (or 'mixtral-8x7b-32768' for more power)
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

    console.log('Groq status:', groqResponse.status);

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('Groq error:', errorText);
      throw new Error(`Groq API Error: ${groqResponse.status} - ${errorText}`);
    }

    const data = await groqResponse.json();
    const aiReply = data.choices[0].message.content;
    console.log('Groq reply generated');

    res.status(200).json({ reply: aiReply });
  } catch (error) {
    console.error('Full proxy error:', error.message);
    res.status(500).json({ error: 'Failed to get response from AI' });
  }
}

