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
            content: 'You are a creative prompt generator. Generate exactly 5 variations of a scene while maintaining the same cohesive visual style.'
          },
          {
            role: 'user',
            content: `Reference image style: ${referenceDescription}\n\nUser prompt: ${basePrompt}\n\nGenerate exactly 5 prompts that describe multiple iterations of this image's scene while keeping its cohesive original style. Think of these as 5 different views or moments from the same scene. Each prompt should be a single paragraph, maintain the same visual style, colors, and mood. Return ONLY the 5 prompts, numbered 1-5, one per line.`
          }
        ],
        max_tokens: 500,
        temperature: 0.8
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      return res.status(response.status).json({ error: 'Failed to generate variations', details: errorText });
    }

    const data = await response.json();
    const responseText = data.choices[0]?.message?.content || '';

    // Parse the numbered prompts
    const prompts = responseText
      .split('\n')
      .filter((line: string) => line.trim().match(/^\d+[.):]/))
      .map((line: string) => line.replace(/^\d+[.):]\s*/, '').trim())
      .slice(0, 5);

    // Ensure we have exactly 5 prompts
    while (prompts.length < 5) {
      prompts.push(basePrompt);
    }

    return res.status(200).json({ prompts });
  } catch (error) {
    console.error('Variation generation error:', error);
    return res.status(500).json({
      error: 'Failed to generate variations',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
