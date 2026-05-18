/**
 * Help-text formatter for a `SchemaMap`.
 *
 * Produces a deterministic, dependency-free help block suitable for
 * display in a CLI's `--help` handler. Sort order is the iteration
 * order of the input schema map.
 */

import {
  BooleanSchema,
  EnumSchema,
  NumberSchema,
  Schema,
  SchemaMap,
  StringSchema,
} from './schema';

export interface HelpOptions {
  readonly programName?: string;
  readonly description?: string;
}

export function formatHelp(schema: SchemaMap, options: HelpOptions = {}): string {
  const lines: string[] = [];
  if (options.programName !== undefined) {
    lines.push(`Usage: ${options.programName} [options] [-- positional...]`);
    lines.push('');
  }
  if (options.description !== undefined) {
    lines.push(options.description);
    lines.push('');
  }
  lines.push('Options:');
  for (const [key, value] of Object.entries(schema)) {
    lines.push(formatOptionLine(key, value));
  }
  return lines.join('\n');
}

function formatOptionLine(key: string, optionSchema: Schema): string {
  const flag = `--${toKebabCase(key)}`;
  const aliasText = optionSchema.base.aliases.length > 0
    ? `, ${optionSchema.base.aliases.map((alias) => prefixAlias(alias)).join(', ')}`
    : '';
  const typeLabel = describeType(optionSchema);
  const requirement = computeRequirement(optionSchema);
  const description = optionSchema.base.description !== undefined
    ? `  ${optionSchema.base.description}`
    : '';
  return `  ${flag}${aliasText} <${typeLabel}>${requirement}${description}`;
}

function prefixAlias(alias: string): string {
  return alias.length === 1 ? `-${alias}` : `--${alias}`;
}

function describeType(optionSchema: Schema): string {
  if (optionSchema instanceof BooleanSchema) return 'boolean';
  if (optionSchema instanceof StringSchema) return 'string';
  if (optionSchema instanceof NumberSchema) {
    return optionSchema.constraints.integerOnly ? 'integer' : 'number';
  }
  if (optionSchema instanceof EnumSchema) {
    return optionSchema.choices.join('|');
  }
  return `${describeType(optionSchema.element)}[]`;
}

function computeRequirement(optionSchema: Schema): string {
  if (optionSchema.base.hasDefault) {
    return ` (default: ${JSON.stringify(optionSchema.base.defaultValue)})`;
  }
  if (optionSchema.base.optional) {
    return ' (optional)';
  }
  return ' (required)';
}

function toKebabCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter, index) =>
    index === 0 ? letter.toLowerCase() : `-${letter.toLowerCase()}`,
  );
}
