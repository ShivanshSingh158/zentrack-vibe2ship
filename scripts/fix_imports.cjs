const fs = require('fs');
const path = require('path');

const dir = path.join(process.cwd(), 'src', 'agent', 'tools');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.executor.ts'));

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix ToolResult import
  content = content.replace(
    "import { ToolResult, requireGoogleAuth, requestApproval } from './shared';",
    "import { requireGoogleAuth, requestApproval } from './shared';\nimport type { ToolResult } from './shared';"
  );

  // Fix googleCalendar import
  content = content.replace(
    "import { addEventToGoogleCalendar, deleteGoogleCalendarEvent, listCalendarEventsOnDate, updateCalendarEvent } from '../../services/googleCalendar';",
    "import { addEventToGoogleCalendar, deleteGoogleCalendarEvent } from '../../services/googleCalendar';"
  );

  // Add missing googleWorkspace imports
  content = content.replace(
    "  createDraftEmail,\n} from '../../services/googleWorkspace';",
    "  createDraftEmail,\n  listCalendarEventsOnDate,\n  updateCalendarEvent,\n} from '../../services/googleWorkspace';"
  );

  fs.writeFileSync(filePath, content);
}

console.log('Fixed imports in ' + files.length + ' files');

// Also fix toolExecutor.ts
const toolExecutorPath = path.join(process.cwd(), 'src', 'agent', 'toolExecutor.ts');
let teContent = fs.readFileSync(toolExecutorPath, 'utf8');
teContent = teContent.replace(
  "import { ToolResult } from './tools/shared';",
  "import type { ToolResult } from './tools/shared';"
);
fs.writeFileSync(toolExecutorPath, teContent);
console.log('Fixed toolExecutor.ts dispatcher imports');
