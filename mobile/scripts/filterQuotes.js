const fs = require('fs');
const path = require('path');
const p = path.resolve('mobile/src/data/brutalQuotes.ts');
let content = fs.readFileSync(p, 'utf8');

// We will use a regex to extract quotes from BRUTAL_QUOTES and filter them.
const startIdx = content.indexOf('export const BRUTAL_QUOTES = [');
const endIdx = content.indexOf('];', startIdx);
const arrayContent = content.slice(startIdx + 'export const BRUTAL_QUOTES = ['.length, endIdx);

const quoteRegex = /\{\s*text:\s*"(.*?)",\s*author:\s*"(.*?)"\s*\}/g;
let match;
const validQuotes = [];
let tooLong = 0;

while ((match = quoteRegex.exec(arrayContent)) !== null) {
  // Check the character length of the quote text
  if (match[1].length <= 80) { // Limit to 80 chars which safely fits on two lines
    validQuotes.push(`  { text: "${match[1]}", author: "${match[2]}" },`);
  } else {
    tooLong++;
  }
}

const newArrayContent = '\n' + validQuotes.join('\n') + '\n';
content = content.slice(0, startIdx + 'export const BRUTAL_QUOTES = ['.length) + newArrayContent + content.slice(endIdx);
fs.writeFileSync(p, content);
console.log('Filtered out ' + tooLong + ' quotes longer than 80 chars. Remaining: ' + validQuotes.length);
