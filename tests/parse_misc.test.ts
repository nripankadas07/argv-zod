import { parse, z } from '../src';

describe('parse — alias variants', () => {
  test('short flag with =value form', () => {
    const result = parse(['-h=h.com'], { hostname: z.string().alias('h') });
    expect(result.values).toEqual({ hostname: 'h.com' });
  });

  test('alias accumulates for arrays', () => {
    const result = parse(
      ['-t', 'a', '-t', 'b'],
      { tag: z.array(z.string()).alias('t') },
    );
    expect(result.values).toEqual({ tag: ['a', 'b'] });
  });

  test('multiple aliases per option', () => {
    const result = parse(
      ['-h', 'h.com'],
      { hostname: z.string().alias(['h', 'host']) },
    );
    expect(result.values).toEqual({ hostname: 'h.com' });
  });
});

describe('parse — kebab edge cases', () => {
  test('all-lower flag', () => {
    expect(parse(['--tag', 'x'], { tag: z.string() }).values).toEqual({ tag: 'x' });
  });

  test('camelCase in middle and end', () => {
    expect(parse(['--my-cool-thing', 'x'], { myCoolThing: z.string() }).values).toEqual({
      myCoolThing: 'x',
    });
  });
});

describe('parse — value tokens are not flags', () => {
  test('value starting with a digit is taken as value', () => {
    expect(parse(['--n', '42'], { n: z.integer() }).values).toEqual({ n: 42 });
  });

  test('negative number is taken as value, not flag', () => {
    expect(parse(['--n', '-1'], { n: z.integer() }).values).toEqual({ n: -1 });
  });

  test('positional only', () => {
    expect(parse(['hello', 'world'], {}).positional).toEqual(['hello', 'world']);
  });

  test('--- (three dashes) is treated as positional, not flag', () => {
    expect(parse(['---'], {}).positional).toEqual(['---']);
  });
});

describe('parse — remaining edge coverage', () => {
  test('--no-flag=value on a boolean is rejected', () => {
    // The `=value` path on a negated boolean should still throw BAD_NEGATION
    // because boolean schemas reject inline values regardless of negation.
    expect(() =>
      parse(['--no-verbose=true'], { verbose: z.boolean() }),
    ).toThrow();
  });

  test('--no-flag=value on a non-boolean is rejected', () => {
    // Hits the BAD_NEGATION path via the inline-value branch of splitFlagToken
    // for negated names ending in =value.
    expect(() =>
      parse(['--no-host=h.com'], { host: z.string() }),
    ).toThrow();
  });

  test('lone "-" token is treated as positional', () => {
    expect(parse(['-'], {}).positional).toEqual(['-']);
  });

  test('lone "--" terminates options without a following positional', () => {
    expect(parse(['--'], {}).positional).toEqual([]);
  });

  test('overflowing decimal exponent is rejected as non-finite', () => {
    // 1e500 parses to Infinity -> our INVALID_NUMBER branch fires.
    expect(() =>
      parse(['--n', '1e500'], { n: z.number() }),
    ).toThrow(/non-finite|finite number/);
  });
});

describe('parse — capital-letter key in schema', () => {
  test('a key starting with uppercase still kebab-cases', () => {
    // The toKebabCase callback's index===0 lowercase branch only fires
    // when the very first character is uppercase. Cover it explicitly.
    expect(parse(['--server', 'h.com'], { Server: z.string() }).values).toEqual({
      Server: 'h.com',
    });
  });
});
