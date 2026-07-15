const fs = require('fs');
let c = fs.readFileSync('src/screens/CalendarScreen.tsx', 'utf8');

c = c.replace(/'#A8C7FA'/g, 'COLORS.accentPrimary');
c = c.replace(/'#000000'/g, 'COLORS.background');
c = c.replace(/'#5F6368'/g, 'COLORS.border');
c = c.replace(/"#FFFFFF"/g, 'COLORS.background');
c = c.replace(/'#34A853'/g, 'COLORS.accentGreen');
c = c.replace(/'#2D2E32'/g, 'COLORS.surface');

fs.writeFileSync('src/screens/CalendarScreen.tsx', c);
