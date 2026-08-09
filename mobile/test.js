const fs = require('fs');
let content = fs.readFileSync('src/screens/DashboardScreen.tsx', 'utf8');

const regex = /\{(\(\) => \{\s*const agendaItems: any\[\] = \[\];[\s\S]*?return agendaItems\.map\(item => \([\s\S]*?<\/TouchableOpacity>\s*\);\s*\}\)\(\)\}/;

const match = content.match(regex);
if (match) {
    console.log('Match found!');
} else {
    console.log('No match found.');
}
