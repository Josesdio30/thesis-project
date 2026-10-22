import { sha256 } from '@/lib/ai-local/rag/checksum';

describe('sha256', () => {
  it('hashes bytes to lowercase hex', () => {
    expect(sha256(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});
