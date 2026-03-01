import typescriptParser from 'prettier/parser-typescript';
import babelParser from 'prettier/parser-babel';
import type { Parser, ParserOptions } from 'prettier';

function fixMissingCommas(code: string): string {
  let depth = 0;
  let inString = false;
  let quote: string | null = null;
  let isEscaped = false;
  let out = '';

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
      continue;
    }
    if (ch === '/' && code[i + 1] === '*') {
      const endIdx = code.indexOf('*/', i + 2);
      if (endIdx !== -1) {
        const comment = code.slice(i, endIdx + 2);
        out += comment;
        i += comment.length - 1;
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
    if (depth > 0) {
      // new line case
      if (ch === '\n') {
        let lastCharIdx = out.length - 1;
        while (lastCharIdx >= 0 && /\s/.test(out[lastCharIdx])) {
          lastCharIdx--;
        }

        const prev = out[lastCharIdx];

        let nextStartIdx = i + 1;
        while (nextStartIdx < code.length && /\s/.test(code[nextStartIdx])) {
          nextStartIdx++;
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
          prev === ':' ||
          prev === ';' ||
          prev === undefined;

        if (isNextKeyOrClosing && !isPrevSeparator) {
          out += ',';
        }
      }

      // one line case
      if (ch === ' ') {
        const nextSlice = code.slice(i + 1);

        if (/^[^\n:]+:/.test(nextSlice)) {
          let lastCharIdx = out.length - 1;

          while (lastCharIdx >= 0 && /\s/.test(out[lastCharIdx])) {
            lastCharIdx--;
          }

          const prev = out[lastCharIdx];

          const isPrevSeparator =
            prev === ',' ||
            prev === '{' ||
            prev === '[' ||
            prev === ':' ||
            prev === ';' ||
            prev === undefined;

          if (!isPrevSeparator) {
            out += ',';
          }
        }
      }
    }

    out += ch;
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

      return fixMissingCommas(next);
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
