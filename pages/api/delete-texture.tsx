import fs from 'fs/promises';
import path from 'path';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { filename } = req.body;

  if (!filename) {
    return res.status(400).json({ error: 'Filename is required' });
  }

  // Security: Only allow deletion of AI-generated files
  if (!filename.startsWith('ai_generated_') && !filename.startsWith('openai_generated_') && !filename.startsWith('replicate_generated_')) {
    return res.status(403).json({ error: 'Can only delete AI-generated textures' });
  }

  // Sanitize filename to prevent directory traversal
  const sanitizedFilename = path.basename(filename);
  
  try {
    // Delete the main texture file
    const filePath = path.join(process.cwd(), 'public', sanitizedFilename);
    
    // Check if file exists before trying to delete
    try {
      await fs.access(filePath);
      await fs.unlink(filePath);
      console.log('Deleted texture:', sanitizedFilename);
    } catch {
      console.log('Texture file not found:', sanitizedFilename);
    }

    // Also delete the thumbnail if it exists
    const thumbnailFilename = sanitizedFilename.replace('ai_generated_', 'ai_thumb_');
    const thumbnailPath = path.join(process.cwd(), 'public', thumbnailFilename);
    
    try {
      await fs.access(thumbnailPath);
      await fs.unlink(thumbnailPath);
      console.log('Deleted thumbnail:', thumbnailFilename);
    } catch {
      console.log('Thumbnail not found:', thumbnailFilename);
    }

    // Delete metadata file if it exists
    const metadataFilename = sanitizedFilename.replace('.jpg', '_metadata.json');
    const metadataPath = path.join(process.cwd(), 'public', metadataFilename);
    
    try {
      await fs.access(metadataPath);
      await fs.unlink(metadataPath);
      console.log('Deleted metadata:', metadataFilename);
    } catch {
      console.log('Metadata not found:', metadataFilename);
    }

    return res.status(200).json({ 
      success: true,
      message: 'Texture deleted successfully',
      deletedFiles: {
        texture: sanitizedFilename,
        thumbnail: thumbnailFilename,
        metadata: metadataFilename
      }
    });

  } catch (error: unknown) {
    console.error('Delete error:', error);
    return res.status(500).json({ 
      error: 'Failed to delete texture',
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}