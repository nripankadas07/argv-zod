import { ArgvZodError, z } from '../src';

describe('z.string()', () => {
  test('starts with no constraints', () => {
    const schema = z.string();
    expect(schema.kind).toBe('string');
    expect(schema.constraints.minLength).toBeUndefined();
    expect(schema.constraints.maxLength).toBeUndefined();
    expect(schema.constraints.pattern).toBeUndefined();
    expect(schema.base.optional).toBe(false);
    expect(schema.base.hasDefault).toBe(false);
    expect(schema.base.aliases).toEqual([]);
  });

  test('.min(n) records minLength', () => {
    expect(z.string().min(3).constraints.minLength).toBe(3);
  });

  test('.max(n) records maxLength', () => {
    expect(z.string().max(8).constraints.maxLength).toBe(8);
  });

  test('.regex(r) records the pattern', () => {
    expect(z.string().regex(/x+/).constraints.pattern).toEqual(/x+/);
  });

  test('.min rejects negative or non-finite', () => {
    expect(() => z.string().min(-1)).toThrow(ArgvZodError);
    expect(() => z.string().min(NaN)).toThrow(ArgvZodError);
    expect(() => z.string().min(Infinity)).toThrow(ArgvZodError);
  });

  test('.max rejects negative or non-finite', () => {
    expect(() => z.string().max(-1)).toThrow(ArgvZodError);
    expect(() => z.string().max(NaN)).toThrow(ArgvZodError);
    expect(() => z.string().max('5' as unknown as number)).toThrow(ArgvZodError);
  });

  test('.regex requires a real RegExp', () => {
    expect(() => z.string().regex('x' as unknown as RegExp)).toThrow(ArgvZodError);
  });
});

describe('z.number() / z.integer()', () => {
  test('z.number is "number" kind', () => {
    expect(z.number().kind).toBe('number');
  });
  test('z.integer is "integer" kind', () => {
    expect(z.integer().kind).toBe('integer');
    expect(z.integer().constraints.integerOnly).toBe(true);
  });
  test('.min/.max set bounds', () => {
    const schema = z.number().min(0).max(10);
    expect(schema.constraints.min).toBe(0);
    expect(schema.constraints.max).toBe(10);
  });
  test('.min rejects non-finite', () => {
    expect(() => z.number().min(NaN)).toThrow(ArgvZodError);
    expect(() => z.number().max(Infinity)).toThrow(ArgvZodError);
  });
  test('.int() flips to integer kind', () => {
    const schema = z.number().int();
    expect(schema.kind).toBe('integer');
    expect(schema.constraints.integerOnly).toBe(true);
  });
});

describe('z.boolean()', () => {
  test('returns a BooleanSchema', () => {
    expect(z.boolean().kind).toBe('boolean');
  });
});

describe('z.enum()', () => {
  test('preserves choices', () => {
    const schema = z.enum(['a', 'b', 'c']);
    expect(schema.kind).toBe('enum');
    expect(schema.choices).toEqual(['a', 'b', 'c']);
  });
  test('rejects empty choice list', () => {
    expect(() => z.enum([])).toThrow(ArgvZodError);
  });
  test('rejects non-string choices', () => {
    expect(() => z.enum([1 as unknown as string])).toThrow(ArgvZodError);
    expect(() => z.enum([''])).toThrow(ArgvZodError);
  });
  test('rejects non-array argument', () => {
    expect(() => z.enum('foo' as unknown as readonly string[])).toThrow(ArgvZodError);
  });
});

describe('z.array()', () => {
  test('wraps a leaf schema', () => {
    const schema = z.array(z.string().min(1));
    expect(schema.kind).toBe('array');
    expect(schema.element.kind).toBe('string');
  });
  test('rejects non-leaf elements', () => {
    expect(() => z.array(z.boolean() as never)).toThrow(ArgvZodError);
    expect(() => z.array(null as unknown as ReturnType<typeof z.string>)).toThrow(ArgvZodError);
  });
});

describe('common schema modifiers', () => {
  test('.describe attaches a description', () => {
    const schema = z.string().describe('the host');
    expect(schema.base.description).toBe('the host');
  });
  test('.alias accepts string or array', () => {
    expect(z.string().alias('h').base.aliases).toEqual(['h']);
    expect(z.string().alias(['h', 'host']).base.aliases).toEqual(['h', 'host']);
  });
  test('.alias rejects empty', () => {
    expect(() => z.string().alias('')).toThrow(ArgvZodError);
    expect(() => z.string().alias([''])).toThrow(ArgvZodError);
    expect(() => z.string().alias(123 as unknown as string)).toThrow(ArgvZodError);
  });
  test('.env attaches an env var name', () => {
    expect(z.string().env('FOO').base.envVar).toBe('FOO');
  });
  test('.env rejects empty', () => {
    expect(() => z.string().env('')).toThrow(ArgvZodError);
    expect(() => z.string().env(123 as unknown as string)).toThrow(ArgvZodError);
  });
  test('.default flips hasDefault and stores value', () => {
    const schema = z.string().default('localhost');
    expect(schema.base.hasDefault).toBe(true);
    expect(schema.base.defaultValue).toBe('localhost');
    expect(schema.getDefault()).toBe('localhost');
  });
  test('.default after .optional clears optional', () => {
    const schema = z.string().optional().default('x');
    expect(schema.base.optional).toBe(false);
  });
  test('.optional turns optional flag on', () => {
    const schema = z.string().optional();
    expect(schema.base.optional).toBe(true);
  });
  test('getDefault returns undefined when no default set', () => {
    expect(z.string().getDefault()).toBeUndefined();
  });
  test('builders are immutable', () => {
    const original = z.string();
    const modified = original.min(5);
    expect(original.constraints.minLength).toBeUndefined();
    expect(modified.constraints.minLength).toBe(5);
  });
});
