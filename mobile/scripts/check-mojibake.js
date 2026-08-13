const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src');
const badStrings = ['ΓÇó', '├ù', 'â€'];

let foundError = false;

function scanDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      scanDirectory(fullPath);
    } else if (stat.isFile() && /\.(ts|tsx|js|jsx)$/.test(file)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      badStrings.forEach(badString => {
        if (content.includes(badString)) {
          console.error(`\x1b[31m[Error] Mojibake '${badString}' found in file: ${fullPath}\x1b[0m`);
          foundError = true;
        }
      });
    }
  }
}

console.log('Running Mojibake Checker...');
if (fs.existsSync(srcDir)) {
  scanDirectory(srcDir);
} else {
  console.log('src directory not found, skipping check.');
}

if (foundError) {
  console.error('\x1b[31m\nMojibake characters detected! Build failed.\x1b[0m');
  console.error('To fix this, please ensure your editor or terminal is using UTF-8 encoding and replace the corrupted characters with their correct Unicode equivalents.');
  process.exit(1);
} else {
  console.log('\x1b[32mSuccess: No Mojibake characters detected.\x1b[0m');
  process.exit(0);
}
