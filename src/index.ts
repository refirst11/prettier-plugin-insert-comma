import typescriptParser from 'prettier/plugins/typescript';
import babelParser from 'prettier/plugins/babel';
import type { Parser } from 'prettier';

// Bound the work for malformed or unusually large inputs: each repair requires
// another parse. If recovery cannot finish, return the original source intact.
const MAX_REPAIRS = 100;

function missingCommaOffset(error: unknown, text: string): number | undefined {
  if (!(error instanceof Error)) return;
  if (
    !/^',' expected\./.test(error.message) &&
    !/^Unexpected token, expected ","/.test(error.message)
  ) {
    return;
  }

  // Prettier's parser errors expose one-based line and column locations.
  const { loc } = error as Error & {
    loc?: { start?: { line?: number; column?: number } };
  };
  const line = loc?.start?.line;
  const column = loc?.start?.column;
  if (
    line === undefined ||
    column === undefined ||
    !Number.isInteger(line) ||
    !Number.isInteger(column) ||
    line < 1 ||
    column < 1
  ) {
    return;
  }

  let offset = 0;
  for (let currentLine = 1; currentLine < line; currentLine++) {
    const end = /\r\n|[\n\r\u2028\u2029]/g;
    end.lastIndex = offset;
    const match = end.exec(text);
    if (!match) return;
    offset = match.index + match[0].length;
  }
  const lineEnd = text.slice(offset).search(/[\n\r\u2028\u2029]/);
  if (lineEnd !== -1 && column - 1 > lineEnd) return;
  offset += column - 1;
  if (offset >= text.length) return;
  return offset;
}

function wrapParser(parser: Parser): Parser {
  return {
    ...parser,

    async preprocess(text, options) {
      const original = parser.preprocess
        ? await parser.preprocess(text, options)
        : text;
      let repaired = original;
      let previousOffset = -1;
      let minimumErrorOffset = -1;

      for (let repairs = 0; repairs <= MAX_REPAIRS; repairs++) {
        try {
          await parser.parse(repaired, options);
          // Return the repaired source through preprocess so Prettier's source
          // locations and comment attachment refer to the same text as the AST.
          return repaired;
        } catch (error) {
          if (repairs === MAX_REPAIRS) return original;
          const errorOffset = missingCommaOffset(error, repaired);
          if (errorOffset === undefined || errorOffset <= minimumErrorOffset) {
            return original;
          }
          let offset = errorOffset;
          // A computed key can be parsed as indexing on the preceding value;
          // a generator's '*' can be parsed as multiplication. In these cases
          // the diagnostic lands on ':' or '{', after the missing separator.
          const lineStart = repaired.lastIndexOf('\n', errorOffset - 1) + 1;
          const prefix = repaired.slice(lineStart, errorOffset);
          if (
            (repaired[errorOffset] === ':' && /^\s*\[/.test(prefix)) ||
            (repaired[errorOffset] === '{' && /^\s*\*/.test(prefix))
          ) {
            offset = lineStart + prefix.search(/\S/);
          }
          if (offset <= previousOffset) return original;
          // Insert at the next token, after any comments. Only the language
          // parser decides token boundaries (including JSX, regex and templates).
          repaired = `${repaired.slice(0, offset)},${repaired.slice(offset)}`;
          previousOffset = offset;
          // Require progress past the original diagnostic, not just past an
          // inserted character. Never accumulate ineffective speculative edits.
          minimumErrorOffset = errorOffset + 1;
        }
      }
      return original;
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
