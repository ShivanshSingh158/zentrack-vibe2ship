const https = require('https');
const fs = require('fs');

const exercises = [
  "Incline Dumbbell Press", "Neutral-Grip Lat Pulldowns", "Flat Barbell Press", "Chest-Supported T-Bar", "High-to-Low Cable Crossovers", "Face Pulls", "45-Degree Weighted Back Extensions",
  "Seated Dumbbell Overhead Press", "Cable Lateral Raises", "Dumbbell Shrugs", "Close-Grip Barbell Bench Press", "V-Bar Cable Pushdowns", "Standing EZ-Bar Curls", "Machine Preacher Curls", "Dumbbell Hammer Curls",
  "Standard Barbell Deadlifts", "Hack Squats OR Leg Press", "Seated Leg Curls", "Standing Machine Calf Raises", "Kneeling Cable Crunches", "Hanging Knee Raises", "Pall of Press", "Seated Barbell Wrist Curls", "Standing Behind Back Wrist Curls", "Seated Dumbbell Pronation/Supination",
  "Assisted Pull-Ups OR Assisted Chin-Ups", "Incline Machine Press", "Single-Arm Dumbbell Rows", "Decline Dumbbell Press", "Seated Cable Rows (V-Bar Grip)", "Pec Deck Fly", "Straight-Arm Cable Pulldowns",
  "Machine Overhead Press", "Dumbbell Lateral Raises", "Reverse Pec Deck", "Wide-Grip Cable Upright Rows", "Cable Cross-Body Tricep Extensions", "Overhead Cable Extensions", "Rope Tricep Pushdowns", "Alternating Dumbbell Curls w/ Supination", "Incline Dumbbell Curls",
  "Heel-Elevated Goblet Squats", "Bulgarian Split Squats", "Seated Machine Abductions", "Seated Calf Raises", "Seated Ab Crunch Machine", "Cable Woodchoppers (High-to-Low)", "Reverse Crunches", "Reverse Cable Curls", "Seated Dumbbell Wrist Extensions", "Plate Pinches"
];

async function searchYoutube(query) {
  return new Promise((resolve, reject) => {
    https.get(`https://www.youtube.com/results?search_query=${encodeURIComponent(query + " tutorial proper form")}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Find the first videoId
        const match = data.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (match) resolve(match[1]);
        else resolve(null);
      });
    }).on('error', reject);
  });
}

async function main() {
  const results = {};
  for (const ex of exercises) {
    console.log(`Searching for: ${ex}`);
    const id = await searchYoutube(ex);
    results[ex] = id;
    // Add a small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }
  fs.writeFileSync('youtube-ids.json', JSON.stringify(results, null, 2));
  console.log('Done!');
}

main();
