import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,  // Set in Vercel env vars (see Step 2)
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { model, messages, max_tokens = 150, temperature = 0.7 } = req.body;

    // Map OpenAI models to Groq (your HTML uses gpt-3.5-turbo → Llama 3)
    const groqModel = model === 'gpt-3.5-turbo' ? 'llama3-8b-8192' : model;

    const completion = await groq.chat.completions.create({
      model: groqModel,
      messages,
      max_tokens,
      temperature,
      stream: false,
    });

    // Return OpenAI-compatible response for your frontend
    const response = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.',
          },
        },
      ],
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Groq API Error:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
}
