export const sanitize = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(sanitize);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined).map(([k, v]) => [k, sanitize(v)])
    );
  }
  return obj;
};

export const uniqueId = () => crypto.randomUUID();

export const extractYoutubeId = (url: string) => {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
  return match ? match[1] : null;
};

export const formatDuration = (ms: number) => {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const SPEED_KEY = 'learning_playback_speed';
export const SPEEDS = [1, 1.25, 1.5, 1.75, 2];
export const TS_KEY = (videoId: string) => `yt_ts_${videoId}`;

export const progressColor = (pct: number) => {
  if (pct === 100) return '#10b981';
  if (pct >= 75)   return '#a599ff';
  if (pct >= 25)   return '#f59e0b';
  return '#ef4444';
};

export { fetchYouTubePlaylist, extractPlaylistId } from '../../services/youtube';
export { fetchVideoTranscript, transcriptToPlainText, formatSeconds } from '../../services/youtubeTranscriptService';
export type { TranscriptCue, TranscriptResult } from '../../services/youtubeTranscriptService';

export const clockSvg = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:3px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;

export const stripTranscriptArtifacts = (text: string): string => {
  if (!text) return '';
  return text
    // 1. Full transcript block with or without closing delimiter
    .replace(/===+\s*(?:COMPLETE\s+)?(?:FULL[- ]LENGTH\s+)?(?:VIDEO\s+)?TRANSCRIPT[\s\S]*?(?:===+\s*END\s+TRANSCRIPT\s*===+|$)/gi, '')
    // 2. Stray end transcript markers
    .replace(/===+\s*END\s+TRANSCRIPT\s*===+/gi, '')
    // 3. Any directive blocks
    .replace(/\[CRITICAL DIRECTIVE[^\]]*\]/gi, '')
    .replace(/\[Student is currently at timestamp[^\]]*\]/gi, '')
    // 4. Conversation history blocks
    .replace(/===+\s*CONVERSATION HISTORY[\s\S]*?===+\s*END CONVERSATION HISTORY\s*===+/gi, '')
    // 5. Leaked markdown transcript dumps
    .replace(/(?:^|\n)#{1,4}\s*(?:Complete\s+)?(?:Video\s+)?Transcript\b[\s\S]*$/gi, '')
    .replace(/(?:^|\n)-{3,}\s*(?:Complete\s+)?(?:Video\s+)?Transcript\b[\s\S]*$/gi, '')
    .trim();
};

const CONTROL_KEYWORDS = new Set([
  'return', 'if', 'else', 'for', 'while', 'try', 'catch', 'finally',
  'throw', 'async', 'await', 'yield', 'switch', 'case', 'break', 'continue', 'default'
]);

const DECLARATION_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'class', 'def', 'import', 'export',
  'from', 'type', 'interface', 'enum', 'new', 'this', 'super', 'typeof',
  'instanceof', 'in', 'of', 'void', 'extends', 'implements', 'as', 'lambda',
  'pass', 'elif', 'with', 'is', 'not', 'and', 'or', 'public', 'private', 'protected',
  'static', 'int', 'float', 'double', 'char', 'bool', 'auto', 'template', 'typename'
]);

const BUILTIN_OBJECTS = new Set([
  'console', 'document', 'window', 'Math', 'JSON', 'Promise', 'Array',
  'Object', 'String', 'Number', 'Boolean', 'Set', 'Map', 'React', 'process',
  'print', 'len', 'range', 'enumerate', 'zip', 'map', 'filter', 'list', 'dict',
  'set', 'tuple', 'int', 'str', 'float', 'bool', 'sum', 'min', 'max', 'abs',
  'cout', 'cin', 'endl', 'vector', 'string', 'unordered_map', 'unordered_set', 'queue', 'stack'
]);

const LITERALS = new Set([
  'null', 'undefined', 'true', 'false', 'None', 'True', 'False', 'NaN', 'Infinity', 'nil', 'nullptr'
]);

const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

export const highlightCodeToHtml = (code: string, _lang?: string): string => {
  // Clean any HTML tags that might have slipped into code
  const raw = code
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '# $1\n')
    .replace(/<hr[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:p|div|pre|code|span|strong|em|ul|ol|li)[^>]*>/gi, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/^\n+|\n+$/g, '');

  if (!raw.trim()) return '';

  const lines = raw.split('\n');

  const tokenRegex = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:return|if|else|for|while|try|catch|finally|throw|async|await|yield|switch|case|break|continue|default)\b|\b(?:const|let|var|function|class|def|import|export|from|type|interface|enum|new|this|super|typeof|instanceof|in|of|void|extends|implements|as|lambda|pass|elif|with|is|not|and|or|public|private|protected|static|int|float|double|char|bool|auto|template|typename)\b|\b(?:console|document|window|Math|JSON|Promise|Array|Object|String|Number|Boolean|Set|Map|React|process|print|len|range|enumerate|zip|map|filter|list|dict|set|tuple|int|str|float|bool|sum|min|max|abs|cout|cin|endl|vector|string|unordered_map|unordered_set|queue|stack)\b|\b(?:null|undefined|true|false|None|True|False|NaN|Infinity|nil|nullptr)\b|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|[a-zA-Z_$][a-zA-Z0-9_$]*|[^\s\w]+|\s+)/g;

  return lines.map((line, lineIdx) => {
    let match;
    let lineHtml = '';

    while ((match = tokenRegex.exec(line)) !== null) {
      const tok = match[0];
      const escaped = escapeHtml(tok);

      if (/^(\/\/|\/\*|#)/.test(tok)) {
        lineHtml += `<span style="color:#6a9955;font-style:italic;">${escaped}</span>`;
      } else if (/^["'`]/.test(tok)) {
        lineHtml += `<span style="color:#ce9178;">${escaped}</span>`;
      } else if (CONTROL_KEYWORDS.has(tok)) {
        lineHtml += `<span style="color:#c586c0;font-weight:600;">${escaped}</span>`;
      } else if (DECLARATION_KEYWORDS.has(tok)) {
        lineHtml += `<span style="color:#569cd6;font-weight:600;">${escaped}</span>`;
      } else if (BUILTIN_OBJECTS.has(tok)) {
        lineHtml += `<span style="color:#4ec9b0;">${escaped}</span>`;
      } else if (LITERALS.has(tok)) {
        lineHtml += `<span style="color:#569cd6;font-weight:600;">${escaped}</span>`;
      } else if (/^\d/.test(tok)) {
        lineHtml += `<span style="color:#b5cea8;">${escaped}</span>`;
      } else if (line.substring(match.index + tok.length).trim().startsWith('(')) {
        lineHtml += `<span style="color:#dcdcaa;">${escaped}</span>`;
      } else if (/^[A-Z][a-zA-Z0-9_$]*$/.test(tok)) {
        lineHtml += `<span style="color:#4ec9b0;">${escaped}</span>`;
      } else if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(tok)) {
        lineHtml += `<span style="color:#9cdcfe;">${escaped}</span>`;
      } else {
        lineHtml += `<span style="color:#d4d4d4;">${escaped}</span>`;
      }
    }

    const lineNum = `<span class="lp-notes-line-num" style="display:inline-block;width:26px;text-align:right;margin-right:12px;color:#65656e;font-size:0.72rem;user-select:none;flex-shrink:0;font-family:inherit;">${lineIdx + 1}</span>`;
    const lineContent = `<span style="flex:1;min-width:0;white-space:pre;font-family:inherit;">${lineHtml || ' '}</span>`;

    return `<div class="lp-notes-code-line" style="display:flex;min-height:1.45em;line-height:1.55;font-family:inherit;">${lineNum}${lineContent}</div>`;
  }).join('');
};

export const renderCodeCardHtml = (code: string, language?: string): string => {
  const lang = (language || 'code').trim().toLowerCase();
  const highlighted = highlightCodeToHtml(code, lang);

  return `<div class="lp-notes-code-card" data-language="${lang}" contenteditable="false"><div class="lp-notes-code-header"><div class="lp-vscode-window-dots"><span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span></div><span class="lp-notes-code-lang">${lang.toUpperCase()}</span><button type="button" class="lp-notes-copy-code-btn" onclick="navigator.clipboard.writeText(this.closest('.lp-notes-code-card').querySelector('pre code').innerText); this.innerText='Copied!'; setTimeout(() => this.innerText='Copy', 2000);">Copy</button></div><pre class="lp-notes-code-pre"><code>${highlighted}</code></pre></div>`;
};

export const convertMarkdownToRichNotesHtml = (raw: string): string => {
  if (!raw) return '';

  let text = stripTranscriptArtifacts(raw);

  const codeBlocks: string[] = [];

  // Step 0A: Repair and preserve existing <div class="lp-notes-code-card">
  text = text.replace(/<div class="lp-notes-code-card"[^>]*>[\s\S]*?<\/div>/gi, (match) => {
    const langMatch = /data-language="([^"]*)"/i.exec(match);
    const lang = langMatch ? langMatch[1] : 'code';
    const codeText = match
      .replace(/<div class="lp-notes-code-header"[\s\S]*?<\/div>/gi, '')
      .replace(/<span class="lp-notes-line-num"[\s\S]*?<\/span>/gi, '')
      .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '# $1\n')
      .replace(/<hr[^>]*>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');
    const placeholder = `__CODE_BLOCK_PLACEHOLDER_${codeBlocks.length}__`;
    codeBlocks.push(renderCodeCardHtml(codeText, lang));
    return `\n\n${placeholder}\n\n`;
  });

  // Step 0B: Repair and preserve existing <pre> blocks (neutralize corrupted h1/headings/hr inside them)
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner) => {
    const codeText = inner
      .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '# $1\n')
      .replace(/<hr[^>]*>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');
    const placeholder = `__CODE_BLOCK_PLACEHOLDER_${codeBlocks.length}__`;
    codeBlocks.push(renderCodeCardHtml(codeText, 'python'));
    return `\n\n${placeholder}\n\n`;
  });

  // Step 1: Extract and preserve markdown code blocks ```lang ... ```
  text = text.replace(/```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const placeholder = `__CODE_BLOCK_PLACEHOLDER_${codeBlocks.length}__`;
    codeBlocks.push(renderCodeCardHtml(code, lang || 'code'));
    return `\n\n${placeholder}\n\n`;
  });

  // Step 2: Extract and preserve inline code `code`
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`\n]+?)`/g, (_, code) => {
    const escaped = escapeHtml(code);
    const placeholder = `__INLINE_CODE_PLACEHOLDER_${inlineCodes.length}__`;
    inlineCodes.push(`<code class="lp-notes-inline-code">${escaped}</code>`);
    return placeholder;
  });

  // Step 3: Timestamps: [MM:SS] or [HH:MM:SS] or **[MM:SS]**
  text = text.replace(/(?:\*\*)?\[(\d{1,2}:\d{2}(?::\d{2})?)\](?:\*\*)?/g, (_, time) => {
    const parts = time.split(':').map((p: string) => parseInt(p, 10));
    let s = 0;
    if (parts.length === 2) {
      s = parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      s = parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return `<span class="lp-inline-ts-pill" contenteditable="false" data-seconds="${s}">${clockSvg}${time}</span>&nbsp;`;
  });

  // Step 4: Headings (STRICTLY at the start of a line to avoid breaking Python # comments)
  text = text.replace(/^[ \t]*####[ \t]+(.+)$/gm, '<h4>$1</h4>');
  text = text.replace(/^[ \t]*###[ \t]+(.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^[ \t]*##[ \t]+(.+)$/gm, '<h2>$1</h2>');
  // For single #, only convert if followed by an emoji or title word, NEVER if it looks like code
  text = text.replace(/^[ \t]*#[ \t]+([A-Z\p{Emoji}].+)$/gmu, '<h1>$1</h1>');

  // Step 5: Bold & Italic
  text = text.replace(/\*\*\*([^\n]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');
  text = text.replace(/(?<!_)_([^_\n]+?)_(?!_)/g, '<em>$1</em>');

  // Step 6: Horizontal rules
  text = text.replace(/^[ \t]*---+[ \t]*$/gm, '<hr/>');

  // Step 7: Bullet lists: lines starting with - or *
  text = text.replace(/^[ \t]*[-*][ \t]+(.+)$/gm, '<li>$1</li>');
  text = text.replace(/(?:<li>[\s\S]*?<\/li>[\s\n]*)+/g, (match) => {
    return `<ul>${match.trim()}</ul>`;
  });

  // Step 8: Restore inline codes & code blocks
  inlineCodes.forEach((html, i) => {
    text = text.replace(new RegExp(`__INLINE_CODE_PLACEHOLDER_${i}__`, 'g'), html);
  });

  codeBlocks.forEach((html, i) => {
    text = text.replace(new RegExp(`__CODE_BLOCK_PLACEHOLDER_${i}__`, 'g'), html);
  });

  // Step 9: Format paragraphs & linebreaks
  text = text
    .split('\n\n')
    .map(chunk => {
      const trimmed = chunk.trim();
      if (!trimmed) return '';
      if (/^<(h[1-6]|ul|ol|div|pre|hr)/i.test(trimmed)) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, '<br/>')}</p>`;
    })
    .filter(Boolean)
    .join('\n');

  return text;
};


