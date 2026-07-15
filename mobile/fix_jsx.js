const fs = require('fs');
let c = fs.readFileSync('src/screens/CalendarScreen.tsx', 'utf8');

c = c.replace(/color=COLORS\.([a-zA-Z0-9_]+)/g, 'color={COLORS.$1}');
c = c.replace(/backgroundColor=COLORS\.([a-zA-Z0-9_]+)/g, 'backgroundColor={COLORS.$1}');

fs.writeFileSync('src/screens/CalendarScreen.tsx', c);
