
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/features/dashboard/HomeDashboard.tsx');
let content = fs.readFileSync(file, 'utf8');

const replacements = {
  'Active Deployment': 'Olympus Protocol',
  'URGENCY MATRIX': 'PROPHECY GRID',
  'System idle. Monitoring datastreams...': 'Pantheon idle. Scrying datastreams...',
  'FLEET TELEMETRY & SYSTEM HEALTH': 'DIVINE TELEMETRY & CORE VITALITY',
  'Threat Level:': 'Chaos Level:',
  'System State:': 'Aegis State:',
  'Daily Bandwidth Capacity:': 'Mortal Bandwidth Capacity:',
  'Mission Report': 'Divine Mandate Report'
};

for (const [oldStr, newStr] of Object.entries(replacements)) {
  content = content.replace(new RegExp(oldStr, 'g'), newStr);
}

fs.writeFileSync(file, content, 'utf8');
console.log('Updated HomeDashboard.tsx');

