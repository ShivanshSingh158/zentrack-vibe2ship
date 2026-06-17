const yts = require('yt-search');
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'data', 'gymPlan.ts');
let content = fs.readFileSync(file, 'utf8');

const regex = /{ id: '([^']+)', name: '([^']+)', targetSets: \d+, targetReps: '[^']+', muscle: '[^']+', videoId: '([^']+)' }/g;

async function run() {
  const matches = [...content.matchAll(regex)];
  console.log(`Found ${matches.length} exercises to update`);
  
  for (const match of matches) {
    const fullLine = match[0];
    const id = match[1];
    const name = match[2];
    const oldVideoId = match[3];
    
    try {
      const r = await yts(`${name} proper form tutorial fitness`);
      if (r.videos.length > 0) {
        const newVideoId = r.videos[0].videoId;
        console.log(`[${name}] ${oldVideoId} -> ${newVideoId}`);
        content = content.replace(fullLine, fullLine.replace(`videoId: '${oldVideoId}'`, `videoId: '${newVideoId}'`));
      } else {
        console.log(`[${name}] No videos found`);
      }
    } catch (e) {
      console.error(`[${name}] Error:`, e.message);
    }
    
    // Add small delay just in case
    await new Promise(r => setTimeout(r, 200));
  }
  
  fs.writeFileSync(file, content, 'utf8');
  console.log('Done updating gymPlan.ts');
}

run();
