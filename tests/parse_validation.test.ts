import { ArgvZodError, parse, z } from '../src';

describe('parse — string validation', () => {
  test('min length enforced', () => {
    let captured: ArgvZodError | undefined;
    try { parse(['--name', 'ab'], { name: z.string().min(3) }); }
    catch (err) { captured = err as ArgvZodError; }
    expect(captured?.code).toBe('BELOW_MIN');
  });

  test('max length enforced', () => {
    let captured: ArgvZodError | undefined;
    try { parse(['--name', 'abcd'], { name: z.string().max(3) }); }
    catch (err) { captured = err as ArgvZodError; }
    expect(captured?.code).toBe('ABOVE_MAX');
  });

  test('regex pattern enforced', () => {
    let captured: ArgvZodError | undefined;
    try { parse(['--name', 'abc'], { name: z.string().regex(/^\d+$/) }); }
    catch (err) { captured = err as ArgvZodError; }
    expect(captured?.code).toBe('PATTERN_MISMATCH');
  });

  test('string at exact min length passes', () => {
    expect(parse(['--name', 'abc'], { name: z.string().min(3) }).values).toEqual({ name: 'abc' });
  });

  test('string at exact max length passes', () => {
    expect(parse(['--name', 'abc'], { name: z.string().max(3) }).values).toEqual({ name: 'abc' });
  });
});

describe('parse — number validation', () => {
  test('rejects non-numeric value', () => {
    let captured: ArgvZodError | undefined;
    try { parse(['--n', 'foo'], { n: z.number() }); }
    catch (err) { captured = err as ArgvZodError; }
    expect(captured?.code).toBe('INVALID_NUMBER');
  });

  test('rejects decimal for integer schema', () => {
    let captured: ArgvZodError | undefined;
    try { parse(['--n', '1.5'], { n: z.integer() }); }
    catch (err) { captured = err as ArgvZodError; }
    expect(captured?.code).toBe('INVALID_INTEGER');
  });

  test('rejects below min', () => {
    let captured: ArgvZodError | undefined;
    try { parse(['--n', '0'], { n: z.number().min(1) }); }
    catch (err) { captured = err as ArgvZodError; }
    expect(captured?.code).toBe('BELOW_MIN');
  });

  test('rejects above max', () => {
    let captured: ArgvZodError | undefined;
    try { parse(['--n', '100'], { n: z.number().max(10) }); }
    catch (err) { captured = err as ArgvZodError; }
    expect(captured?.code).toBe('ABOVE_MAX');
  });

  test('exponential notation accepted for number', () => {
    expect(parse(['--n', '1e3'], { n: z.number() }).values).toEqual({ n: 1000 });
  });

  test('exponential notation rejected for integer', () => {
    let captured: ArgvZodError | undefined;
    try { parse(['--n', '1e3'], { n: z.integer() }); }
    catch (err) { captured = err as ArgvZodError; }
    expect(captured?.code).toBe('INVALID_INTEGER');
  });

  test('rejects non-safe integer', () => {
    let captured: ArgvZodError | undefined;
    try {
      parse(['--n', '99999999999999999999'], { n: z.integer() });
    } catch (err) { captured = err as ArgvZodError; }
    expect(captured?.code).toBe('INVALID_INTEGER');
  });
});

describe('parse — enum / array', () => {
  test('enum accepts a known choice', () => {
    expect(parse(['--mode', 'fast'], { mode: z.enum(['fast', 'slow']) }).values).toEqual({
      mode: 'fast',
    });
  });

  test('enum rejects an unknown choice', () => {
    let captured: ArgvZodError | undefined;
    try { parse(['--mode', 'turbo'], { mode: z.enum(['fast', 'slow']) }); }
    catch (err) { captured = err as ArgvZodError; }
    expect(captured?.code).toBe('CHOICE_MISMATCH');
  });

  test('array accumulates repeated flags', () => {
    const result = parse(
      ['--tag', 'a', '--tag', 'b', '--tag', 'c'],
      { tag: z.array(z.string()) },
    );
    expect(result.values).toEqual({ tag: ['a', 'b', 'c'] });
  });

  test('array of integers', () => {
    expect(parse(
      ['--n', '1', '--n', '2', '--n', '3'],
      { n: z.array(z.integer()) },
    ).values).toEqual({ n: [1, 2, 3] });
  });

  test('array of integers rejects bad element', () => {
    let captured: ArgvZodError | undefined;
    try { parse(['--n', '1', '--n', 'x'], { n: z.array(z.integer()) }); }
    catch (err) { captured = err as ArgvZodError; }
    expect(captured?.code).toBe('INVALID_NUMBER');
  });

  test('array of enum', () => {
    expect(parse(
      ['--m', 'a', '--m', 'b'],
      { m: z.array(z.enum(['a', 'b', 'c'])) },
    ).values).toEqual({ m: ['a', 'b'] });
  });

  test('empty array (no flag) when optional', () => {
    expect(parse([], { tag: z.array(z.string()).optional() }).values).toEqual({});
  });

  test('default array materialised as fresh copy', () => {
    const schema = { tag: z.array(z.string()).default([]) };
    const a = parse([], schema).values;
    const b = parse([], schema).values;
    expect(a).toEqual({ tag: [] });
    expect(b).toEqual({ tag: [] });
    expect(a.tag).not.toBe(b.tag);  // independent arrays
  });
});

describe('parse — env fallback', () => {
  test('env var supplies missing string', () => {
    const result = parse(
      [],
      { host: z.string().env('HOST') },
      { env: { HOST: 'h.com' } },
    );
    expect(result.values).toEqual({ host: 'h.com' });
  });

  test('env var supplies missing number', () => {
    const result = parse(
      [],
      { port: z.integer().env('PORT') },
      { env: { PORT: '8080' } },
    );
    expect(result.values).toEqual({ port: 8080 });
  });

  test('env var supplies missing boolean (true)', () => {
    expect(parse(
      [],
      { v: z.boolean().env('V') },
      { env: { V: '1' } },
    ).values).toEqual({ v: true });
  });

  test('env var supplies missing boolean (false)', () => {
    expect(parse(
      [],
      { v: z.boolean().env('V') },
      { env: { V: 'false' } },
    ).values).toEqual({ v: false });
  });

  test('env var rejected for boolean if not 0/1/true/false', () => {
    let captured: ArgvZodError | undefined;
    try {
      parse([], { v: z.boolean().env('V') }, { env: { V: 'maybe' } });
    } catch (err) { captured = err as ArgvZodError; }
    expect(captured?.code).toBe('INVALID_VALUE');
  });

  test('env var supplies array via comma split', () => {
    expect(parse(
      [],
      { tag: z.array(z.string()).env('TAGS') },
      { env: { TAGS: 'a, b , c' } },
    ).values).toEqual({ tag: ['a', 'b', 'c'] });
  });

  test('argv wins over env', () => {
    const result = parse(
      ['--host', 'cli.com'],
      { host: z.string().env('HOST') },
      { env: { HOST: 'env.com' } },
    );
    expect(result.values).toEqual({ host: 'cli.com' });
  });

  test('default applied when env not set', () => {
    const result = parse(
      [],
      { host: z.string().default('localhost').env('HOST') },
      { env: {} },
    );
    expect(result.values).toEqual({ host: 'localhost' });
  });

  test('env applies even when default is set', () => {
    // Env should win over default when both present and arg absent.
    const result = parse(
      [],
      { host: z.string().default('localhost').env('HOST') },
      { env: { HOST: 'envhost' } },
    );
    expect(result.values).toEqual({ host: 'envhost' });
  });

  test('process.env fallback used when no env override', () => {
    const original = process.env.AZ_PROCESSENV_PROBE;
    process.env.AZ_PROCESSENV_PROBE = 'fromproc';
    try {
      const result = parse(
        [],
        { probe: z.string().env('AZ_PROCESSENV_PROBE') },
      );
      expect(result.values).toEqual({ probe: 'fromproc' });
    } finally {
      if (original === undefined) {
        delete process.env.AZ_PROCESSENV_PROBE;
      } else {
        process.env.AZ_PROCESSENV_PROBE = original;
      }
    }
  });
});
