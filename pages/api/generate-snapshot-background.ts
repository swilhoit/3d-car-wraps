import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import sharp from 'sharp';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { snapshotImage, prompt, referenceImage } = req.body;

  if (!snapshotImage || !prompt) {
    return res.status(400).json({ error: 'Snapshot image and prompt are required' });
  }

  if (!process.env.GOOGLE_AI_API_KEY) {
    return res.status(500).json({ error: 'Google AI API key is not configured' });
  }

  try {
    // Initialize the Gemini API
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

    // Use Gemini 3 Pro Image (Nano Banana Pro) for image generation
    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-image-preview",
      generationConfig: {
        temperature: 0.9,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 32768,
      }
    });

    // Convert base64 to buffer for processing
    const base64Data = snapshotImage.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Build comprehensive prompt for background generation using the snapshot
    let fullPrompt = `You are provided with a snapshot image of a 3D scene containing robot(s)/product(s). `;
    fullPrompt += `Generate a high-quality background image that places ALL objects from the snapshot into a realistic environment. `;

    // User's request - ensure it includes context about placing the objects in the scene
    fullPrompt += `User request: ${prompt}. `;
    fullPrompt += `CRITICAL: Preserve and integrate ALL robots/products from the snapshot seamlessly into the background environment described. `;
    fullPrompt += `If there are multiple robots in the snapshot, include ALL of them in the same positions and arrangement. `;
    fullPrompt += `The objects should appear naturally placed in the scene, not floating or disconnected from the environment. `;

    // Add reference image context if provided
    if (referenceImage) {
      fullPrompt += `Additionally, use the provided reference image as style inspiration for the background. `;
      fullPrompt += `Match the color palette, lighting, and overall aesthetic of the reference while incorporating the user's specific requirements. `;
    }

    fullPrompt += `The background should be visually appealing, professional, and work well as a backdrop for 3D product visualization. `;
    fullPrompt += `Create a seamless, high-resolution image suitable for use as an environmental background. `;
    fullPrompt += `The image should be atmospheric but not distracting from the main subjects. `;
    fullPrompt += `Ensure proper perspective, lighting, and shadows that make all objects look grounded in the environment. `;
    fullPrompt += `Maintain the exact number and arrangement of objects from the snapshot. `;
    fullPrompt += `Output dimensions should be suitable for desktop display (16:9 aspect ratio preferred).`;

    // Prepare the parts with text and images
    const parts = [
      { text: fullPrompt },
      {
        inlineData: {
          data: base64Data,
          mimeType: 'image/jpeg'
        }
      }
    ];

    // Add reference image if provided
    if (referenceImage) {
      const refBase64Data = referenceImage.replace(/^data:image\/\w+;base64,/, '');
      parts.push({
        inlineData: {
          data: refBase64Data,
          mimeType: 'image/jpeg'
        }
      });
    }

    // Generate content
    console.log('Calling Gemini 3 Pro Image API for snapshot-based background...');
    const result = await model.generateContent(parts);
    const response = result.response;

    // Create a unique filename
    const timestamp = Date.now();
    const filename = `bg_snapshot_${timestamp}.jpg`;
    const filePath = path.join('/tmp', filename);

    // Check if the response contains an image
    let imageGenerated = false;

    if (response.candidates && response.candidates[0]) {
      const candidate = response.candidates[0];

      // Check for inline image data in the response
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          // Check for generated image
          if (part.inlineData && part.inlineData.data) {
            // Save the generated image
            const generatedImageBuffer = Buffer.from(part.inlineData.data, 'base64');

            // Resize/optimize for background use - Nano Banana Pro supports up to 4K
            await sharp(generatedImageBuffer)
              .resize(3840, 2160, {
                fit: 'cover',
                position: 'center'
              })
              .jpeg({ quality: 95 })
              .toFile(filePath);

            imageGenerated = true;
            console.log('Generated snapshot background saved:', filename);
          }
          // Also capture any text response (for debugging)
          if (part.text) {
            console.log('Text response:', part.text.slice(0, 100));
          }
        }
      }
    }

    // Fallback if no image was generated
    if (!imageGenerated) {
      console.log('No image in response, creating enhanced gradient background...');

      // Create a gradient background as fallback
      const width = 1920;
      const height = 1080;

      // Generate a gradient based on the prompt
      const colors = ['#4a5568', '#2d3748', '#1a202c']; // Default dark gradient

      if (prompt.toLowerCase().includes('sunset')) {
        colors[0] = '#ff6b6b';
        colors[1] = '#feca57';
        colors[2] = '#48dbfb';
      } else if (prompt.toLowerCase().includes('ocean') || prompt.toLowerCase().includes('blue')) {
        colors[0] = '#0077be';
        colors[1] = '#48dbfb';
        colors[2] = '#006ba6';
      } else if (prompt.toLowerCase().includes('forest') || prompt.toLowerCase().includes('green')) {
        colors[0] = '#27ae60';
        colors[1] = '#52c234';
        colors[2] = '#061700';
      } else if (prompt.toLowerCase().includes('purple') || prompt.toLowerCase().includes('cosmic')) {
        colors[0] = '#667eea';
        colors[1] = '#764ba2';
        colors[2] = '#f093fb';
      }

      // Create gradient SVG
      const svg = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:${colors[0]};stop-opacity:1" />
              <stop offset="50%" style="stop-color:${colors[1]};stop-opacity:1" />
              <stop offset="100%" style="stop-color:${colors[2]};stop-opacity:1" />
            </linearGradient>
          </defs>
          <rect width="${width}" height="${height}" fill="url(#gradient)" />
        </svg>
      `;

      // Convert SVG to image
      await sharp(Buffer.from(svg))
        .jpeg({ quality: 95 })
        .toFile(filePath);
    }

    // Log the generation for debugging
    console.log('Snapshot background generation completed:', {
      filename,
      imageGenerated,
      prompt: prompt.slice(0, 50) + '...'
    });

    // In production, return base64 data instead of file paths
    const responseData: {
      filename: string;
      success: boolean;
      message: string;
      imageGenerated: boolean;
      imageData?: string;
    } = {
      filename,
      success: true,
      message: imageGenerated ? 'Background generated successfully from snapshot!' : 'Created gradient background',
      imageGenerated
    };

    // If in production/serverless, include base64 data
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      try {
        const imageBuffer = await sharp(filePath).toBuffer();
        responseData.imageData = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
      } catch (readError) {
        console.error('Could not read generated file:', readError);
      }
    } else {
      // In development, also return base64 for consistency
      try {
        const imageBuffer = await sharp(filePath).toBuffer();
        responseData.imageData = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
      } catch (readError) {
        console.error('Could not read generated file:', readError);
      }
    }

    return res.status(200).json(responseData);

  } catch (error: unknown) {
    console.error('Snapshot background generation error:', error);

    // Check if it's a model access error and fallback to gradient
    if (error instanceof Error && error.message && error.message.includes('not found')) {
      try {
        const timestamp = Date.now();
        const filename = `bg_snapshot_${timestamp}.jpg`;
        const filePath = path.join('/tmp', filename);

        // Create a simple gradient background
        const width = 1920;
        const height = 1080;
        const svg = `
          <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
              </linearGradient>
            </defs>
            <rect width="${width}" height="${height}" fill="url(#gradient)" />
          </svg>
        `;

        await sharp(Buffer.from(svg))
          .jpeg({ quality: 95 })
          .toFile(filePath);

        const imageBuffer = await sharp(filePath).toBuffer();
        const imageData = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

        return res.status(200).json({
          filename,
          success: true,
          message: 'Created gradient background (Image generation requires model access)',
          imageData
        });

      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
      }
    }

    return res.status(500).json({
      error: 'Failed to generate snapshot background',
      details: error instanceof Error ? error.message : 'Unknown error',
      hint: error instanceof Error && error.message.includes('not found')
        ? 'The gemini-3-pro-image-preview model requires special access. Using gradient fallback.'
        : undefined
    });
  }
}

// Increase body size limit for snapshot images
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
