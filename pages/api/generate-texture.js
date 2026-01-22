import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, baseTexture, logo, reference, model = 'nano-banana' } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  if (!process.env.GOOGLE_AI_API_KEY) {
    return res.status(500).json({ error: 'Google AI API key is not configured' });
  }

  try {
    // Route to different generation functions based on model
    switch (model) {
      case 'nano-banana':
        return await generateWithNanoBanana(req, res, prompt, baseTexture, logo, reference);
      case 'flux-kontext':
        return await generateWithFluxKontext(req, res, prompt, baseTexture, logo, reference);
      case 'openai-image':
        return await generateWithOpenAI(req, res, prompt, baseTexture, logo, reference);
      default:
        return res.status(400).json({ error: 'Invalid model selected' });
    }
  } catch (error) {
    console.error('Generation error:', error);
    return res.status(500).json({
      error: 'Failed to generate texture',
      details: error.message
    });
  }
}

// Nano Banana (Gemini) Generation Function
async function generateWithNanoBanana(req, res, prompt, baseTexture, logo, reference) {
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
        // Flash Image Preview has 32,768 token limit for both input and output
        maxOutputTokens: 32768,
      }
    });
    
    // Helper function to convert data URL to Gemini format
    const dataUrlToGenerativePart = (dataUrl, mimeType = 'image/jpeg') => {
      if (!dataUrl) return null;
      // Extract base64 data from data URL
      const base64Data = dataUrl.split(',')[1] || dataUrl;
      return {
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      };
    };
    
    // Helper to read file as base64
    const fileToGenerativePart = async (filePath, mimeType = 'image/jpeg') => {
      try {
        const imageData = await fs.readFile(filePath);
        return {
          inlineData: {
            data: imageData.toString('base64'),
            mimeType: mimeType
          }
        };
      } catch (error) {
        console.error('Error reading file:', error);
        return null;
      }
    };

    // Build the parts array for multi-modal input
    const parts = [];
    
    // ALWAYS use Waymo UV template as base for proper mapping
    const uvTemplatePath = path.join(process.cwd(), 'public', 'waymo-uv-template.png');
    const uvTemplatePart = await fileToGenerativePart(uvTemplatePath, 'image/png');
    if (uvTemplatePart) {
      parts.push(uvTemplatePart);
    }
    
    // Add logo if provided
    if (logo) {
      const logoPart = dataUrlToGenerativePart(logo, 'image/png');
      if (logoPart) {
        parts.push(logoPart);
      }
    }
    
    // Add reference image if provided
    if (reference) {
      const referencePart = dataUrlToGenerativePart(reference, 'image/jpeg');
      if (referencePart) {
        parts.push(referencePart);
      }
    }
    
    // Build comprehensive prompt for Waymo vehicle wrap image generation
    let fullPrompt = `IMPORTANT: The first image is a UV template for a Waymo Jaguar I-Pace vehicle wrap with 6 panels stacked vertically. You MUST fill in EACH of the 6 panel areas with the design. The panels represent: (1) Hood, (2) Front bumper, (3) Left side, (4) Right side, (5) Rear/trunk, (6) Roof. ${prompt}. `;

    fullPrompt += 'This UV template shows the unwrapped surfaces of a Waymo self-driving vehicle. Fill each of the 6 vertical panel sections with the texture design, maintaining proper alignment and continuity across panels for a cohesive vehicle wrap. ';
    
    if (logo) {
      fullPrompt += 'LOGO PLACEMENT: The provided logo must be placed INDIVIDUALLY on EACH and EVERY frame/panel of the UV template. Do not place the logo on just one panel - replicate it across ALL white rectangular areas. Each panel should have its own instance of the logo integrated into the design. The logo should appear on every face/side of the 3D model when wrapped. ';
    }
    
    if (reference) {
      fullPrompt += 'Use the reference image for style, color palette, and aesthetic inspiration throughout all panels. ';
    }
    
    fullPrompt += 'Create a cohesive vehicle wrap design that fills ALL 6 panels in the UV template vertically. ';

    if (logo) {
      fullPrompt += 'Remember: The logo MUST appear on EACH of the 6 panels (Hood, Front bumper, Left side, Right side, Rear, Roof), not just once. Every panel should contain the logo as part of its design. ';
    }

    fullPrompt += 'The design should be continuous and properly mapped for 3D vehicle wrap application. Each of the 6 panels should contain part of the overall design that will wrap correctly when applied to the Waymo vehicle. The output must maintain the exact UV template layout with all 6 panels filled vertically.';
    
    // Add the text prompt
    parts.push({ text: fullPrompt });

    // Generate content with all parts
    console.log('Calling Gemini 2.5 Flash Image Preview API...');
    const result = await model.generateContent(parts);
    const response = result.response;
    
    // Create a unique filename
    const timestamp = Date.now();
    const filename = `ai_generated_${timestamp}.jpg`;
    const filePath = path.join('/tmp', filename);
    const thumbnailFilename = `ai_thumb_${timestamp}.jpg`;
    const thumbnailPath = path.join('/tmp', thumbnailFilename);
    
    // Check if the response contains an image
    let imageGenerated = false;
    let generatedText = '';
    
    if (response.candidates && response.candidates[0]) {
      const candidate = response.candidates[0];
      
      // Check for inline image data in the response
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          // Check for generated image
          if (part.inlineData && part.inlineData.data) {
            // Save the generated image
            const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
            await fs.writeFile(filePath, imageBuffer);
            imageGenerated = true;
            console.log('Generated image saved:', filename);
          }
          // Also capture any text response
          if (part.text) {
            generatedText += part.text;
          }
        }
      }
    }
    
    // Fallback if no image was generated
    if (!imageGenerated) {
      console.log('No image in response, using fallback...');
      
      // Try to get text description
      try {
        generatedText = response.text() || 'No description available';
      } catch {
        generatedText = 'Image generation in progress';
      }
      
      // Use Waymo UV template as fallback base
      const sourcePath = path.join(process.cwd(), 'public', 'waymo-uv-template.png');
      try {
        await fs.copyFile(sourcePath, filePath);
      } catch (copyError) {
        console.error('Could not copy UV template:', copyError);
        // Create a simple placeholder
        const placeholderBuffer = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
        await fs.writeFile(filePath, placeholderBuffer);
      }
    }
    
    // Save metadata about the generation (in tmp for serverless)
    const metadataPath = path.join('/tmp', filename.replace('.jpg', '_metadata.json'));
    try {
      await fs.writeFile(metadataPath, JSON.stringify({
        prompt: prompt,
        fullPrompt: fullPrompt,
        hasLogo: !!logo,
        hasReference: !!reference,
        baseTexture: baseTexture,
        timestamp: timestamp,
        imageGenerated: imageGenerated,
        geminiResponse: generatedText,
        model: 'gemini-2.5-flash-image-preview'
      }, null, 2));
    } catch (metaError) {
      console.log('Could not save metadata:', metaError);
    }
    
    // Generate a separate thumbnail image based on the prompt theme
    // instead of cropping the UV template
    try {
      // Create a thumbnail prompt for a standalone image
      let thumbnailPrompt = `Create a simple, clean 200x200 pixel thumbnail image that represents: ${prompt}. This should be a single cohesive image, not a UV template. Make it visually appealing and representative of the theme.`;

      const thumbnailParts = [];

      // Add logo to thumbnail if provided
      if (logo) {
        const logoPart = dataUrlToGenerativePart(logo, 'image/png');
        if (logoPart) {
          thumbnailParts.push(logoPart);
          thumbnailPrompt += ' Include the provided logo prominently in the design.';
        }
      }

      // Add reference for style if provided
      if (reference) {
        const referencePart = dataUrlToGenerativePart(reference, 'image/jpeg');
        if (referencePart) {
          thumbnailParts.push(referencePart);
          thumbnailPrompt += ' Use the reference image for style and color palette.';
        }
      }

      thumbnailParts.push({ text: thumbnailPrompt });

      // Try to generate a separate thumbnail
      console.log('Generating themed thumbnail...');
      const thumbnailResult = await model.generateContent(thumbnailParts);
      const thumbnailResponse = thumbnailResult.response;

      let thumbnailGenerated = false;

      if (thumbnailResponse.candidates && thumbnailResponse.candidates[0]) {
        const candidate = thumbnailResponse.candidates[0];

        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
              const thumbnailBuffer = Buffer.from(part.inlineData.data, 'base64');
              // Resize to ensure it's 200x200
              await sharp(thumbnailBuffer)
                .resize(200, 200, {
                  fit: 'cover',
                  position: 'center'
                })
                .jpeg({ quality: 90 })
                .toFile(thumbnailPath);
              thumbnailGenerated = true;
              console.log('Themed thumbnail created:', thumbnailFilename);
              break;
            }
          }
        }
      }

      // Fallback: create thumbnail from main texture if generation fails
      if (!thumbnailGenerated) {
        console.log('Thumbnail generation failed, creating from main texture');
        await sharp(filePath)
          .resize(200, 200, {
            fit: 'cover',
            position: 'center'
          })
          .jpeg({ quality: 90 })
          .toFile(thumbnailPath);
      }
    } catch (thumbError) {
      console.error('Thumbnail generation error:', thumbError);
      // Final fallback: crop from main image
      try {
        await sharp(filePath)
          .resize(200, 200, {
            fit: 'cover',
            position: 'center'
          })
          .jpeg({ quality: 90 })
          .toFile(thumbnailPath);
      } catch (fallbackError) {
        console.error('Fallback thumbnail also failed:', fallbackError);
      }
    }
    
    // Log the generation for debugging
    console.log('Texture generation completed:', {
      filename,
      thumbnail: thumbnailFilename,
      imageGenerated,
      prompt: prompt.slice(0, 50) + '...',
      hasLogo: !!logo,
      hasReference: !!reference,
      baseTexture: !!baseTexture
    });

    // Return response with base64 data for serverless environment
    let responseData = {
      filename,
      thumbnail: `/${thumbnailFilename}`,
      success: true,
      message: imageGenerated ? 'Image generated successfully!' : 'Texture created (awaiting image generation)',
      imageGenerated,
      description: generatedText ? generatedText.slice(0, 200) + '...' : undefined
    };
    
    // In serverless environments, return base64 data since we can't serve static files
    try {
      const imageBuffer = await fs.readFile(filePath);
      const thumbnailBuffer = await fs.readFile(thumbnailPath).catch(() => imageBuffer);
      responseData.imageData = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
      responseData.thumbnailData = `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;
    } catch (readError) {
      console.error('Could not read generated files:', readError);
      return res.status(500).json({ error: 'Failed to read generated image files' });
    }
    
    return res.status(200).json(responseData);

  } catch (error) {
    console.error('Generation error:', error);
    
    // Check if it's a model access error
    if (error.message && error.message.includes('not found')) {
      // Fallback to standard Flash model
      try {
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
        const model = genAI.getGenerativeModel({ 
          model: "gemini-1.5-flash",
          generationConfig: {
            temperature: 0.9,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192,
          }
        });
        
        // Build simple prompt
        const parts = [{ text: `Describe a texture design: ${prompt}` }];
        
        const result = await model.generateContent(parts);
        const response = result.response;
        const generatedText = response.text();
        
        // Create placeholder with description
        const timestamp = Date.now();
        const filename = `ai_generated_${timestamp}.jpg`;
        const filePath = path.join('/tmp', filename);
        const thumbnailFilename = `ai_thumb_${timestamp}.jpg`;
        const thumbnailPath = path.join('/tmp', thumbnailFilename);
        
        // Always use Waymo UV template for consistency
        const sourcePath = path.join(process.cwd(), 'public', 'waymo-uv-template.png');
        
        await fs.copyFile(sourcePath, filePath);
        
        // Generate a simple themed thumbnail for fallback mode
        try {
          // Since we can't generate images, create a solid color thumbnail
          // based on the description
          const thumbnailBuffer = await sharp({
            create: {
              width: 200,
              height: 200,
              channels: 3,
              background: { r: 40, g: 40, b: 40 } // Dark gray default
            }
          })
          .jpeg({ quality: 90 })
          .toBuffer();

          await fs.writeFile(thumbnailPath, thumbnailBuffer);
        } catch (thumbError) {
          console.error('Fallback thumbnail generation failed:', thumbError);
          // Last resort: copy template as thumbnail
          try {
            await sharp(filePath)
              .resize(200, 200, {
                fit: 'cover',
                position: 'center'
              })
              .jpeg({ quality: 90 })
              .toFile(thumbnailPath);
          } catch (lastError) {
            console.error('Final thumbnail fallback failed:', lastError);
          }
        }
        
        // Save metadata
        const metadataPath = filePath.replace('.jpg', '_metadata.json');
        await fs.writeFile(metadataPath, JSON.stringify({
          prompt: prompt,
          timestamp: timestamp,
          geminiDescription: generatedText,
          note: 'Using Gemini 1.5 Flash (Image Preview model requires special access)'
        }, null, 2));
        
        // Return with base64 data for serverless environment
        let fallbackResponseData = { 
          filename,
          thumbnail: `/${thumbnailFilename}`,
          success: true,
          message: 'Texture created with description (Image generation requires model access)',
          description: generatedText.slice(0, 200) + '...'
        };
        
        try {
          const imageBuffer = await fs.readFile(filePath);
          const thumbnailBuffer = await fs.readFile(thumbnailPath).catch(() => imageBuffer);
          fallbackResponseData.imageData = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
          fallbackResponseData.thumbnailData = `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;
        } catch (readError) {
          console.error('Could not read fallback files:', readError);
        }
        
        return res.status(200).json(fallbackResponseData);

      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
      }
    }

    return res.status(500).json({
      error: 'Failed to generate texture',
      details: error.message,
      hint: error.message.includes('not found')
        ? 'The gemini-2.5-flash-image-preview model requires special access. Contact Google for access.'
        : undefined
    });
  }
}

// Flux Kontext Generation Function (via Replicate API)
async function generateWithFluxKontext(req, res, prompt, baseTexture, logo, reference) {
  const replicateToken = process.env.REPLICATE_API_TOKEN;

  if (!replicateToken) {
    return res.status(500).json({ error: 'Replicate API token is not configured' });
  }

  try {
    // Prepare the prompt for Flux Kontext
    let fluxPrompt = prompt;

    // Add UV template guidance for proper 3D texture mapping
    fluxPrompt += ' This should be a seamless texture pattern suitable for 3D model wrapping with proper UV mapping.';

    if (logo) {
      fluxPrompt += ' Include the provided logo elements integrated into the design.';
    }

    if (reference) {
      fluxPrompt += ' Use the reference image for style and color inspiration.';
    }

    // Prepare the API request to Replicate
    const replicateResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${replicateToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: "flux-kontext-apps/multi-image-kontext-max",
        input: {
          prompt: fluxPrompt,
          width: 1024,
          height: 1024,
          num_outputs: 1,
          guidance_scale: 7.5,
          num_inference_steps: 28,
          seed: Math.floor(Math.random() * 1000000)
        }
      })
    });

    if (!replicateResponse.ok) {
      const errorData = await replicateResponse.text();
      console.error('Replicate API error:', errorData);
      return res.status(500).json({
        error: 'Replicate API request failed',
        details: errorData
      });
    }

    const prediction = await replicateResponse.json();

    // Poll for completion
    let completed = false;
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max wait time

    while (!completed && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

      const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: {
          'Authorization': `Token ${replicateToken}`,
        }
      });

      if (!statusResponse.ok) {
        throw new Error('Failed to check prediction status');
      }

      const status = await statusResponse.json();

      if (status.status === 'succeeded') {
        completed = true;

        // Download the generated image
        const imageUrl = status.output[0]; // Assuming output is an array of image URLs
        const imageResponse = await fetch(imageUrl);

        if (!imageResponse.ok) {
          throw new Error('Failed to download generated image');
        }

        const imageBuffer = await imageResponse.arrayBuffer();

        // Save files
        const timestamp = Date.now();
        const filename = `flux_generated_${timestamp}.jpg`;
        const filePath = path.join('/tmp', filename);
        const thumbnailFilename = `flux_thumb_${timestamp}.jpg`;
        const thumbnailPath = path.join('/tmp', thumbnailFilename);

        // Save main image
        await fs.writeFile(filePath, Buffer.from(imageBuffer));

        // Create thumbnail
        await sharp(filePath)
          .resize(200, 200, {
            fit: 'cover',
            position: 'center'
          })
          .jpeg({ quality: 90 })
          .toFile(thumbnailPath);

        // Save metadata
        const metadataPath = path.join('/tmp', filename.replace('.jpg', '_metadata.json'));
        await fs.writeFile(metadataPath, JSON.stringify({
          prompt: prompt,
          fluxPrompt: fluxPrompt,
          hasLogo: !!logo,
          hasReference: !!reference,
          baseTexture: baseTexture,
          timestamp: timestamp,
          model: 'flux-kontext',
          replicateId: prediction.id
        }, null, 2));

        // Return response with base64 data
        const mainImageBuffer = await fs.readFile(filePath);
        const thumbImageBuffer = await fs.readFile(thumbnailPath);

        return res.status(200).json({
          filename,
          thumbnail: `/${thumbnailFilename}`,
          success: true,
          message: 'Texture generated successfully with Flux Kontext!',
          imageGenerated: true,
          imageData: `data:image/jpeg;base64,${mainImageBuffer.toString('base64')}`,
          thumbnailData: `data:image/jpeg;base64,${thumbImageBuffer.toString('base64')}`
        });

      } else if (status.status === 'failed') {
        throw new Error(`Prediction failed: ${status.error}`);
      }

      attempts++;
    }

    if (!completed) {
      throw new Error('Generation timed out after 5 minutes');
    }

  } catch (error) {
    console.error('Flux Kontext generation error:', error);
    return res.status(500).json({
      error: 'Failed to generate with Flux Kontext',
      details: error.message
    });
  }
}

// OpenAI Image Generation Function
async function generateWithOpenAI(req, res, prompt, baseTexture, logo, reference) {
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!openaiApiKey) {
    return res.status(500).json({ error: 'OpenAI API key is not configured' });
  }

  try {
    // Prepare the prompt for DALL-E
    let dallePrompt = prompt;

    // Add UV template guidance for proper 3D texture mapping
    dallePrompt += ' Create a seamless, tileable texture pattern suitable for 3D model UV mapping. The design should wrap properly without visible seams when applied to 3D surfaces.';

    if (logo) {
      dallePrompt += ' Incorporate logo elements throughout the pattern in a repeating, integrated manner.';
    }

    if (reference) {
      dallePrompt += ' Use similar style, colors, and aesthetic as shown in reference materials.';
    }

    // Add technical specifications for better texture generation
    dallePrompt += ' High resolution, professional quality, suitable for product visualization.';

    // Try gpt-image-1 first, fallback to dall-e-3
    let modelToUse = 'gpt-image-1';
    let requestBody = {
      model: modelToUse,
      prompt: dallePrompt,
      n: 1,
      size: '1024x1024',
      quality: 'hd',
      response_format: 'url'
    };

    // Make the API request to OpenAI
    let openaiResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    // If gpt-image-1 fails, try dall-e-3
    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.text();
      console.log('gpt-image-1 failed, trying dall-e-3:', errorData);

      modelToUse = 'dall-e-3';
      requestBody = {
        model: 'dall-e-3',
        prompt: dallePrompt,
        n: 1,
        size: '1024x1024',
        quality: 'hd',
        style: 'natural',
        response_format: 'url'
      };

      openaiResponse = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
    }

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.text();
      console.error('OpenAI API error:', errorData);
      return res.status(500).json({
        error: 'OpenAI API request failed',
        details: errorData
      });
    }

    const openaiResult = await openaiResponse.json();

    if (!openaiResult.data || !openaiResult.data[0] || !openaiResult.data[0].url) {
      throw new Error('No image URL returned from OpenAI');
    }

    // Download the generated image
    const imageUrl = openaiResult.data[0].url;
    const imageResponse = await fetch(imageUrl);

    if (!imageResponse.ok) {
      throw new Error('Failed to download generated image from OpenAI');
    }

    const imageBuffer = await imageResponse.arrayBuffer();

    // Save files
    const timestamp = Date.now();
    const filename = `openai_generated_${timestamp}.jpg`;
    const filePath = path.join('/tmp', filename);
    const thumbnailFilename = `openai_thumb_${timestamp}.jpg`;
    const thumbnailPath = path.join('/tmp', thumbnailFilename);

    // Save main image
    await fs.writeFile(filePath, Buffer.from(imageBuffer));

    // Create thumbnail
    await sharp(filePath)
      .resize(200, 200, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 90 })
      .toFile(thumbnailPath);

    // Save metadata
    const metadataPath = path.join('/tmp', filename.replace('.jpg', '_metadata.json'));
    await fs.writeFile(metadataPath, JSON.stringify({
      prompt: prompt,
      dallePrompt: dallePrompt,
      hasLogo: !!logo,
      hasReference: !!reference,
      baseTexture: baseTexture,
      timestamp: timestamp,
      model: `openai-${modelToUse}`,
      actualModel: modelToUse,
      originalUrl: imageUrl,
      revisedPrompt: openaiResult.data[0].revised_prompt || dallePrompt
    }, null, 2));

    // Return response with base64 data
    const mainImageBuffer = await fs.readFile(filePath);
    const thumbImageBuffer = await fs.readFile(thumbnailPath);

    return res.status(200).json({
      filename,
      thumbnail: `/${thumbnailFilename}`,
      success: true,
      message: 'Texture generated successfully with OpenAI DALL-E!',
      imageGenerated: true,
      imageData: `data:image/jpeg;base64,${mainImageBuffer.toString('base64')}`,
      thumbnailData: `data:image/jpeg;base64,${thumbImageBuffer.toString('base64')}`,
      revisedPrompt: openaiResult.data[0].revised_prompt
    });

  } catch (error) {
    console.error('OpenAI generation error:', error);
    return res.status(500).json({
      error: 'Failed to generate with OpenAI',
      details: error.message
    });
  }
}

// Increase body size limit for base64 images
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};