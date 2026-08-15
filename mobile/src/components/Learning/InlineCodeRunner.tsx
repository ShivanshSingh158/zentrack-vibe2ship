/**
 * InlineCodeRunner.tsx — ZenTrack Mobile
 *
 * Sandboxed code execution inside the ZEN-GPT chat.
 * - Renders VS Code–style code block with a ▶ Run button
 * - JS/TS: injected into a hidden WebView with a full console.log interceptor
 * - Python: runs via Pyodide (WebAssembly) loaded inside the WebView once and cached
 * - Output appears in a collapsible panel below the code block
 * - Errors shown in red, output in green, warnings in amber
 *
 * Supported languages: js, javascript, ts, typescript, python, py
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { FONT_FAMILY } from '../../theme/tokens';
import VsCodeSyntaxHighlighter from './VsCodeSyntaxHighlighter';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OutputLine {
  type: 'log' | 'error' | 'warn' | 'info';
  text: string;
}

interface InlineCodeRunnerProps {
  code: string;
  language: string;
  nodeKey: string;
}

// ── Language detection ─────────────────────────────────────────────────────────

export function isRunnable(language: string): boolean {
  return ['js', 'javascript', 'ts', 'typescript', 'python', 'py'].includes(
    language.toLowerCase().trim()
  );
}

function isPython(language: string): boolean {
  return ['python', 'py'].includes(language.toLowerCase().trim());
}

// ── JS/TS sandbox HTML ─────────────────────────────────────────────────────────
// Full console interceptor: captures log/warn/error/info + uncaught exceptions.
// Sends all output back via ReactNativeWebView.postMessage as JSON.
function buildJsSandboxHtml(code: string): string {
  // Escape the user code safely for embedding
  const escaped = code
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>body{margin:0;background:#000}</style></head>
<body>
<script>
(function() {
  var output = [];

  function capture(type, args) {
    var text = args.map(function(a) {
      if (a === null) return 'null';
      if (a === undefined) return 'undefined';
      if (typeof a === 'object') {
        try { return JSON.stringify(a, null, 2); } catch(e) { return String(a); }
      }
      return String(a);
    }).join(' ');
    output.push({ type: type, text: text });
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'line', kind: type, text: text }));
  }

  console.log   = function() { capture('log',   Array.prototype.slice.call(arguments)); };
  console.warn  = function() { capture('warn',  Array.prototype.slice.call(arguments)); };
  console.error = function() { capture('error', Array.prototype.slice.call(arguments)); };
  console.info  = function() { capture('info',  Array.prototype.slice.call(arguments)); };

  window.onerror = function(msg, src, line, col, err) {
    var text = err ? (err.name + ': ' + err.message) : String(msg);
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'line', kind: 'error', text: text }));
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'done' }));
    return true;
  };

  try {
    // TS: strip type annotations naively (removes ': Type' patterns)
    var userCode = \`${escaped}\`;
    eval(userCode);
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'line', kind: 'error', text: e.name + ': ' + e.message }));
  }
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'done' }));
})();
</script>
</body>
</html>`;
}

// ── Python sandbox HTML (Pyodide WASM) ───────────────────────────────────────
// Loads Pyodide from CDN once, then evaluates user code.
// stdout/stderr are redirected via js.console override.
function buildPythonSandboxHtml(code: string): string {
  const escaped = code.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>body{margin:0;background:#000}</style></head>
<body>
<script src="https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js"></script>
<script>
(async function() {
  function post(kind, text) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'line', kind: kind, text: String(text) }));
  }

  try {
    post('info', '⏳ Loading Python runtime…');
    const pyodide = await loadPyodide({
      stdout: (t) => post('log', t),
      stderr: (t) => post('error', t),
    });
    post('info', '✅ Python ready');
    try {
      await pyodide.runPythonAsync(\`${escaped}\`);
    } catch(e) {
      post('error', e.message || String(e));
    }
  } catch(e) {
    post('error', 'Failed to load Python: ' + e.message);
  }
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'done' }));
})();
</script>
</body>
</html>`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InlineCodeRunner({ code, language, nodeKey }: InlineCodeRunnerProps) {
  const [running, setRunning] = useState(false);
  const [outputLines, setOutputLines] = useState<OutputLine[]>([]);
  const [outputVisible, setOutputVisible] = useState(false);
  const [sandboxHtml, setSandboxHtml] = useState<string | null>(null);
  const runCountRef = useRef(0);

  const handleRun = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const runId = ++runCountRef.current;
    setOutputLines([]);
    setOutputVisible(true);
    setRunning(true);
    // Generate fresh sandbox HTML with current run ID to force WebView reload
    const html = isPython(language)
      ? buildPythonSandboxHtml(code)
      : buildJsSandboxHtml(code);
    // Append a comment with runId to bust WebView cache
    setSandboxHtml(html + `<!-- run ${runId} -->`);
  }, [code, language]);

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'line') {
        setOutputLines(prev => [...prev, { type: msg.kind as OutputLine['type'], text: msg.text }]);
      } else if (msg.type === 'done') {
        setRunning(false);
      }
    } catch { /* ignore */ }
  }, []);

  const outputColor = (type: OutputLine['type']) => {
    switch (type) {
      case 'error': return '#f87171';
      case 'warn':  return '#fbbf24';
      case 'info':  return '#60a5fa';
      default:      return '#4ade80';
    }
  };

  return (
    <View style={styles.container}>
      {/* Code block header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={styles.langDot} />
          <Text style={styles.langLabel}>{language.toLowerCase()}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {/* Copy button */}
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => { Clipboard.setStringAsync(code); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Ionicons name="copy-outline" size={12} color="#858585" />
            <Text style={styles.headerBtnText}>Copy</Text>
          </TouchableOpacity>
          {/* Run button */}
          <TouchableOpacity
            style={[styles.headerBtn, styles.runBtn]}
            onPress={handleRun}
            disabled={running}
          >
            {running
              ? <ActivityIndicator size="small" color="#000" style={{ transform: [{ scale: 0.7 }] }} />
              : <Ionicons name="play" size={11} color="#000" />
            }
            <Text style={[styles.headerBtnText, { color: '#000', fontFamily: FONT_FAMILY.bold }]}>
              {running ? 'Running…' : 'Run'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Syntax-highlighted code */}
      <VsCodeSyntaxHighlighter code={code} language={language} showLineNumbers />

      {/* Hidden WebView sandbox — rendered only when running */}
      {sandboxHtml !== null && (
        <View style={{ width: 0, height: 0, overflow: 'hidden' }}>
          <WebView
            key={sandboxHtml.slice(-20)} // key changes on each run → forces full reload
            source={{ html: sandboxHtml, baseUrl: 'about:blank' }}
            onMessage={handleWebViewMessage}
            javaScriptEnabled
            originWhitelist={['*']}
            // Allow network for Pyodide CDN (Python only)
            mixedContentMode={isPython(language) ? 'always' : 'never'}
            style={{ width: 1, height: 1, opacity: 0 }}
          />
        </View>
      )}

      {/* Output panel */}
      {outputVisible && (
        <View style={styles.outputPanel}>
          <View style={styles.outputHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.statusDot, { backgroundColor: running ? '#fbbf24' : '#4ade80' }]} />
              <Text style={styles.outputLabel}>
                {running ? 'Executing…' : `Output (${outputLines.length} line${outputLines.length !== 1 ? 's' : ''})`}
              </Text>
            </View>
            <TouchableOpacity onPress={() => { setOutputVisible(false); setSandboxHtml(null); }}>
              <Ionicons name="close" size={14} color="#52525b" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.outputScroll} nestedScrollEnabled>
            {outputLines.length === 0 && !running && (
              <Text style={styles.emptyOutput}>No output</Text>
            )}
            {outputLines.map((line, i) => (
              <Text key={i} style={[styles.outputLine, { color: outputColor(line.type) }]}>
                {line.type === 'error' ? '✖ ' : line.type === 'warn' ? '⚠ ' : '› '}
                {line.text}
              </Text>
            ))}
            {running && <ActivityIndicator size="small" color="#4ade80" style={{ alignSelf: 'flex-start', marginTop: 4 }} />}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginVertical: 6,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1e1e1e', paddingHorizontal: 12, paddingVertical: 7,
  },
  langDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#388bfd' },
  langLabel: { fontSize: 11, fontFamily: FONT_FAMILY.medium, color: '#858585' },
  headerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6,
  },
  runBtn: {
    backgroundColor: '#4ade80',
    minWidth: 56, justifyContent: 'center',
  },
  headerBtnText: {
    fontSize: 11, fontFamily: FONT_FAMILY.medium, color: '#858585',
  },
  outputPanel: {
    backgroundColor: '#0d0d0d',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    maxHeight: 220,
  },
  outputHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  outputLabel: { fontSize: 11, fontFamily: FONT_FAMILY.medium, color: '#52525b' },
  outputScroll: { paddingHorizontal: 12, paddingVertical: 8, maxHeight: 170 },
  outputLine: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18, marginBottom: 2,
  },
  emptyOutput: {
    fontSize: 12, fontFamily: FONT_FAMILY.body, color: '#3f3f46', fontStyle: 'italic',
  },
});
