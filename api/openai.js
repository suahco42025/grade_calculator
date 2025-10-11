// api/openai.js (or api/groq.js) - Vercel/Netlify Function
import Groq from 'groq-sdk';  // npm i groq-sdk (if not already)

const groq = new Groq({ 
  apiKey: process.env.GROQ_API_KEY  // Set this in your env vars
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'No valid message provided' });
  }

  try {
    console.log('Groq proxy called:', req.body);  // Your log—keep this for debugging

    const completion = await groq.chat.completions.create({
      messages: [
        { 
          role: 'system', 
          content: 'You are a helpful, concise AI assistant for a grade calculator app. Provide friendly study tips, grade advice, or tool explanations. Keep responses under 200 words.' 
        },
        { role: 'user', content: message }
      ],
      model: 'llama3-70b-8192',  // FIXED: Valid model (was deprecated)
      max_tokens: 300,
      temperature: 0.7,
      stream: false  // Set to true for streaming if you want real-time responses
    });

    const reply = completion.choices[0]?.message?.content?.trim() || 'Sorry, I couldn\'t generate a response.';
    console.log('Groq reply generated:', reply.substring(0, 100) + '...');  // Log snippet for debug

    res.status(200).json({ reply });
  } catch (error) {
    console.error('Groq API Error:', error.response?.data || error.message);
    
    // Graceful error handling
    let errorMsg = 'Groq API failed—try again in a sec.';
    if (error.response?.status === 400) {
      errorMsg = 'Invalid request—check your message format.';
    } else if (error.response?.status === 429) {
      errorMsg = 'Rate limit hit—slow down a bit!';
    } else if (error.response?.status === 401) {
      errorMsg = 'API key issue—check your Groq credentials.';
    }
    
    res.status(error.response?.status || 500).json({ error: errorMsg });
  }
}
