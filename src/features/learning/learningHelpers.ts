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

export const convertMarkdownToRichNotesHtml = (raw: string): string => {
  if (!raw) return '';

  let text = stripTranscriptArtifacts(raw);

  // 1. Extract and preserve code blocks
  const codeBlocks: string[] = [];
  text = text.replace(/```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const language = (lang || 'code').trim().toLowerCase();
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const placeholder = `__CODE_BLOCK_PLACEHOLDER_${codeBlocks.length}__`;
    const blockHtml = `<div class="lp-notes-code-card" data-language="${language}" contenteditable="false"><div class="lp-notes-code-header"><span class="lp-vscode-window-dots"><span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span></span><span class="lp-notes-code-lang">${language.toUpperCase()}</span></div><pre class="lp-notes-code-pre"><code>${escaped}</code></pre></div>`;
    codeBlocks.push(blockHtml);
    return `\n\n${placeholder}\n\n`;
  });

  // 2. Extract and preserve inline code
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`\n]+?)`/g, (_, code) => {
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const placeholder = `__INLINE_CODE_PLACEHOLDER_${inlineCodes.length}__`;
    inlineCodes.push(`<code class="lp-notes-inline-code">${escaped}</code>`);
    return placeholder;
  });

  // 3. Timestamps: [MM:SS] or [HH:MM:SS] or **[MM:SS]**
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

  // 4. Ensure headings have clean line boundaries even if input collapsed newlines
  text = text.replace(/([^\n])\s*(#{1,4}\s+[^\n]+)/g, '$1\n\n$2\n');

  // Headings
  text = text.replace(/^(?:[ \t]*)####[ \t]+(.+)$/gm, '<h4>$1</h4>');
  text = text.replace(/^(?:[ \t]*)###[ \t]+(.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^(?:[ \t]*)##[ \t]+(.+)$/gm, '<h2>$1</h2>');
  text = text.replace(/^(?:[ \t]*)#[ \t]+(.+)$/gm, '<h1>$1</h1>');

  // 5. Bold & Italic
  text = text.replace(/\*\*\*([^\n]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');
  text = text.replace(/(?<!_)_([^_\n]+?)_(?!_)/g, '<em>$1</em>');

  // 6. Horizontal rules
  text = text.replace(/^[ \t]*---+[ \t]*$/gm, '<hr/>');

  // 7. Bullet lists: lines starting with - or *
  text = text.replace(/^[ \t]*[-*][ \t]+(.+)$/gm, '<li>$1</li>');
  text = text.replace(/(?:<li>[\s\S]*?<\/li>[\s\n]*)+/g, (match) => {
    return `<ul>${match.trim()}</ul>`;
  });

  // 8. Restore inline codes & code blocks
  inlineCodes.forEach((html, i) => {
    text = text.replace(new RegExp(`__INLINE_CODE_PLACEHOLDER_${i}__`, 'g'), html);
  });

  codeBlocks.forEach((html, i) => {
    text = text.replace(new RegExp(`__CODE_BLOCK_PLACEHOLDER_${i}__`, 'g'), html);
  });

  // 9. Format paragraphs & linebreaks
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


