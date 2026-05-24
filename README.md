# argv-zod

Type-safe argv parser with a Zod-style fluent schema builder. Inferred
result types, env-var fallbacks, aliases, defaults, choices, and
per-field validation. **Zero runtime dependencies.**

- 115 tests, **100 % statements / 100 % branches / 100 % functions / 100 % lines** via Jest
- `tsc --strict` clean (with `exactOptionalPropertyTypes`, `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`)
- Node 18+
- Every public function validates its input and throws an
  `ArgvZodError` (with a stable `code` discriminator) on bad data —
  never silently coerces

## Installation

```bash
npm install && npm run build
```

## Quick example

```ts
import { parse, z, type Infer } from 'argv-zod';

const schema = {
  port: z.integer().min(1).max(65535).default(3000),
  host: z.string().default('localhost'),
  verbose: z.boolean().default(false).alias('v'),
  mode: z.enum(['dev', 'prod']).default('dev'),
  tag: z.array(z.string()).optional(),
} as const;

type Config = Infer<typeof schema>;
//   ^? { port: number; host: string; verbose: boolean;
//        mode: 'dev' | 'prod'; tag: readonly string[] | undefined }

const { values, positional } = parse(process.argv.slice(2), schema);

console.log(values, positional);
```

Run as:

```bash
node app.js --port 8080 --no-verbose --tag a --tag b -- extra1 extra2
# → values: { port: 8080, host: 'localhost', verbose: false, mode: 'dev', tag: ['a', 'b'] }
# → positional: ['extra1', 'extra2']
```

## Schema builders

| Builder | Description | Constraint methods |
| --- | --- | --- |
| `z.string()` | A required string. | `.min(n)`, `.max(n)`, `.regex(pattern)` |
| `z.number()` | A finite number (decimals OK). | `.min(n)`, `.max(n)`, `.int()` |
| `z.integer()` | Shorthand for `z.number().int()`. | `.min(n)`, `.max(n)` |
| `z.boolean()` | A flag (`--name` / `--no-name`). | — |
| `z.enum([...])` | One of a fixed set of strings. | — |
| `z.array(inner)` | Repeated values; `inner` is a string/number/integer/enum. | — |

Every schema instance also exposes `.alias(name)`, `.env('VAR')`,
`.default(value)`, `.optional()`, and `.describe(text)`. Calls are
chainable and immutable — each returns a fresh schema.

## Parser semantics

| Form | Meaning |
| --- | --- |
| `--flag value` | Set `flag` to `value`. |
| `--flag=value` | Same as above. |
| `--flag` | Set `flag` to `true` (boolean only). |
| `--no-flag` | Set `flag` to `false` (boolean only). |
| `-f value`, `-f=value` | Short alias forms. |
| `--` | Terminator; everything after is positional. |
| `--flag a --flag b` | Array option accumulates. |

Strict rules:

- Unknown options always throw `UNKNOWN_OPTION`.
- Repeating a scalar option throws `DUPLICATE_OPTION`.
- A boolean cannot take an inline value (`--flag=true` throws `BAD_NEGATION`).
- A non-boolean cannot be negated (`--no-host` throws `BAD_NEGATION`).
- Required options absent from both argv AND the environment throw `REQUIRED`.
- Negative numeric tokens (`-5`, `-1.5`) are taken as values, not flags.
- Camel-case keys auto-kebab: `maxRetries` → `--max-retries`.

## Environment fallback

```ts
parse(
  [],
  { port: z.integer().env('PORT').default(3000) },
  { env: { PORT: '8080' } },
);
// → values: { port: 8080 }
```

The CLI argument always wins over the env value, which always wins
over the default. Booleans accept `0|1|true|false` from the
environment; arrays are comma-split.

## Help text

```ts
import { formatHelp, z } from 'argv-zod';

console.log(formatHelp(schema, {
  programName: 'mycli',
  description: 'Frob the widgets.',
}));
```

## Errors

```ts
import { ArgvZodError, parse, z } from 'argv-zod';

try {
  parse(['--port', 'oops'], { port: z.integer() });
} catch (err) {
  if (err instanceof ArgvZodError) {
    console.error(err.code);        // 'INVALID_NUMBER'
    console.error(err.optionName);  // 'port'
    console.error(err.received);    // 'oops'
    console.error(err.message);
  }
}
```

The `code` field is one of:

```
SCHEMA_INVALID    UNKNOWN_OPTION    MISSING_VALUE    DUPLICATE_OPTION
INVALID_VALUE     BAD_NEGATION      CHOICE_MISMATCH  BELOW_MIN
ABOVE_MAX         PATTERN_MISMATCH  REQUIRED         INVALID_INTEGER
INVALID_NUMBER
```

## Running tests

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # jest
npm run test:coverage
```

## License

MIT — see [LICENSE](LICENSE).
