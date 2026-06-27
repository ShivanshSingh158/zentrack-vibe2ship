const fs = require('fs');
const path = './src/agent/fleet/NewAgents.ts';
let content = fs.readFileSync(path, 'utf8');

const RULE = `

## CRITICAL FORMATTING RULES FOR ALL OUTPUTS
1. NO RAW MARKDOWN: NEVER output raw Markdown syntax like ###, **, *, or backticks to the user or into documents. These render poorly in Google Docs and the Mission Report UI.
2. USE HTML OR LATEX: If you need to write bold words, use HTML tags like <b>bold</b> or LaTeX formats. DO NOT use markdown asterisks.
3. NO CODE FOR THE USER: NEVER output raw code snippets, JSON, or scripts directly to the user in a chat or report. Always summarize what you did in plain English.
4. HIGH DETAIL: Always write expansive, highly detailed, beautifully structured prose.`;

content = content.split('\`;').join(RULE + '\`;');
fs.writeFileSync(path, content);
console.log('Done!');
