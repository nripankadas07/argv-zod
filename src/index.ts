/**
 * argv-zod — type-safe argv parser with a Zod-style fluent schema.
 *
 * @example
 * ```ts
 * import { parse, z, Infer } from 'argv-zod';
 *
 * const schema = {
 *     port: z.integer().min(1).max(65535).default(3000),
 *     host: z.string().default('localhost'),
 *     verbose: z.boolean().default(false).alias('v'),
 *     tags: z.array(z.string()),
 * };
 *
 * type Cfg = Infer<typeof schema>;
 *
 * const { values, positional } = parse(process.argv.slice(2), schema);
 * ```
 */

export { ArgvZodError } from './errors';
export type { ArgvZodErrorCode, ArgvZodErrorContext } from './errors';

export {
  ArraySchema,
  BooleanSchema,
  EnumSchema,
  NumberSchema,
  StringSchema,
  z,
} from './schema';
export type { Infer, Schema, SchemaKind, SchemaMap } from './schema';

export { parse } from './parse';
export type { ParseOptions, ParseResult } from './parse';

export { formatHelp } from './help';
export type { HelpOptions } from './help';
