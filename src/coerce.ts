/**
 * Value coercion helpers — convert raw argv strings into the typed
 * runtime values described by each schema.
 *
 * Coercion is strict: every helper either returns a fully-validated
 * value or throws an `ArgvZodError` with a descriptive code.
 */

import { ArgvZodError } from './errors';
import {
  ArraySchema,
  EnumSchema,
  NumberSchema,
  StringSchema,
} from './schema';

const FINITE_NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const INTEGER = /^-?\d+$/;

export function coerceString(option: string, raw: string, schema: StringSchema): string {
  const { minLength, maxLength, pattern } = schema.constraints;
  if (minLength !== undefined && raw.length < minLength) {
    throw new ArgvZodError(
      'BELOW_MIN',
      `--${option} requires at least ${minLength} character(s), got ${raw.length}`,
      { optionName: option, received: raw },
    );
  }
  if (maxLength !== undefined && raw.length > maxLength) {
    throw new ArgvZodError(
      'ABOVE_MAX',
      `--${option} accepts at most ${maxLength} character(s), got ${raw.length}`,
      { optionName: option, received: raw },
    );
  }
  if (pattern !== undefined && !pattern.test(raw)) {
    throw new ArgvZodError(
      'PATTERN_MISMATCH',
      `--${option} value ${JSON.stringify(raw)} does not match ${pattern.toString()}`,
      { optionName: option, received: raw },
    );
  }
  return raw;
}

function rejectNonInteger(option: string, raw: string, value: number): void {
  if (!INTEGER.test(raw)) {
    throw new ArgvZodError(
      'INVALID_INTEGER',
      `--${option} expected an integer, got ${JSON.stringify(raw)}`,
      { optionName: option, received: raw },
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new ArgvZodError(
      'INVALID_INTEGER',
      `--${option} expected a safe integer, got ${value}`,
      { optionName: option, received: raw },
    );
  }
}

function parseNumberOrThrow(option: string, raw: string, integerOnly: boolean): number {
  if (!FINITE_NUMBER.test(raw)) {
    throw new ArgvZodError(
      'INVALID_NUMBER',
      `--${option} expected a finite number, got ${JSON.stringify(raw)}`,
      { optionName: option, received: raw },
    );
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new ArgvZodError(
      'INVALID_NUMBER',
      `--${option} resolves to non-finite ${value}`,
      { optionName: option, received: raw },
    );
  }
  if (integerOnly) {
    rejectNonInteger(option, raw, value);
  }
  return value;
}

function enforceNumericBounds(option: string, raw: string, value: number, schema: NumberSchema): void {
  if (schema.constraints.min !== undefined && value < schema.constraints.min) {
    throw new ArgvZodError(
      'BELOW_MIN',
      `--${option} must be >= ${schema.constraints.min}, got ${value}`,
      { optionName: option, received: raw },
    );
  }
  if (schema.constraints.max !== undefined && value > schema.constraints.max) {
    throw new ArgvZodError(
      'ABOVE_MAX',
      `--${option} must be <= ${schema.constraints.max}, got ${value}`,
      { optionName: option, received: raw },
    );
  }
}

export function coerceNumber(option: string, raw: string, schema: NumberSchema): number {
  const value = parseNumberOrThrow(option, raw, schema.constraints.integerOnly);
  enforceNumericBounds(option, raw, value, schema);
  return value;
}

export function coerceEnum<V extends string>(
  option: string,
  raw: string,
  schema: EnumSchema<V>,
): V {
  if (!schema.choices.includes(raw as V)) {
    throw new ArgvZodError(
      'CHOICE_MISMATCH',
      `--${option} must be one of [${schema.choices.join(', ')}], got ${JSON.stringify(raw)}`,
      { optionName: option, received: raw },
    );
  }
  return raw as V;
}

export function coerceArrayElement(
  option: string,
  raw: string,
  schema: ArraySchema<StringSchema | NumberSchema | EnumSchema<string>>,
): unknown {
  const inner = schema.element;
  if (inner instanceof StringSchema) {
    return coerceString(option, raw, inner);
  }
  if (inner instanceof NumberSchema) {
    return coerceNumber(option, raw, inner);
  }
  return coerceEnum(option, raw, inner);
}
