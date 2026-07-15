const fs = require('fs');
let c = fs.readFileSync('src/screens/CalendarScreen.tsx', 'utf8');
c = c.replace(/'COLORS\.([a-zA-Z0-9_]+)'/g, 'COLORS.$1');
c = c.replace(/"COLORS\.([a-zA-Z0-9_]+)"/g, 'COLORS.$1');
fs.writeFileSync('src/screens/CalendarScreen.tsx', c);
