const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('./mobile/src');
let modifiedCount = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Add experimentalBlurMethod to BlurView if not already there
  content = content.replace(/<BlurView(?![^>]*experimentalBlurMethod)/g, '<BlurView experimentalBlurMethod="dimezisBlurView"');
  
  // Make solid backgrounds semi-transparent so blur shines through (common #1c1c1e -> rgba(28,28,30,0.75))
  content = content.replace(/backgroundColor:\s*['"]#1c1c1e['"]/g, "backgroundColor: 'rgba(28,28,30,0.75)'");

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    modifiedCount++;
    console.log('Fixed ' + file);
  }
});

console.log('Total files fixed: ' + modifiedCount);
