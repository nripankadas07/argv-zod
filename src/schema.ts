/**
 * Zod-style fluent schema builder for argv parsing.
 *
 * Each schema instance is immutable; calling a builder method returns a
 * new schema object with the additional constraint folded in. The
 * runtime parser introspects the instance's `kind` discriminator and
 * the constraint fields to validate, coerce, and type-narrow each
 * argv value.
 *
 * The builders are exported as the `z` namespace at the package root:
 *
 *     import { z } from 'argv-zod';
 *     const schema = {
 *         port: z.number().int().min(1).max(65535).default(3000),
 *         host: z.string().default('localhost'),
 *         verbose: z.boolean().default(false),
 *         tags: z.array(z.string()),
 *     };
 *
 * Schemas have no opinion about HOW they are used — the parser is the
 * one that maps option names, kebab-cases the argv flag, applies env
 * fallback, etc. This split keeps the schema layer a pure data type.
 */

import { ArgvZodError } from './errors';

export type SchemaKind =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'enum'
  | 'array';

interface BaseSchemaState {
  readonly description: string | undefined;
  readonly aliases: readonly string[];
  readonly envVar: string | undefined;
  readonly hasDefault: boolean;
  readonly defaultValue: unknown;
  readonly optional: boolean;
}

const EMPTY_BASE: BaseSchemaState = {
  description: undefined,
  aliases: [],
  envVar: undefined,
  hasDefault: false,
  defaultValue: undefined,
  optional: false,
};

abstract class BaseSchema<T> {
  public abstract readonly kind: SchemaKind;
  public readonly base: BaseSchemaState;
  protected constructor(base: BaseSchemaState) {
    this.base = base;
  }
  protected abstract clone(base: BaseSchemaState): this;

  public describe(text: string): this {
    return this.clone({ ...this.base, description: text });
  }

  public alias(name: string | readonly string[]): this {
    const next = Array.isArray(name) ? [...name] : [name as string];
    if (next.some((value) => typeof value !== 'string' || value.length === 0)) {
      throw new ArgvZodError(
        'SCHEMA_INVALID',
        'alias must be a non-empty string or array of non-empty strings',
      );
    }
    return this.clone({
      ...this.base,
      aliases: [...this.base.aliases, ...next],
    });
  }

  public env(variable: string): this {
    if (typeof variable !== 'string' || variable.length === 0) {
      throw new ArgvZodError(
        'SCHEMA_INVALID',
        'env variable name must be a non-empty string',
      );
    }
    return this.clone({ ...this.base, envVar: variable });
  }

  public default(value: T): this {
    return this.clone({
      ...this.base,
      hasDefault: true,
      defaultValue: value,
      optional: false,
    });
  }

  public optional(): this {
    return this.clone({ ...this.base, optional: true });
  }

  /** The runtime-effective default, only meaningful if `hasDefault`. */
  public getDefault(): T | undefined {
    return this.base.hasDefault ? (this.base.defaultValue as T) : undefined;
  }
}

interface StringConstraints {
  readonly minLength: number | undefined;
  readonly maxLength: number | undefined;
  readonly pattern: RegExp | undefined;
}

export class StringSchema extends BaseSchema<string> {
  public readonly kind = 'string' as const;
  public readonly constraints: StringConstraints;

  public constructor(
    base: BaseSchemaState = EMPTY_BASE,
    constraints: StringConstraints = {
      minLength: undefined,
      maxLength: undefined,
      pattern: undefined,
    },
  ) {
    super(base);
    this.constraints = constraints;
  }

  protected clone(base: BaseSchemaState): this {
    return new StringSchema(base, this.constraints) as this;
  }

  public min(length: number): StringSchema {
    requireFiniteNumber('min length', length);
    if (length < 0) {
      throw new ArgvZodError('SCHEMA_INVALID', `min length must be >= 0, got ${length}`);
    }
    return new StringSchema(this.base, { ...this.constraints, minLength: length });
  }

  public max(length: number): StringSchema {
    requireFiniteNumber('max length', length);
    if (length < 0) {
      throw new ArgvZodError('SCHEMA_INVALID', `max length must be >= 0, got ${length}`);
    }
    return new StringSchema(this.base, { ...this.constraints, maxLength: length });
  }

  public regex(pattern: RegExp): StringSchema {
    if (!(pattern instanceof RegExp)) {
      throw new ArgvZodError('SCHEMA_INVALID', 'regex must be a RegExp instance');
    }
    return new StringSchema(this.base, { ...this.constraints, pattern });
  }
}

interface NumericConstraints {
  readonly min: number | undefined;
  readonly max: number | undefined;
  readonly integerOnly: boolean;
}

export class NumberSchema extends BaseSchema<number> {
  public readonly kind: SchemaKind = 'number';
  public readonly constraints: NumericConstraints;

  public constructor(
    base: BaseSchemaState = EMPTY_BASE,
    constraints: NumericConstraints = { min: undefined, max: undefined, integerOnly: false },
  ) {
    super(base);
    this.constraints = constraints;
  }

  protected clone(base: BaseSchemaState): this {
    return new NumberSchema(base, this.constraints) as this;
  }

  public min(value: number): NumberSchema {
    requireFiniteNumber('min', value);
    return new NumberSchema(this.base, { ...this.constraints, min: value });
  }

  public max(value: number): NumberSchema {
    requireFiniteNumber('max', value);
    return new NumberSchema(this.base, { ...this.constraints, max: value });
  }

  public int(): NumberSchema {
    const next = new NumberSchema(this.base, { ...this.constraints, integerOnly: true });
    (next as { kind: SchemaKind }).kind = 'integer';
    return next;
  }
}

export class BooleanSchema extends BaseSchema<boolean> {
  public readonly kind = 'boolean' as const;

  public constructor(base: BaseSchemaState = EMPTY_BASE) {
    super(base);
  }

  protected clone(base: BaseSchemaState): this {
    return new BooleanSchema(base) as this;
  }
}

export class EnumSchema<Value extends string> extends BaseSchema<Value> {
  public readonly kind = 'enum' as const;
  public readonly choices: readonly Value[];

  public constructor(choices: readonly Value[], base: BaseSchemaState = EMPTY_BASE) {
    super(base);
    this.choices = choices;
  }

  protected clone(base: BaseSchemaState): this {
    return new EnumSchema(this.choices, base) as this;
  }
}

export class ArraySchema<Inner extends StringSchema | NumberSchema | EnumSchema<string>>
  extends BaseSchema<readonly InnerOutput<Inner>[]>
{
  public readonly kind = 'array' as const;
  public readonly element: Inner;

  public constructor(element: Inner, base: BaseSchemaState = EMPTY_BASE) {
    super(base);
    this.element = element;
  }

  protected clone(base: BaseSchemaState): this {
    return new ArraySchema(this.element, base) as this;
  }
}

export type Schema =
  | StringSchema
  | NumberSchema
  | BooleanSchema
  | EnumSchema<string>
  | ArraySchema<StringSchema | NumberSchema | EnumSchema<string>>;

export type SchemaMap = Readonly<Record<string, Schema>>;

type InnerOutput<Inner> =
  Inner extends StringSchema ? string :
  Inner extends NumberSchema ? number :
  Inner extends EnumSchema<infer V> ? V :
  never;

type SchemaOutput<S> =
  S extends ArraySchema<infer Inner> ? readonly InnerOutput<Inner>[] :
  S extends StringSchema ? string :
  S extends NumberSchema ? number :
  S extends BooleanSchema ? boolean :
  S extends EnumSchema<infer V> ? V :
  never;

type WithOptional<S, T> = S extends { base: { optional: true } } ? T | undefined : T;

/** Inferred values type for a schema map. */
export type Infer<M extends SchemaMap> = {
  [K in keyof M]: WithOptional<M[K], SchemaOutput<M[K]>>;
};

function requireFiniteNumber(name: string, value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ArgvZodError('SCHEMA_INVALID', `${name} must be a finite number, got ${value as string}`);
  }
}

function requireNonEmptyString(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ArgvZodError('SCHEMA_INVALID', `${name} must be a non-empty string`);
  }
}

/** The fluent schema-builder namespace. */
export const z = {
  string(): StringSchema {
    return new StringSchema();
  },
  number(): NumberSchema {
    return new NumberSchema();
  },
  integer(): NumberSchema {
    return new NumberSchema().int();
  },
  boolean(): BooleanSchema {
    return new BooleanSchema();
  },
  enum<const V extends string>(values: readonly V[]): EnumSchema<V> {
    if (!Array.isArray(values) || values.length === 0) {
      throw new ArgvZodError('SCHEMA_INVALID', 'enum requires at least one value');
    }
    for (const value of values) {
      requireNonEmptyString('enum value', value);
    }
    return new EnumSchema<V>([...values]);
  },
  array<Inner extends StringSchema | NumberSchema | EnumSchema<string>>(
    element: Inner,
  ): ArraySchema<Inner> {
    if (!(element instanceof StringSchema || element instanceof NumberSchema || element instanceof EnumSchema)) {
      throw new ArgvZodError('SCHEMA_INVALID', 'array element must be a string/number/integer/enum schema');
    }
    return new ArraySchema(element);
  },
} as const;
