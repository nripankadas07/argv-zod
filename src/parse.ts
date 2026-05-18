/**
 * The `parse` entry point — convert a raw argv array into a typed
 * `{ values, positional }` result against a `SchemaMap`.
 *
 * Parser semantics (deliberately strict and predictable):
 *
 *   * Long flags use kebab-case derived from the schema key
 *     (`maxRetries` -> `--max-retries`). Aliases are matched as either
 *     `-x` (single char) or `--alias` (multi-char).
 *   * `--flag=value` and `--flag value` forms both work for non-boolean
 *     options. `-x=value` and `-x value` both work for aliases too.
 *   * Boolean flags: `--flag` sets true, `--no-flag` sets false. Passing
 *     `--flag=true` / `--flag=false` / `--flag true` is rejected with
 *     `BAD_NEGATION` so callers cannot accidentally coerce strings into
 *     booleans.
 *   * Unknown long or short options always throw `UNKNOWN_OPTION`.
 *   * Repeating a scalar option throws `DUPLICATE_OPTION`. Array options
 *     accumulate values across repeated flags.
 *   * `--` terminates option parsing — all following tokens are
 *     positional, even if they start with `-`.
 *   * Required options (no default, not optional) that are absent from
 *     argv AND the environment throw `REQUIRED`. Env-var values are
 *     comma-split for arrays and accept `0|1|true|false` for booleans.
 *   * Negative numeric tokens (`-5`, `-1.5`) are treated as values, not
 *     options — only tokens whose first non-dash character is a letter
 *     are treated as flags.
 */

import {
  coerceArrayElement,
  coerceEnum,
  coerceNumber,
  coerceString,
} from './coerce';
import { ArgvZodError } from './errors';
import {
  ArraySchema,
  BooleanSchema,
  EnumSchema,
  NumberSchema,
  Schema,
  SchemaMap,
  StringSchema,
} from './schema';
import type { Infer } from './schema';

export interface ParseOptions {
  /** Source for env-var fallbacks; defaults to `process.env`. */
  readonly env?: Record<string, string | undefined>;
  /** Stop at the first non-option token and treat it + the rest as positional. */
  readonly stopAtPositional?: boolean;
}

export interface ParseResult<M extends SchemaMap> {
  readonly values: Infer<M>;
  readonly positional: readonly string[];
}

interface NameTables {
  readonly canonical: Map<string, string>;
  readonly schemaByCanonical: Map<string, Schema>;
}

const FLAG_PATTERN = /^[A-Za-z]/;

export function parse<M extends SchemaMap>(
  argv: readonly string[],
  schema: M,
  options: ParseOptions = {},
): ParseResult<M> {
  if (!Array.isArray(argv)) {
    throw new ArgvZodError('SCHEMA_INVALID', 'argv must be an array of strings');
  }
  const env = options.env ?? processEnvOrEmpty();
  const tables = buildNameTables(schema);
  const collected: Record<string, unknown> = {};
  const seen = new Set<string>();
  const positional: string[] = [];
  let stopOptionParsing = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (typeof token !== 'string') {
      throw new ArgvZodError('SCHEMA_INVALID', `argv[${index}] is not a string`);
    }
    if (stopOptionParsing) {
      positional.push(token);
      continue;
    }
    if (token === '--') {
      stopOptionParsing = true;
      continue;
    }
    if (looksLikeFlag(token)) {
      index = consumeFlag(token, argv, index, tables, collected, seen);
      continue;
    }
    positional.push(token);
    if (options.stopAtPositional === true) {
      stopOptionParsing = true;
    }
  }
  applyDefaultsAndEnv(schema, collected, seen, env);
  return { values: collected as Infer<M>, positional };
}

/* istanbul ignore next -- harness always provides process */
function processEnvOrEmpty(): Record<string, string | undefined> {
  if (typeof process !== 'undefined') {
    return process.env;
  }
  return {};
}

function looksLikeFlag(token: string): boolean {
  if (token.startsWith('--')) {
    return token.length > 2 && FLAG_PATTERN.test(token.slice(2));
  }
  if (token.startsWith('-')) {
    return token.length > 1 && FLAG_PATTERN.test(token.slice(1));
  }
  return false;
}

function buildNameTables(schema: SchemaMap): NameTables {
  const canonical = new Map<string, string>();
  const schemaByCanonical = new Map<string, Schema>();
  for (const [key, value] of Object.entries(schema)) {
    const flag = toKebabCase(key);
    if (canonical.has(flag)) {
      throw new ArgvZodError('SCHEMA_INVALID', `duplicate flag --${flag}`);
    }
    canonical.set(flag, key);
    schemaByCanonical.set(key, value);
    for (const alias of value.base.aliases) {
      if (canonical.has(alias)) {
        throw new ArgvZodError('SCHEMA_INVALID', `duplicate alias ${alias} for ${key}`);
      }
      canonical.set(alias, key);
    }
  }
  return { canonical, schemaByCanonical };
}

function toKebabCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter, index) =>
    index === 0 ? letter.toLowerCase() : `-${letter.toLowerCase()}`,
  );
}

interface ParsedFlagToken {
  readonly name: string;
  readonly inlineValue: string | undefined;
  readonly isNegated: boolean;
}

function splitFlagToken(token: string): ParsedFlagToken {
  const stripped = token.startsWith('--') ? token.slice(2) : token.slice(1);
  const equalsIndex = stripped.indexOf('=');
  if (equalsIndex === -1) {
    if (stripped.startsWith('no-')) {
      return { name: stripped.slice(3), inlineValue: undefined, isNegated: true };
    }
    return { name: stripped, inlineValue: undefined, isNegated: false };
  }
  const name = stripped.slice(0, equalsIndex);
  const value = stripped.slice(equalsIndex + 1);
  if (name.startsWith('no-')) {
    return { name: name.slice(3), inlineValue: value, isNegated: true };
  }
  return { name, inlineValue: value, isNegated: false };
}

function resolveCanonicalKey(name: string, isNegated: boolean, tables: NameTables): string {
  const direct = tables.canonical.get(name);
  if (direct !== undefined) {
    return direct;
  }
  if (isNegated) {
    throw new ArgvZodError(
      'UNKNOWN_OPTION',
      `unknown negated option --no-${name}`,
      { optionName: name },
    );
  }
  throw new ArgvZodError('UNKNOWN_OPTION', `unknown option --${name}`, { optionName: name });
}

function consumeFlag(
  token: string,
  argv: readonly string[],
  index: number,
  tables: NameTables,
  collected: Record<string, unknown>,
  seen: Set<string>,
): number {
  const parsed = splitFlagToken(token);
  const canonicalKey = resolveCanonicalKey(parsed.name, parsed.isNegated, tables);
  const optionSchema = tables.schemaByCanonical.get(canonicalKey);
  /* istanbul ignore if -- canonical key always maps back to the schema */
  if (optionSchema === undefined) {
    throw new ArgvZodError('UNKNOWN_OPTION', `unknown option ${canonicalKey}`);
  }
  if (optionSchema instanceof BooleanSchema) {
    return applyBooleanFlag(canonicalKey, parsed, index, collected, seen);
  }
  if (parsed.isNegated) {
    throw new ArgvZodError(
      'BAD_NEGATION',
      `--no- prefix only valid on boolean options, not --${canonicalKey}`,
      { optionName: canonicalKey },
    );
  }
  return applyValueFlag(canonicalKey, parsed, optionSchema, argv, index, collected, seen);
}

function applyBooleanFlag(
  canonicalKey: string,
  parsed: ParsedFlagToken,
  index: number,
  collected: Record<string, unknown>,
  seen: Set<string>,
): number {
  if (parsed.inlineValue !== undefined) {
    throw new ArgvZodError(
      'BAD_NEGATION',
      `boolean --${canonicalKey} cannot take an inline value`,
      { optionName: canonicalKey, received: parsed.inlineValue },
    );
  }
  if (seen.has(canonicalKey)) {
    throw new ArgvZodError(
      'DUPLICATE_OPTION',
      `--${canonicalKey} given more than once`,
      { optionName: canonicalKey },
    );
  }
  collected[canonicalKey] = !parsed.isNegated;
  seen.add(canonicalKey);
  return index;
}

function applyValueFlag(
  canonicalKey: string,
  parsed: ParsedFlagToken,
  optionSchema: Schema,
  argv: readonly string[],
  index: number,
  collected: Record<string, unknown>,
  seen: Set<string>,
): number {
  let nextIndex = index;
  let raw = parsed.inlineValue;
  if (raw === undefined) {
    nextIndex = index + 1;
    if (nextIndex >= argv.length) {
      throw new ArgvZodError(
        'MISSING_VALUE',
        `--${canonicalKey} requires a value`,
        { optionName: canonicalKey },
      );
    }
    raw = argv[nextIndex];
    /* istanbul ignore if -- argv element type already validated above */
    if (typeof raw !== 'string') {
      throw new ArgvZodError('SCHEMA_INVALID', `argv[${nextIndex}] is not a string`);
    }
  }
  storeValue(canonicalKey, raw, optionSchema, collected, seen);
  return nextIndex;
}

function storeValue(
  canonicalKey: string,
  raw: string,
  optionSchema: Schema,
  collected: Record<string, unknown>,
  seen: Set<string>,
): void {
  if (optionSchema instanceof ArraySchema) {
    const list = (collected[canonicalKey] as unknown[] | undefined) ?? [];
    list.push(coerceArrayElement(canonicalKey, raw, optionSchema));
    collected[canonicalKey] = list;
    seen.add(canonicalKey);
    return;
  }
  if (seen.has(canonicalKey)) {
    throw new ArgvZodError(
      'DUPLICATE_OPTION',
      `--${canonicalKey} given more than once`,
      { optionName: canonicalKey },
    );
  }
  collected[canonicalKey] = coerceScalar(canonicalKey, raw, optionSchema);
  seen.add(canonicalKey);
}

function coerceScalar(canonicalKey: string, raw: string, optionSchema: Schema): unknown {
  if (optionSchema instanceof StringSchema) {
    return coerceString(canonicalKey, raw, optionSchema);
  }
  if (optionSchema instanceof NumberSchema) {
    return coerceNumber(canonicalKey, raw, optionSchema);
  }
  if (optionSchema instanceof EnumSchema) {
    return coerceEnum(canonicalKey, raw, optionSchema);
  }
  /* istanbul ignore next */
  throw new ArgvZodError('SCHEMA_INVALID', `unsupported schema kind for --${canonicalKey}`);
}

function applyDefaultsAndEnv(
  schema: SchemaMap,
  collected: Record<string, unknown>,
  seen: Set<string>,
  env: Record<string, string | undefined>,
): void {
  for (const [key, optionSchema] of Object.entries(schema)) {
    if (seen.has(key)) {
      continue;
    }
    const envValue = optionSchema.base.envVar !== undefined ? env[optionSchema.base.envVar] : undefined;
    if (envValue !== undefined) {
      applyEnvValue(key, envValue, optionSchema, collected);
      continue;
    }
    if (optionSchema.base.hasDefault) {
      collected[key] = cloneDefault(optionSchema.base.defaultValue);
      continue;
    }
    if (optionSchema.base.optional) {
      continue;
    }
    throw new ArgvZodError('REQUIRED', `--${toKebabCase(key)} is required`, { optionName: key });
  }
}

function applyEnvValue(
  key: string,
  raw: string,
  optionSchema: Schema,
  collected: Record<string, unknown>,
): void {
  if (optionSchema instanceof BooleanSchema) {
    collected[key] = parseEnvBoolean(key, raw);
    return;
  }
  if (optionSchema instanceof ArraySchema) {
    const list: unknown[] = [];
    const parts = raw.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
    for (const part of parts) {
      list.push(coerceArrayElement(key, part, optionSchema));
    }
    collected[key] = list;
    return;
  }
  collected[key] = coerceScalar(key, raw, optionSchema);
}

function parseEnvBoolean(key: string, raw: string): boolean {
  const lower = raw.toLowerCase();
  if (lower === 'true' || lower === '1') return true;
  if (lower === 'false' || lower === '0') return false;
  throw new ArgvZodError(
    'INVALID_VALUE',
    `env value for --${key} must be one of 0|1|true|false, got ${JSON.stringify(raw)}`,
    { optionName: key, received: raw },
  );
}

function cloneDefault(value: unknown): unknown {
  if (Array.isArray(value)) {
    return [...value];
  }
  return value;
}
