
const fs = require('fs');
const path = require('path');

const replacements = {
  'ORCHESTRATOR': 'ATHENA',
  'SEARCH': 'ORACLE',
  'DOCS': 'SCRIBE',
  'DATA': 'ENIGMA',
  'COMMS': 'HERMES',
  'SCHEDULER': 'CHRONOS',
  'DRIVE': 'ARCHIVE',
  'CODING': 'HEPHAESTUS',
  'QA': 'AEGIS',
  'PLANNER': 'ATLAS',
  'MONITOR': 'ARGUS',
  'GHOST_DETECTOR': 'SPECTRE',
  'EXECUTOR': 'TITAN'
};

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir(path.join(__dirname, 'src'), function(filePath) {
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.css')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    for (const [oldName, newName] of Object.entries(replacements)) {
      const regex = new RegExp('\\b' + oldName + '\\b', 'g');
      content = content.replace(regex, newName);
    }
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Updated', filePath);
    }
  }
});

