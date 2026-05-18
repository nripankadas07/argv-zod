/**
 * Error hierarchy for argv-zod.
 *
 * `ArgvZodError` carries a stable `code` so callers can branch on the
 * failure mode without parsing the human-readable message. Every parse
 * failure raises an `ArgvZodError`; schema construction failures raise
 * the same class with a `SCHEMA_*` code.
 */

export type ArgvZodErrorCode =
  | 'UNKNOWN_OPTION'
  | 'MISSING_VALUE'
  | 'DUPLICATE_OPTION'
  | 'INVALID_VALUE'
  | 'BAD_NEGATION'
  | 'CHOICE_MISMATCH'
  | 'BELOW_MIN'
  | 'ABOVE_MAX'
  | 'PATTERN_MISMATCH'
  | 'REQUIRED'
  | 'SCHEMA_INVALID'
  | 'INVALID_INTEGER'
  | 'INVALID_NUMBER';

export interface ArgvZodErrorContext {
  readonly optionName?: string;
  readonly received?: string;
}

/**
 * Thrown on every input or schema error.
 *
 * The `.code` field is the discriminator; `.optionName` and `.received`
 * are filled in when the error pertains to a specific argv token.
 */
export class ArgvZodError extends Error {
  public readonly code: ArgvZodErrorCode;
  public readonly optionName: string | undefined;
  public readonly received: string | undefined;

  public constructor(
    code: ArgvZodErrorCode,
    message: string,
    context: ArgvZodErrorContext = {},
  ) {
    super(message);
    this.name = 'ArgvZodError';
    this.code = code;
    this.optionName = context.optionName;
    this.received = context.received;
    Object.setPrototypeOf(this, ArgvZodError.prototype);
  }
}
