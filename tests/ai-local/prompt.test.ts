import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveLocalSystemPrompt, resolveSystemPromptOverride, sha256Text } from '@/lib/ai-local/prompt';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'local-prompt-'));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('sha256Text', () => {
  it('hashes UTF-8 text to lowercase hex', () => {
    expect(sha256Text('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('resolveLocalSystemPrompt', () => {
  it('returns null when LOCAL_SYSTEM_PROMPT_FILE is unset or blank', () => {
    expect(resolveLocalSystemPrompt({})).toBeNull();
    expect(resolveLocalSystemPrompt({ LOCAL_SYSTEM_PROMPT_FILE: '  ' })).toBeNull();
  });

  it('reads process.env by default', () => {
    const saved = process.env.LOCAL_SYSTEM_PROMPT_FILE;
    const file = path.join(dir, 'env.txt');
    writeFileSync(file, 'FROM ENV');
    process.env.LOCAL_SYSTEM_PROMPT_FILE = file;
    try {
      expect(resolveLocalSystemPrompt()?.text).toBe('FROM ENV');
    } finally {
      if (saved === undefined) delete process.env.LOCAL_SYSTEM_PROMPT_FILE;
      else process.env.LOCAL_SYSTEM_PROMPT_FILE = saved;
    }
  });

  it('reads the file and reports its path and digest', () => {
    const file = path.join(dir, 'v2.txt');
    writeFileSync(file, 'LOCAL V2 PROMPT');

    expect(resolveLocalSystemPrompt({ LOCAL_SYSTEM_PROMPT_FILE: file })).toEqual({
      text: 'LOCAL V2 PROMPT',
      file,
      sha256: sha256Text('LOCAL V2 PROMPT'),
    });
  });

  it('resolves a relative path against the working directory', () => {
    writeFileSync(path.join(dir, 'rel.txt'), 'RELATIVE');
    const cwd = jest.spyOn(process, 'cwd').mockReturnValue(dir);

    expect(resolveLocalSystemPrompt({ LOCAL_SYSTEM_PROMPT_FILE: 'rel.txt' })?.text).toBe('RELATIVE');
    cwd.mockRestore();
  });

  // A run labelled with a prompt it did not actually use would be worse than a crash.
  it('throws when the configured file is missing', () => {
    expect(() => resolveLocalSystemPrompt({ LOCAL_SYSTEM_PROMPT_FILE: path.join(dir, 'nope.txt') })).toThrow(
      /LOCAL_SYSTEM_PROMPT_FILE/
    );
  });

  it('throws when the configured file is empty', () => {
    const file = path.join(dir, 'empty.txt');
    writeFileSync(file, ' \n ');
    expect(() => resolveLocalSystemPrompt({ LOCAL_SYSTEM_PROMPT_FILE: file })).toThrow(/is empty/);
  });
});

describe('resolveSystemPromptOverride', () => {
  const write = (name: string, text: string) => {
    const file = path.join(dir, name);
    writeFileSync(file, text);
    return file;
  };

  it('applies GRADING_PROMPT_FILE to both providers', () => {
    const file = write('shared.txt', 'SHARED');
    expect(resolveSystemPromptOverride('openai', { GRADING_PROMPT_FILE: file })?.text).toBe('SHARED');
    expect(resolveSystemPromptOverride('local', { GRADING_PROMPT_FILE: file })?.text).toBe('SHARED');
  });

  // local-v2 was frozen with LOCAL_SYSTEM_PROMPT_FILE; it must stay reproducible.
  it('lets LOCAL_SYSTEM_PROMPT_FILE win on the local provider', () => {
    const shared = write('shared.txt', 'SHARED');
    const local = write('local.txt', 'LOCAL ONLY');
    const env = { GRADING_PROMPT_FILE: shared, LOCAL_SYSTEM_PROMPT_FILE: local };
    expect(resolveSystemPromptOverride('local', env)?.text).toBe('LOCAL ONLY');
    expect(resolveSystemPromptOverride('openai', env)?.text).toBe('SHARED');
  });

  it('never applies LOCAL_SYSTEM_PROMPT_FILE to openai', () => {
    const local = write('local.txt', 'LOCAL ONLY');
    expect(resolveSystemPromptOverride('openai', { LOCAL_SYSTEM_PROMPT_FILE: local })).toBeNull();
  });

  it('returns null when neither variable is set, and fails loudly on a missing file', () => {
    expect(resolveSystemPromptOverride('openai', {})).toBeNull();
    expect(() => resolveSystemPromptOverride('openai', { GRADING_PROMPT_FILE: path.join(dir, 'nope.txt') })).toThrow(
      /GRADING_PROMPT_FILE/
    );
  });

  it('reads process.env by default', () => {
    const saved = process.env.GRADING_PROMPT_FILE;
    process.env.GRADING_PROMPT_FILE = write('env.txt', 'FROM ENV');
    try {
      expect(resolveSystemPromptOverride('openai')?.text).toBe('FROM ENV');
    } finally {
      if (saved === undefined) delete process.env.GRADING_PROMPT_FILE;
      else process.env.GRADING_PROMPT_FILE = saved;
    }
  });
});
