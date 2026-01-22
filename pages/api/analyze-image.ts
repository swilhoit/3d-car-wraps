import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageBase64, prompt } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'Image data is required' });
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
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt || 'Describe this image in detail, focusing on: visual style, color palette, mood, lighting, composition, textures, and any notable artistic elements. Be specific and descriptive.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageBase64,
                  detail: 'low'
                }
              }
            ]
          }
        ],
        max_tokens: 300
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI Vision API error:', errorText);
      return res.status(response.status).json({ error: 'Failed to analyze image', details: errorText });
    }

    const data = await response.json();
    const description = data.choices[0]?.message?.content || null;

    return res.status(200).json({ description });
  } catch (error) {
    console.error('Image analysis error:', error);
    return res.status(500).json({
      error: 'Failed to analyze image',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
