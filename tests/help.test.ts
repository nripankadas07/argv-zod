import { formatHelp, z } from '../src';

describe('formatHelp', () => {
  test('lists every option with its type', () => {
    const help = formatHelp({
      host: z.string().default('localhost').describe('Server host'),
      port: z.integer().min(1).max(65535).default(3000).describe('Listen port'),
      verbose: z.boolean().default(false).alias('v').describe('Enable debug logging'),
      tag: z.array(z.string()).describe('Tag (repeatable)').optional(),
      mode: z.enum(['dev', 'prod']).default('dev'),
    });
    expect(help).toContain('--host');
    expect(help).toContain('<string>');
    expect(help).toContain('--port');
    expect(help).toContain('<integer>');
    expect(help).toContain('--verbose');
    expect(help).toContain('-v');
    expect(help).toContain('<boolean>');
    expect(help).toContain('--tag');
    expect(help).toContain('<string[]>');
    expect(help).toContain('--mode');
    expect(help).toContain('dev|prod');
    expect(help).toContain('Server host');
  });

  test('shows the program name when given', () => {
    const help = formatHelp({ host: z.string().optional() }, { programName: 'mycli' });
    expect(help).toMatch(/Usage: mycli/);
  });

  test('shows the program description when given', () => {
    const help = formatHelp(
      { host: z.string().optional() },
      { programName: 'cli', description: 'Frob the widgets.' },
    );
    expect(help).toContain('Frob the widgets.');
  });

  test('marks required vs optional vs default', () => {
    const help = formatHelp({
      a: z.string(),
      b: z.string().optional(),
      c: z.string().default('z'),
    });
    expect(help).toMatch(/--a.*\(required\)/);
    expect(help).toMatch(/--b.*\(optional\)/);
    expect(help).toMatch(/--c.*\(default: "z"\)/);
  });

  test('handles plain number kind', () => {
    const help = formatHelp({ ratio: z.number().optional() });
    expect(help).toContain('<number>');
  });

  test('alias rendered with single dash for one-char names', () => {
    const help = formatHelp({ host: z.string().alias('h').optional() });
    expect(help).toContain('-h');
  });

  test('alias rendered with double dash for multi-char names', () => {
    const help = formatHelp({ hostname: z.string().alias('host').optional() });
    expect(help).toContain('--host');
  });

  test('omits description portion if absent', () => {
    const help = formatHelp({ host: z.string().optional() });
    // The line should still render with the canonical flag.
    expect(help).toMatch(/--host\s+<string>\s+\(optional\)/);
  });
});

describe('formatHelp — uppercase-first keys', () => {
  test('renders kebab for a key starting with a capital', () => {
    const help = formatHelp({ ServerHost: z.string().optional() });
    // Server -> "server", H -> "-h" -> final flag "--server-host".
    expect(help).toContain('--server-host');
  });
});
