import { ArgvZodError, parse, z } from '../src';

test('rejects a schema-shaped object without its supported schema prototype', () => {
  // A deserialized/copied schema can retain fields but lose runtime identity.
  const schema = z.enum(['safe']);
  Object.setPrototypeOf(schema, null);
  expect(() => parse(['--mode', 'safe'], { mode: schema })).toThrow(ArgvZodError);
  expect(() => parse(['--mode', 'safe'], { mode: schema })).toThrow(/unsupported schema kind/);
});
