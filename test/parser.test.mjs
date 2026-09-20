import assert from 'node:assert/strict';
import test from 'node:test';
import { format } from 'prettier';
import plugin from '../dist/index.js';

const getSection = `function getSection(nodes: Node[], url: string, section = ''): string | undefined {
  let current = section;
  for (const node of nodes) {
    if (node.type === 'separator') current = typeof node.name === 'string' ? node.name : section;
    if (node.type === 'page' && node.url === url) return current;
    if (node.type === 'folder') {
      if (node.index?.url === url) return current;
      const found = getSection(node.children, url, current);
      if (found !== undefined) return found;
    }
  }
};`;

for (const trailingComma of ['all', 'es5', 'none']) {
  test(`typed function preserves normal formatting (${trailingComma})`, async () => {
    const options = { parser: 'typescript', trailingComma };
    assert.equal(
      await format(getSection, { ...options, plugins: [plugin] }),
      await format(getSection, options),
    );
  });
}

for (const parser of ['typescript', 'babel', 'json']) {
  test(`repairs nested properties (${parser})`, async () => {
    const broken =
      '{\n"a": 1\n"b": {\n"c": true\n"d": false\n}\n"e": [1, 2]\n}';
    const fixed =
      '{\n"a": 1,\n"b": {\n"c": true,\n"d": false\n},\n"e": [1, 2]\n}';
    const wrap = (s) => (parser === 'json' ? s : `const value = ${s};`);
    for (const trailingComma of ['all', 'none']) {
      const options = { parser, trailingComma };
      const result = await format(wrap(broken), {
        ...options,
        plugins: [plugin],
      });
      assert.equal(result, await format(wrap(fixed), options));
      assert.equal(
        await format(result, { ...options, plugins: [plugin] }),
        result,
      );
    }
  });
}

test('repairs an object alongside a typed function', async () => {
  const broken = `${getSection}\nconst config = {\na: 1\nb: 2\n};`;
  const fixed = `${getSection}\nconst config = {\na: 1,\nb: 2\n};`;
  assert.equal(
    await format(broken, { parser: 'typescript', plugins: [plugin] }),
    await format(fixed, { parser: 'typescript' }),
  );
});

test('tracks parentheses inside property values', async () => {
  const broken = `const config = {\na: (condition ? value\n: fallback)\nb: 2\n};`;
  assert.equal(
    await format(broken, { parser: 'babel', plugins: [plugin] }),
    await format(broken.replace(')\nb', '),\nb'), { parser: 'babel' }),
  );
});

for (const source of [
  'const value = /[{}]/;\nconst config = { value };',
  'const view = <div>{items.map(item => <span>{item}</span>)}</div>;',
  'const text = `outer ${`inner ${value}`} tail`;',
  'function value(): { a: string } { return { a: "x" }; }',
  'interface Value { a: string\nb: number }',
]) {
  test(`preserves valid syntax: ${source}`, async () => {
    assert.equal(
      await format(source, { parser: 'typescript', plugins: [plugin] }),
      await format(source, { parser: 'typescript' }),
    );
  });
}

test('preserves the original error when repair fails', async () => {
  const source = 'const value = {\na: 1\nb: @\n};';
  let original;
  try {
    await format(source, { parser: 'babel' });
  } catch (error) {
    original = error;
  }
  assert.ok(original);
  await assert.rejects(
    format(source, { parser: 'babel', plugins: [plugin] }),
    (error) => error.message === original.message,
  );
});

// Mark the intended comma with § so the expected source is independently
// specified, including the exact contents of strings, templates and comments.
const repairs = [
  ['line comment', 'const x = {\na: 1§ // comment\nb: 2\n};'],
  ['block comment', 'const x = {\na: 1§ /* comment */\nb: 2\n};'],
  ['multiline comment', 'const x = {\na: 1 /* comment\nmore */§ b: 2\n};'],
  ['comment before property', 'const x = {\na: 1§\n// next property\nb: 2\n};'],
  ['regex closing brace', 'const re = /}/;\nconst x = {\na: 1§\nb: 2\n};'],
  ['regex character class', 'const x = {\na: /[{}()[\]`]/§\nb: 2\n};'],
  [
    'regex escapes',
    String.raw`const x = {
a: /https?:\/\/[a-z]+/§
b: 2
};`,
  ],
  ['division', 'const x = {\na: total / count / 2§\nb: 2\n};'],
  ['shorthand property', 'const x = {\na: 1§\nb\n};'],
  ['method', 'const x = {\na: 1§\nb() {}\n};'],
  ['async method', 'const x = {\na: 1§\nasync b() {}\n};'],
  ['generator method', 'const x = {\na: 1§\n*b() { yield 2; }\n};'],
  ['getter', 'const x = {\na: 1§\nget b() { return 2; }\n};'],
  ['numeric key', 'const x = {\na: 1§\n2: 2\n};'],
  ['Japanese key', 'const x = {\na: 1§\n名前: 2\n};'],
  ['computed key', 'const x = {\na: 1§\n[call("x")]: 2\n};'],
  ['spread', 'const x = {\na: 1§\n...rest\n};'],
  ['JSX self-closing element', 'const x = {\na: <div />§\nb: 2\n};'],
  [
    'JSX children',
    'const x = {\na: <div><span>{`value ${1}`}</span></div>§\nb: 2\n};',
  ],
  ['JSX text', 'const x = {\na: <div>hello\na: 1\nb: 2</div>§\nb: 2\n};'],
  ['reserved property name', 'const x = {\ntype: {\na: 1§\nb: 2\n}\n};'],
  ['template raw text', 'const x = {\na: `value\na: 1\nb: 2`§\nb: 2\n};'],
  [
    'nested template raw text',
    'const text = `outer ${`{\na: 1\nb: 2\n}`} tail`;\nconst x = {\na: 1§\nb: 2\n};',
  ],
  [
    'template interpolation object',
    'const text = `outer ${{\na: 1§\nb: 2\n}} tail`;',
  ],
  [
    'multiple repairs',
    'const x = {\na: 1§ // one\nb: {\nc: 3§\nd: 4\n}§\ne\n};',
  ],
  ['CRLF', 'const x = {\r\na: 1§ // comment\r\nb: 2\r\n};'],
  ['astral Unicode before error', 'const x = {\na: "😀"§\n名前: 2\n};'],
];

for (const parser of ['typescript', 'babel']) {
  for (const [name, marked] of repairs) {
    test(`repairs ${name} (${parser})`, async () => {
      const source = marked.replaceAll('§', '');
      const expectedSource = marked.replaceAll('§', ',');
      const options = {
        parser,
        ...(name.startsWith('JSX') ? { filepath: 'test.tsx' } : {}),
      };
      const expected = await format(expectedSource, options);
      const actual = await format(source, { ...options, plugins: [plugin] });
      assert.equal(actual, expected);
      assert.equal(
        await format(actual, { ...options, plugins: [plugin] }),
        actual,
      );
      // Valid input must continue to bypass repair entirely.
      assert.equal(
        await format(expectedSource, { ...options, plugins: [plugin] }),
        expected,
      );
    });
  }
}

test('JSON strings and Unicode keys are preserved across multiple repairs', async () => {
  const source =
    '{\n"a": "{\\\"b\\\":2}"\n"名前": "😀"\n"nested": {\n"c": 3\n"d": 4\n}\n}';
  const options = { parser: 'json' };
  const actual = await format(source, { ...options, plugins: [plugin] });
  assert.deepEqual(JSON.parse(actual), {
    a: '{"b":2}',
    名前: '😀',
    nested: { c: 3, d: 4 },
  });
});

for (const parser of ['typescript', 'babel', 'json']) {
  test(`rolls back incomplete recovery (${parser})`, async () => {
    const source = '{\n"a": 1\n"b": 2\n"c": @\n}';
    const text = parser === 'json' ? source : `const x = ${source};`;
    const result = await plugin.parsers[parser].preprocess(text, { parser });
    assert.equal(result, text);
  });
}

test('bounds recovery attempts and returns original input', async () => {
  const source = `const x = {\n${Array.from({ length: 102 }, (_, i) => `p${i}: ${i}`).join('\n')}\n};`;
  assert.equal(
    await plugin.parsers.typescript.preprocess(source, {
      parser: 'typescript',
    }),
    source,
  );
});

test('supports exactly 100 missing commas', async () => {
  const source = `const x = {\n${Array.from({ length: 101 }, (_, i) => `p${i}: ${i}`).join('\n')}\n};`;
  const expected = `const x = {\n${Array.from({ length: 101 }, (_, i) => `p${i}: ${i}`).join(',\n')}\n};`;
  assert.equal(
    await format(source, { parser: 'typescript', plugins: [plugin] }),
    await format(expected, { parser: 'typescript' }),
  );
});
