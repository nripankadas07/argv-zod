import { ArgvZodError, parse, z } from '../src';

describe('parse — happy paths', () => {
  test('parses a string option with value form', () => {
    const result = parse(['--host', 'example.com'], { host: z.string() });
    expect(result.values).toEqual({ host: 'example.com' });
    expect(result.positional).toEqual([]);
  });

  test('parses --flag=value form', () => {
    const result = parse(['--host=example.com'], { host: z.string() });
    expect(result.values).toEqual({ host: 'example.com' });
  });

  test('parses an integer option', () => {
    const result = parse(['--port', '3000'], { port: z.integer() });
    expect(result.values).toEqual({ port: 3000 });
  });

  test('parses a number option (decimal)', () => {
    const result = parse(['--ratio', '0.5'], { ratio: z.number() });
    expect(result.values).toEqual({ ratio: 0.5 });
  });

  test('parses a negative number value', () => {
    const result = parse(['--offset', '-5'], { offset: z.integer() });
    expect(result.values).toEqual({ offset: -5 });
  });

  test('boolean true via --flag', () => {
    const result = parse(['--verbose'], { verbose: z.boolean() });
    expect(result.values).toEqual({ verbose: true });
  });

  test('boolean false via --no-flag', () => {
    const result = parse(['--no-verbose'], { verbose: z.boolean() });
    expect(result.values).toEqual({ verbose: false });
  });

  test('boolean default applied when absent', () => {
    const result = parse([], { verbose: z.boolean().default(false) });
    expect(result.values).toEqual({ verbose: false });
  });

  test('string default applied when absent', () => {
    const result = parse([], { host: z.string().default('localhost') });
    expect(result.values).toEqual({ host: 'localhost' });
  });

  test('camelCase key becomes kebab-case flag', () => {
    const result = parse(['--max-retries', '5'], { maxRetries: z.integer() });
    expect(result.values).toEqual({ maxRetries: 5 });
  });

  test('alias matches single-char short flag', () => {
    const result = parse(['-v'], { verbose: z.boolean().alias('v') });
    expect(result.values).toEqual({ verbose: true });
  });

  test('alias matches multi-char long flag', () => {
    const result = parse(['--host', 'h.com'], { hostname: z.string().alias('host') });
    expect(result.values).toEqual({ hostname: 'h.com' });
  });

  test('positional args collected', () => {
    const result = parse(['--host', 'h.com', 'a', 'b'], { host: z.string() });
    expect(result.positional).toEqual(['a', 'b']);
  });

  test('-- terminates option parsing', () => {
    const result = parse(
      ['--host', 'h.com', '--', '--not-an-option', 'b'],
      { host: z.string() },
    );
    expect(result.positional).toEqual(['--not-an-option', 'b']);
  });

  test('stopAtPositional flips remaining tokens to positional', () => {
    const result = parse(
      ['--host', 'h.com', 'cmd', '--inner-flag'],
      { host: z.string() },
      { stopAtPositional: true },
    );
    expect(result.positional).toEqual(['cmd', '--inner-flag']);
  });

  test('optional option is undefined when absent', () => {
    const result = parse([], { tag: z.string().optional() });
    expect(result.values).toEqual({});
  });
});

describe('parse — errors', () => {
  test('unknown option throws UNKNOWN_OPTION', () => {
    let captured: ArgvZodError | undefined;
    try {
      parse(['--bogus'], { host: z.string().optional() });
    } catch (err) {
      captured = err as ArgvZodError;
    }
    expect(captured).toBeInstanceOf(ArgvZodError);
    expect(captured?.code).toBe('UNKNOWN_OPTION');
    expect(captured?.optionName).toBe('bogus');
  });

  test('unknown negated option throws UNKNOWN_OPTION', () => {
    expect(() => parse(['--no-bogus'], {})).toThrow(/unknown negated/);
  });

  test('missing value at end of argv throws', () => {
    let captured: ArgvZodError | undefined;
    try {
      parse(['--host'], { host: z.string() });
    } catch (err) {
      captured = err as ArgvZodError;
    }
    expect(captured?.code).toBe('MISSING_VALUE');
  });

  test('duplicate scalar option throws', () => {
    let captured: ArgvZodError | undefined;
    try {
      parse(['--host', 'a', '--host', 'b'], { host: z.string() });
    } catch (err) {
      captured = err as ArgvZodError;
    }
    expect(captured?.code).toBe('DUPLICATE_OPTION');
  });

  test('boolean cannot take inline value', () => {
    expect(() => parse(['--verbose=true'], { verbose: z.boolean() })).toThrow(/inline/);
  });

  test('--no- prefix on non-boolean throws BAD_NEGATION', () => {
    let captured: ArgvZodError | undefined;
    try {
      parse(['--no-host', 'a'], { host: z.string() });
    } catch (err) {
      captured = err as ArgvZodError;
    }
    expect(captured?.code).toBe('BAD_NEGATION');
  });

  test('boolean given twice throws DUPLICATE_OPTION', () => {
    expect(() =>
      parse(['--verbose', '--verbose'], { verbose: z.boolean() }),
    ).toThrow(/given more than once/);
  });

  test('required option missing throws REQUIRED', () => {
    let captured: ArgvZodError | undefined;
    try {
      parse([], { host: z.string() });
    } catch (err) {
      captured = err as ArgvZodError;
    }
    expect(captured?.code).toBe('REQUIRED');
  });

  test('argv must be an array', () => {
    expect(() => parse('foo' as unknown as string[], { host: z.string() })).toThrow(/argv/);
  });

  test('non-string token in argv throws', () => {
    expect(() =>
      parse([1 as unknown as string], { host: z.string().optional() }),
    ).toThrow(/argv\[0\]/);
  });

  test('duplicate flag in schema throws', () => {
    expect(() =>
      parse(['--host', 'a'], {
        host: z.string(),
        // The `Host` key kebab-cases to `host` -> duplicate `--host`.
        Host: z.string(),
      } as never),
    ).toThrow(/duplicate flag/);
  });

  test('alias collision with another alias throws', () => {
    expect(() =>
      parse([], {
        host: z.string().alias('h'),
        help: z.string().alias('h'),
      }),
    ).toThrow(/duplicate alias/);
  });

  test('-X for unknown short flag throws', () => {
    expect(() => parse(['-x'], { host: z.string().optional() })).toThrow(/unknown option/);
  });
});
