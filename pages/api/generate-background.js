import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import sharp from 'sharp';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  if (!process.env.GOOGLE_AI_API_KEY) {
    return res.status(500).json({ error: 'Google AI API key is not configured' });
  }

  try {
    // Initialize the Gemini API
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    
    // Use Gemini 2.5 Flash Image Preview (Nano Banana) for image generation
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash-image-preview",
      generationConfig: {
        temperature: 0.9,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 32768,
      }
    });

    // Build comprehensive prompt for background generation
    let fullPrompt = `Generate a high-quality background image suitable for a product showcase or 3D model presentation. ${prompt}. `;
    fullPrompt += 'The background should be visually appealing, professional, and work well as a backdrop. ';
    fullPrompt += 'Create a seamless, high-resolution image that can be used as a background for 3D renders. ';
    fullPrompt += 'The image should be atmospheric but not distracting from foreground elements. ';
    fullPrompt += 'Output dimensions should be suitable for desktop display (16:9 aspect ratio preferred).';
    
    // Add the text prompt
    const parts = [{ text: fullPrompt }];

    // Generate content
    console.log('Calling Gemini 2.5 Flash Image Preview API for background...');
    const result = await model.generateContent(parts);
    const response = result.response;
    
    // Create a unique filename
    const timestamp = Date.now();
    const filename = `bg_generated_${timestamp}.jpg`;
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
            const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
            
            // Resize/optimize for background use
            await sharp(imageBuffer)
              .resize(1920, 1080, {
                fit: 'cover',
                position: 'center'
              })
              .jpeg({ quality: 95 })
              .toFile(filePath);
              
            imageGenerated = true;
            console.log('Generated background saved:', filename);
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
      console.log('No image in response, creating gradient background...');
      
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
    console.log('Background generation completed:', {
      filename,
      imageGenerated,
      prompt: prompt.slice(0, 50) + '...'
    });

    // In production, return base64 data instead of file paths
    let responseData = {
      filename,
      success: true,
      message: imageGenerated ? 'Background generated successfully!' : 'Created gradient background',
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
    }
    
    return res.status(200).json(responseData);

  } catch (error) {
    console.error('Background generation error:', error);
    
    // Check if it's a model access error and fallback to gradient
    if (error.message && error.message.includes('not found')) {
      try {
        const timestamp = Date.now();
        const filename = `bg_generated_${timestamp}.jpg`;
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
        
        return res.status(200).json({ 
          filename,
          success: true,
          message: 'Created gradient background (Image generation requires model access)'
        });
        
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
      }
    }
    
    return res.status(500).json({ 
      error: 'Failed to generate background',
      details: error.message,
      hint: error.message.includes('not found') 
        ? 'The gemini-2.5-flash-image-preview model requires special access. Using gradient fallback.'
        : undefined
    });
  }
}

// Increase body size limit for potential future features
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};