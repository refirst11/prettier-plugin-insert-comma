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

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];

    // 1. Handle Strings
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

    // 3. String Start
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      quote = ch;
      isEscaped = false;
      out += ch;
      continue;
    }

    // 4. Nesting depth
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;

    // 5. Detect missing comma
    if (depth > 0 && ch === '\n') {
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
        /^[^\n:]+:/.test(nextSlice);

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
