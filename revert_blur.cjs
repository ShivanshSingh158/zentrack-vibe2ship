const fs = require('fs');
const glob = require('glob');

const files = glob.sync('mobile/src/**/*.tsx');
let count = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  content = content.replace(/backgroundColor:\s*['"]rgba\(28,28,30,0\.75\)['"]/g, "backgroundColor: '#1c1c1e'");
  content = content.replace(/backgroundColor:\s*['"]rgba\(0,0,0,0\.3\)['"]/g, "backgroundColor: 'rgba(0,0,0,0.6)'");
  content = content.replace(/<BlurView[^>]*style=\{StyleSheet\.absoluteFillObject\}[^>]*\/>/g, "");

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Reverted ' + file);
    count++;
  }
}
console.log('Total reverted: ' + count);
