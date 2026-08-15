import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';

interface Token {
  text: string;
  type:
    | 'keyword'
    | 'control'
    | 'type'
    | 'preprocessor'
    | 'string'
    | 'comment'
    | 'number'
    | 'function'
    | 'variable'
    | 'operator'
    | 'plain';
}

const TOKEN_COLORS: Record<Token['type'], string> = {
  keyword: '#569cd6',      // Blue (int, char, float, void, const, new, etc.)
  control: '#c586c0',      // Purple (if, else, for, while, return, switch, etc.)
  type: '#4ec9b0',         // Teal (vector, string, map, set, size_t, etc.)
  preprocessor: '#c586c0', // Magenta (#include, #define, #ifdef)
  string: '#ce9178',       // Terracotta orange ("string", 'c', <iostream>)
  comment: '#6a9955',      // Forest green (// comments)
  number: '#b5cea8',       // Light sage green (0, 10, 20, 3.14)
  function: '#dcdcaa',     // Yellow (main, cout, cin, printf, push_back)
  variable: '#9cdcfe',     // Light sky blue (variables, identifiers)
  operator: '#d4d4d4',     // Off-white (+, -, =, <<, >>, etc.)
  plain: '#d4d4d4',
};

const KEYWORDS_TYPE = new Set([
  'int', 'char', 'float', 'double', 'void', 'bool', 'auto', 'long', 'short',
  'signed', 'unsigned', 'const', 'static', 'struct', 'class', 'enum', 'union',
  'namespace', 'using', 'template', 'typename', 'typedef', 'virtual', 'override',
  'public', 'private', 'protected', 'explicit', 'friend', 'inline', 'constexpr',
  'let', 'var', 'def', 'interface', 'type', 'extends', 'implements',
]);

const KEYWORDS_CONTROL = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'default', 'return', 'try', 'catch', 'throw', 'goto', 'import', 'export',
  'from', 'as', 'async', 'await', 'yield', 'pass', 'elif', 'finally', 'with',
]);

const KNOWN_TYPES = new Set([
  'vector', 'string', 'map', 'set', 'unordered_map', 'unordered_set',
  'pair', 'tuple', 'queue', 'stack', 'deque', 'priority_queue', 'list',
  'size_t', 'int32_t', 'int64_t', 'uint32_t', 'uint64_t', 'nullptr_t',
  'Array', 'Object', 'Promise', 'Number', 'Boolean', 'String', 'Record', 'Set', 'Map',
]);

const KNOWN_FUNCS = new Set([
  'main', 'cout', 'cin', 'endl', 'printf', 'scanf', 'malloc', 'free',
  'push_back', 'pop_back', 'emplace_back', 'push', 'pop', 'top', 'front', 'back',
  'insert', 'erase', 'find', 'size', 'length', 'empty', 'clear', 'begin', 'end',
  'sort', 'reverse', 'min', 'max', 'swap', 'abs', 'sqrt', 'pow', 'log',
  'print', 'range', 'len', 'append', 'extend', 'split', 'join', 'console',
]);

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = line.length;

  while (i < n) {
    // 1. Single-line comment: // or # (when not preprocessor)
    if (line.slice(i, i + 2) === '//') {
      tokens.push({ text: line.slice(i), type: 'comment' });
      break;
    }

    // 2. Preprocessor directive (#include, #define, #ifdef)
    if (i === 0 && line.trimStart().startsWith('#')) {
      const match = line.match(/^(\s*#\s*\w+)(\s*(?:<[^>]+>|"[^"]+"))?(.*)$/);
      if (match) {
        tokens.push({ text: match[1], type: 'preprocessor' });
        if (match[2]) {
          tokens.push({ text: match[2], type: 'string' });
        }
        if (match[3]) {
          // parse remainder of line (e.g. comment)
          tokens.push(...tokenizeLine(match[3]));
        }
        break;
      }
    }

    // 3. String literals ("..." or '...')
    if (line[i] === '"' || line[i] === "'") {
      const quote = line[i];
      let str = quote;
      i++;
      while (i < n && line[i] !== quote) {
        if (line[i] === '\\' && i + 1 < n) {
          str += line[i] + line[i + 1];
          i += 2;
        } else {
          str += line[i];
          i++;
        }
      }
      if (i < n) {
        str += line[i];
        i++;
      }
      tokens.push({ text: str, type: 'string' });
      continue;
    }

    // 4. Number literals (0, 10, 0x1F, 3.14, etc.)
    if (/\d/.test(line[i])) {
      let num = '';
      while (i < n && /[0-9a-fA-FxX.]/.test(line[i])) {
        num += line[i];
        i++;
      }
      tokens.push({ text: num, type: 'number' });
      continue;
    }

    // 5. Identifiers / Keywords / Types / Function names
    if (/[a-zA-Z_]/.test(line[i])) {
      let word = '';
      while (i < n && /[a-zA-Z0-9_]/.test(line[i])) {
        word += line[i];
        i++;
      }

      // Check if followed by ( for function call
      let isFollowedByParen = false;
      let peek = i;
      while (peek < n && /\s/.test(line[peek])) peek++;
      if (peek < n && line[peek] === '(') {
        isFollowedByParen = true;
      }

      if (KEYWORDS_CONTROL.has(word)) {
        tokens.push({ text: word, type: 'control' });
      } else if (KEYWORDS_TYPE.has(word)) {
        tokens.push({ text: word, type: 'keyword' });
      } else if (KNOWN_TYPES.has(word)) {
        tokens.push({ text: word, type: 'type' });
      } else if (KNOWN_FUNCS.has(word) || isFollowedByParen) {
        tokens.push({ text: word, type: 'function' });
      } else {
        tokens.push({ text: word, type: 'variable' });
      }
      continue;
    }

    // 6. Multi-char operators (<<, >>, ==, !=, <=, >=, &&, ||, ++, --, ->, ::)
    const two = line.slice(i, i + 2);
    if (['<<', '>>', '==', '!=', '<=', '>=', '&&', '||', '++', '--', '->', '::', '+=', '-=', '*=', '/='].includes(two)) {
      tokens.push({ text: two, type: 'operator' });
      i += 2;
      continue;
    }

    // 7. Single char punctuation / symbols / whitespace
    tokens.push({ text: line[i], type: line[i] === ' ' ? 'plain' : 'operator' });
    i++;
  }

  return tokens;
}

interface VsCodeSyntaxHighlighterProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
}

export const VsCodeSyntaxHighlighter: React.FC<VsCodeSyntaxHighlighterProps> = ({
  code,
  showLineNumbers = true,
}) => {
  const lines = useMemo(() => {
    const rawLines = (code || '').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
    return rawLines.map((line, idx) => ({
      lineNum: idx + 1,
      tokens: tokenizeLine(line),
    }));
  }, [code]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContainer}>
      <View style={styles.codeContainer}>
        {lines.map(({ lineNum, tokens }) => (
          <View key={lineNum} style={styles.lineRow}>
            {showLineNumbers && (
              <Text style={styles.lineNumText} selectable={false}>
                {String(lineNum).padStart(2, ' ')}
              </Text>
            )}
            <Text style={styles.codeLine} selectable>
              {tokens.map((token, tIdx) => (
                <Text
                  key={tIdx}
                  style={[
                    styles.tokenText,
                    { color: TOKEN_COLORS[token.type] },
                    token.type === 'comment' && styles.commentText,
                  ]}
                >
                  {token.text}
                </Text>
              ))}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  codeContainer: {
    flexDirection: 'column',
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 20,
  },
  lineNumText: {
    width: 24,
    color: '#6e7681',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 20,
    textAlign: 'right',
    marginRight: 12,
    userSelect: 'none' as any,
  },
  codeLine: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  tokenText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  commentText: {
    fontStyle: 'italic',
  },
});

export default VsCodeSyntaxHighlighter;
