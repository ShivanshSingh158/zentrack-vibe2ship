const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('./src');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // Fix !todo.status === 'completed'
  if (content.includes("!todo.status === 'completed'")) {
    content = content.replace(/!todo\.status === 'completed'/g, "todo.status !== 'completed'");
    changed = true;
  }
  if (content.includes("!t.status === 'completed'")) {
    content = content.replace(/!t\.status === 'completed'/g, "t.status !== 'completed'");
    changed = true;
  }

  // Fix MODEL_PRIORITY
  if (content.includes("MODEL_PRIORITY") && !content.includes("export const MODEL_PRIORITY")) {
    // Only apply to files that don't export it
    content = content.replace(/MODEL_PRIORITY/g, "getPriorityModels(false)");
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content);
    console.log('Patched:', file);
  }
});
