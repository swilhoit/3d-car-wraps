import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { basePrompt, referenceDescription } = req.body;

  if (!basePrompt || !referenceDescription) {
    return res.status(400).json({ error: 'Base prompt and reference description are required' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key is not configured' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a creative prompt generator. Create a single variation prompt that maintains the visual style of a reference image.'
          },
          {
            role: 'user',
            content: `Reference image style: ${referenceDescription}\n\nUser prompt: ${basePrompt}\n\nGenerate a single creative prompt that remixes these elements while maintaining the exact same visual style, color palette, mood, and aesthetic as the reference image. Think of this as a different view or moment from the same scene. Return ONLY the prompt as a single paragraph, no numbering or extra text.`
          }
        ],
        max_tokens: 200,
        temperature: 0.8
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      return res.status(response.status).json({ error: 'Failed to generate variation', details: errorText });
    }

    const data = await response.json();
    const prompt = data.choices[0]?.message?.content?.trim() || basePrompt;

    return res.status(200).json({ prompt });
  } catch (error) {
    console.error('Single variation generation error:', error);
    return res.status(500).json({
      error: 'Failed to generate variation',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
