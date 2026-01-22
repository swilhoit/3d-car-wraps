import { createCanvas, loadImage } from 'canvas';
import fs from 'fs/promises';
import path from 'path';
import formidable from 'formidable';
import { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('Combine UV panels API called');

  try {
    const form = formidable({
      uploadDir: path.join(process.cwd(), 'public'),
      keepExtensions: true,
      maxFileSize: 50 * 1024 * 1024, // 50MB
    });

    const [fields, files] = await form.parse(req);

    // Collect panel files in order
    const panelFiles: formidable.File[] = [];
    for (let i = 1; i <= 6; i++) {
      const panelKey = `panel_${i}`;
      if (files[panelKey] && files[panelKey][0]) {
        panelFiles.push(files[panelKey][0] as formidable.File);
      } else {
        return res.status(400).json({ error: `Missing panel ${i}` });
      }
    }

    console.log('Combining UV panels:', panelFiles.length);

    // Load all panel images
    const panelImages = [];
    let maxWidth = 0;
    let totalHeight = 0;

    for (const file of panelFiles) {
      const img = await loadImage(file.filepath);
      panelImages.push(img);
      maxWidth = Math.max(maxWidth, img.width);
      totalHeight += img.height;
    }

    console.log(`Creating combined UV map: ${maxWidth}x${totalHeight}`);

    // Create canvas for combined image
    const canvas = createCanvas(maxWidth, totalHeight);
    const ctx = canvas.getContext('2d');

    // Draw panels vertically
    let currentY = 0;
    for (let i = 0; i < panelImages.length; i++) {
      const img = panelImages[i];
      const x = (maxWidth - img.width) / 2; // Center horizontally
      ctx.drawImage(img, x, currentY);
      currentY += img.height;
      console.log(`Panel ${i + 1} placed at y: ${currentY - img.height}`);
    }

    // Generate filename for combined UV map
    const timestamp = Date.now();
    const filename = `uv_combined_${timestamp}.png`;
    const outputPath = path.join(process.cwd(), 'public', filename);

    // Save combined image
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(outputPath, buffer);

    console.log('Combined UV map saved:', filename);

    // Clean up temporary panel files
    for (const file of panelFiles) {
      try {
        await fs.unlink(file.filepath);
      } catch (error) {
        console.log('Could not delete temp file:', file.filepath);
      }
    }

    return res.status(200).json({
      success: true,
      combinedUVMap: `/${filename}`,
      dimensions: {
        width: maxWidth,
        height: totalHeight
      },
      panelsCount: panelImages.length
    });

  } catch (error: unknown) {
    console.error('Combine UV panels error:', error);
    return res.status(500).json({
      error: 'Failed to combine UV panels',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}