# prettier-plugin-insert-comma

A [Prettier](https://prettier.io/) plugin that automatically inserts missing commas in multi-line object properties before formatting.

Prettier cannot format code with syntax errors like missing commas in objects. This plugin runs as a preprocessor to insert commas between properties, allowing Prettier to format your code successfully.

## Example

**Before** — Prettier would throw a parse error:

```js
const config = {
  host: 'localhost'
  port: 3000
  options: {
    debug: true
    verbose: false
  }
}
```

**After** — commas are inserted, Prettier formats normally:

```js
const config = {
  host: 'localhost',
  port: 3000,
  options: {
    debug: true,
    verbose: false,
  },
};
```

## Installation

Install `prettier-plugin-insert-comma` as a dev dependency:

```sh
npm install -D prettier prettier-plugin-insert-comma
```

Then add the plugin to your [Prettier configuration](https://prettier.io/docs/configuration.html):

```jsonc
// .prettierrc
{
  "plugins": ["prettier-plugin-insert-comma"],
}
```

For JSON files, you need to specify the parser explicitly with `overrides`:

```json
{
  "plugins": ["prettier-plugin-insert-comma"],
  "overrides": [
    {
      "files": ["*.json"],
      "options": {
        "parser": "json",
        "quoteProps": "preserve",
        "singleQuote": false,
        "trailingComma": "none"
      }
    }
  ]
}
```

## Supported Parsers

| Parser       | Languages       |
| ------------ | --------------- |
| `typescript` | TypeScript, TSX |
| `babel`      | JavaScript, JSX |
| `json`       | JSON            |
