import typescriptParser from 'prettier/plugins/typescript';
import babelParser from 'prettier/plugins/babel';
import type { Parser, ParserOptions } from 'prettier';

function fixMissingCommas(code: string, skipTrailing = false): string {
  let depth = 0;
  let inString = false;
  let quote: string | null = null;
  let isEscaped = false;
  let out = '';
  let lastWasComment = false;

  // Template literal tracking:
  // We completely skip processing any code inside template literals
  // to keep the code simpler and more performant.
  let inTemplateLiteral = false;

  const recentTokens: string[] = [];
  let currentWord = '';
  const blockStack: ('object' | 'block')[] = [];

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];

    // Token tracking for block vs object context
    if (!inString && !inTemplateLiteral && !lastWasComment) {
      if (/[a-zA-Z0-9_$]/.test(ch)) {
        currentWord += ch;
      } else {
        if (currentWord) {
          recentTokens.push(currentWord);
          if (recentTokens.length > 5) recentTokens.shift();
          currentWord = '';
        }
        if (!/\s/.test(ch)) {
          if (ch === '/' && (code[i + 1] === '/' || code[i + 1] === '*')) {
            // ignore comment delimiters
          } else if (ch === '=' && code[i + 1] === '>') {
            recentTokens.push('=>');
            if (recentTokens.length > 5) recentTokens.shift();
          } else {
            recentTokens.push(ch);
            if (recentTokens.length > 5) recentTokens.shift();
          }
        }
      }
    }

    // 1a. Handle Template Literals (skip entirely)
    if (inTemplateLiteral) {
      out += ch;
      if (isEscaped) {
        isEscaped = false;
      } else if (ch === '\\') {
        isEscaped = true;
      } else if (ch === '`') {
        inTemplateLiteral = false;
      }
      continue;
    }

    // 1b. Handle regular Strings (' and ")
    if (inString) {
      out += ch;
      if (isEscaped) {
        isEscaped = false;
      } else if (ch === '\\') {
        isEscaped = true;
      } else if (ch === quote) {
        inString = false;
      }
      continue;
    }

    // 2. Handle Comments
    if (ch === '/' && code[i + 1] === '/') {
      const lineEnd = code.indexOf('\n', i);
      const comment = code.slice(i, lineEnd === -1 ? code.length : lineEnd);
      out += comment;
      i += comment.length - 1;
      lastWasComment = true;
      continue;
    }
    if (ch === '/' && code[i + 1] === '*') {
      const endIdx = code.indexOf('*/', i + 2);
      if (endIdx !== -1) {
        const comment = code.slice(i, endIdx + 2);
        out += comment;
        i += comment.length - 1;
        lastWasComment = true;
        continue;
      }
    }

    // 3a. Template Literal Start
    if (ch === '`') {
      inTemplateLiteral = true;
      isEscaped = false;
      out += ch;
      continue;
    }

    // 3b. Regular String Start
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      isEscaped = false;
      out += ch;
      continue;
    }

    // 4. Nesting depth (also handles template expression braces)
    if (ch === '{' || ch === '[') {
      let type: 'object' | 'block' = 'object';
      if (ch === '{') {
        if (recentTokens.length > 1) {
          const prev = recentTokens[recentTokens.length - 2];
          if (
            prev === ')' || prev === 'try' || prev === 'catch' ||
            prev === 'finally' || prev === 'else' || prev === 'do' ||
            prev === '>' || prev === 'class' || prev === 'interface' ||
            prev === 'type' || prev === 'namespace' || prev === 'enum' ||
            prev === 'get' || prev === 'set' || prev === 'module' ||
            prev === 'switch'
          ) {
            type = 'block';
          } else if (recentTokens.length > 2) {
            const prev2 = recentTokens[recentTokens.length - 3];
            if (
              prev2 === 'function' || prev2 === 'class' ||
              prev2 === 'interface' || prev2 === 'extends' ||
              prev2 === 'implements' || prev2 === 'type'
            ) {
              type = 'block';
            }
          }
        } else {
          type = 'block';
        }
      }
      blockStack.push(type);

      depth++;
    }
    if (ch === '}' || ch === ']') {
      depth--;
      blockStack.pop();
    }

    // 5. Detect missing comma
    const isObjectContext = blockStack.length > 0 && blockStack[blockStack.length - 1] === 'object';
    if (isObjectContext && ch === '\n') {
      let lastCharIdx = out.length - 1;
      while (lastCharIdx >= 0 && /\s/.test(out[lastCharIdx])) {
        lastCharIdx--;
      }

      const prev = out[lastCharIdx];

      let nextStartIdx = i + 1;
      while (nextStartIdx < code.length) {
        while (nextStartIdx < code.length && /\s/.test(code[nextStartIdx])) {
          nextStartIdx++;
        }

        if (code[nextStartIdx] === '/' && code[nextStartIdx + 1] === '/') {
          const lineEnd = code.indexOf('\n', nextStartIdx);
          nextStartIdx = lineEnd === -1 ? code.length : lineEnd + 1;
          continue;
        }

        if (code[nextStartIdx] === '/' && code[nextStartIdx + 1] === '*') {
          const endIdx = code.indexOf('*/', nextStartIdx + 2);
          nextStartIdx = endIdx === -1 ? code.length : endIdx + 2;
          continue;
        }
        break;
      }

      const nextSlice = code.slice(nextStartIdx);

      const isNextKeyOrClosing =
        nextSlice[0] === '}' ||
        nextSlice[0] === ']' ||
        /^(?:[a-zA-Z_$][a-zA-Z0-9_$]*|'[^']*'|"[^"]*"|\[[^\]\n]+\])\s*:/.test(nextSlice);

      const isPrevSeparator =
        prev === ',' ||
        prev === '{' ||
        prev === '[' ||
        prev === '(' ||
        prev === ':' ||
        prev === ';' ||
        prev === '>' || // Do not insert immediately after a JSX tag
        prev === '=' || // Do not insert immediately after an assignment operator
        prev === '?' || // Do not insert immediately after a ternary operator
        prev === undefined;

      if (isNextKeyOrClosing && !isPrevSeparator && !lastWasComment) {
        const isTrailing = nextSlice[0] === '}' || nextSlice[0] === ']';
        if (!skipTrailing || !isTrailing) {
          out += ',';
        }
      }
    }

    out += ch;
    if (!/\s/.test(ch)) {
      lastWasComment = false;
    }
  }

  return out;
}

function wrapParser(parser: Parser): Parser {
  return {
    ...parser,

    async preprocess(text: string, options: ParserOptions): Promise<string> {
      let next: string = text;

      if (parser.preprocess) {
        const result = await parser.preprocess(text, options);
        next = result;
      }

      return fixMissingCommas(next, options.trailingComma === 'none');
    },
  };
}

const plugin = {
  parsers: {
    typescript: wrapParser(typescriptParser.parsers.typescript),
    babel: wrapParser(babelParser.parsers.babel),
    json: wrapParser(babelParser.parsers.json),
  },
};

export default plugin;
