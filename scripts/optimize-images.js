const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');
const optimizedDir = path.join(publicDir, 'optimized');

// Create optimized directory if it doesn't exist
if (!fs.existsSync(optimizedDir)) {
  fs.mkdirSync(optimizedDir, { recursive: true });
}

async function optimizeImages() {
  const files = fs.readdirSync(publicDir).filter(file => file.endsWith('.jpg'));
  
  for (const file of files) {
    const inputPath = path.join(publicDir, file);
    const fileNameWithoutExt = path.basename(file, '.jpg');
    
    // Create multiple sizes for responsive loading
    const sizes = [
      { width: 400, suffix: 'thumb' },
      { width: 800, suffix: 'medium' },
      { width: 1200, suffix: 'large' },
      { width: 1920, suffix: 'full' }
    ];
    
    console.log(`Optimizing ${file}...`);
    
    for (const size of sizes) {
      const outputPath = path.join(optimizedDir, `${fileNameWithoutExt}-${size.suffix}.webp`);
      
      await sharp(inputPath)
        .resize(size.width, null, {
          withoutEnlargement: true,
          fit: 'inside'
        })
        .webp({ quality: 85 })
        .toFile(outputPath);
      
      // Also create JPEG fallback
      const jpegOutputPath = path.join(optimizedDir, `${fileNameWithoutExt}-${size.suffix}.jpg`);
      await sharp(inputPath)
        .resize(size.width, null, {
          withoutEnlargement: true,
          fit: 'inside'
        })
        .jpeg({ quality: 85, progressive: true })
        .toFile(jpegOutputPath);
    }
  }
  
  console.log('Image optimization complete!');
}

optimizeImages().catch(console.error);