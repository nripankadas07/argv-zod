import * as exported from '../src';

describe('public api surface', () => {
  test('exports the documented entry points', () => {
    expect(typeof exported.parse).toBe('function');
    expect(typeof exported.formatHelp).toBe('function');
    expect(typeof exported.z).toBe('object');
    expect(typeof exported.z.string).toBe('function');
    expect(typeof exported.z.number).toBe('function');
    expect(typeof exported.z.integer).toBe('function');
    expect(typeof exported.z.boolean).toBe('function');
    expect(typeof exported.z.enum).toBe('function');
    expect(typeof exported.z.array).toBe('function');
    expect(exported.ArgvZodError).toBeInstanceOf(Function);
    expect(exported.StringSchema).toBeInstanceOf(Function);
    expect(exported.NumberSchema).toBeInstanceOf(Function);
    expect(exported.BooleanSchema).toBeInstanceOf(Function);
    expect(exported.EnumSchema).toBeInstanceOf(Function);
    expect(exported.ArraySchema).toBeInstanceOf(Function);
  });

  test('ArgvZodError is a real Error subclass with code/optionName/received', () => {
    const err = new exported.ArgvZodError('UNKNOWN_OPTION', 'msg', {
      optionName: 'foo',
      received: 'bar',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(exported.ArgvZodError);
    expect(err.name).toBe('ArgvZodError');
    expect(err.code).toBe('UNKNOWN_OPTION');
    expect(err.optionName).toBe('foo');
    expect(err.received).toBe('bar');
  });

  test('ArgvZodError defaults context fields to undefined', () => {
    const err = new exported.ArgvZodError('REQUIRED', 'msg');
    expect(err.optionName).toBeUndefined();
    expect(err.received).toBeUndefined();
  });
});
