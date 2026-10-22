import { normalizeText, chunkText } from '@/lib/plagiarism/text-processor';

describe('normalizeText', () => {
  it('should replace multiple whitespaces with a single space', () => {
    const text = 'This   is  a   test.';
    expect(normalizeText(text)).toBe('This is a test.');
  });

  it('should trim leading/trailing whitespace', () => {
    const text = '  This is a test.  ';
    expect(normalizeText(text)).toBe('This is a test.');
  });

  it('should replace various line breaks with consistent newlines and preserve paragraph breaks', () => {
    const text = 'Line 1\r\nLine 2\rLine 3\n\n  Paragraph 2 starts here.\n\n';
    expect(normalizeText(text)).toBe('Line 1\nLine 2\nLine 3\n\nParagraph 2 starts here.');
  });

  it('should handle empty string', () => {
    expect(normalizeText('')).toBe('');
  });

  it('should handle text with only whitespace', () => {
    expect(normalizeText('   \n  \t ')).toBe('');
  });
});

describe('chunkText', () => {
  const longText = "\n  This is the first sentence. It is followed by a second one. And a third, for good measure.\n  \n  The quick brown fox jumps over the lazy dog. This is a classic sentence for testing. It has a good rhythm.\n  \n  Another paragraph here. This one is a bit longer and will test the sentence boundary detection more thoroughly.\n  We want to ensure that chunks don't cut off in the middle of a thought. For instance, this sentence should stay together.\n  \n  Finally, a very long sentence to challenge the chunking algorithm. This sentence is designed to be longer than a typical chunk,\n  forcing the algorithm to break it gracefully, perhaps at the nearest sentence boundary before the target character limit,\n  or by simply cutting it if no suitable boundary is found, as a last resort. This should demonstrate robustness.\n  ";

  it('should return a single chunk for very short texts', () => {
    const text = 'This is a short text.';
    const chunks = chunkText(text);
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toBe(normalizeText(text));
    expect(chunks[0].chunk_index).toBe(0);
    expect(chunks[0].start_char).toBe(0);
    expect(chunks[0].end_char).toBe(normalizeText(text).length - 1);
  });

  it('should chunk longer text with target token size and overlap', () => {
    const chunks = chunkText(longText, 100, 10); 
    expect(chunks.length).toBeGreaterThan(1); 
    if (chunks.length > 1) {
      const firstChunkEnd = chunks[0].end_char;
      const secondChunkStart = chunks[1].start_char;
      expect(firstChunkEnd - secondChunkStart).toBeGreaterThanOrEqual(10 * 4 - 5); 
      expect(firstChunkEnd - secondChunkStart).toBeLessThanOrEqual(10 * 4 + 10);
    }

    const combinedText = chunks.map(c => c.content).join('');
    const normalizedLength = normalizeText(longText).length;
    expect(chunks[chunks.length - 1].end_char).toBeGreaterThanOrEqual(normalizedLength - (10 * 4));
    expect(chunks[chunks.length - 1].end_char).toBeLessThanOrEqual(normalizedLength);
  });

  it('should try to break at sentence boundaries', () => {
    const text = 'This is sentence one. This is sentence two! This is sentence three which is definitely long enough to avoid being merged back into the previous chunk.';
    const chunks = chunkText(text, 10, 0);
    expect(chunks[0].content).toMatch(/sentence one\.$/);
    expect(chunks[1].content).toMatch(/sentence two!$/);
  });

  it('should merge small last chunks with the previous one', () => {
    const text = 'a'.repeat(100);
    const chunks = chunkText(text, 20, 5);
    
    expect(chunks.length).toBe(1);
    expect(chunks[0].content.length).toBe(100);
    expect(chunks[0].start_char).toBe(0);
    expect(chunks[0].end_char).toBe(99);
  });

  it('should handle text that is exactly the chunk size', () => {
    const text = 'A'.repeat(900 * 4); 
    const chunks = chunkText(text, 900, 150);
    expect(chunks.length).toBe(1);
    expect(chunks[0].content.length).toBe(text.length);
  });

  it('should handle text with leading/trailing newlines and spaces', () => {
    const text = "\n\n  Hello world.  How are you?\n\n";
    const chunks = chunkText(text);
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toBe("Hello world. How are you?");
  });

  it('should handle large documents (~1000 words) correctly', () => {
    const sentence = "The quick brown fox jumps over the lazy dog. ";
    const repeatCount = 100;
    const largeText = sentence.repeat(repeatCount);
    const chunks = chunkText(largeText, 900, 150);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.length).toBeLessThan(10); 
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk.end_char).toBe(normalizeText(largeText).length - 1);
  });

});
