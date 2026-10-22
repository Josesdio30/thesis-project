/**
 * Normalizes text by:
 * - Replacing multiple whitespaces with a single space.
 * - Trimming leading/trailing whitespace.
 * - Replacing common newlines with a consistent format (e.g., '\n').
 * - Preserving paragraph breaks (double newlines).
 * @param text The input text to normalize.
 * @returns The normalized text.
 */
export function normalizeText(text: string): string {
  let normalized = text.replace(/\r\n|\r/g, '\n'); // Normalize newlines to '\n'
  normalized = normalized.replace(/\n\s*\n/g, '\n\n'); // Preserve paragraph breaks (double newlines)
  normalized = normalized.split('\n').map(line => line.trim()).join('\n'); // Trim each line individually
  normalized = normalized.replace(/[ \t]+/g, ' '); // Replace multiple spaces/tabs with a single space
  normalized = normalized.trim(); // Trim leading/trailing whitespace
  return normalized;
}

/**
 * Estimates the number of tokens in a given text.
 * Rough estimate: 1 token ~ 4 characters.
 * @param text The text to estimate tokens for.
 * @returns The estimated token count.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Chunks a given text into smaller pieces for embedding,
 * aiming for a target token size with a specified overlap.
 * Tries to break at sentence boundaries.
 *
 * @param text The full text content to chunk.
 * @param targetTokens The desired token count for each chunk (default: 900).
 * @param overlapTokens The desired token overlap between chunks (default: 150).
 * @returns An array of text chunks with their content and metadata.
 */
export function chunkText(
  text: string,
  targetTokens: number = 900,
  overlapTokens: number = 150
): { content: string; chunk_index: number; start_char: number; end_char: number; token_count: number }[] {
  const normalizedText = normalizeText(text);
  const textLength = normalizedText.length;
  const chunks: { content: string; chunk_index: number; start_char: number; end_char: number; token_count: number }[] = [];

  if (textLength === 0) {
    return [];
  }

  const targetChars = targetTokens * 4;
  const overlapChars = overlapTokens * 4;

  let currentChunkIndex = 0;
  let currentPos = 0;

  if (estimateTokens(normalizedText) < targetTokens / 2) { 
    chunks.push({
      content: normalizedText,
      chunk_index: 0,
      start_char: 0,
      end_char: textLength - 1,
      token_count: estimateTokens(normalizedText),
    });
    return chunks;
  }

  while (currentPos < textLength) {
    let proposedEndPos = Math.min(currentPos + targetChars, textLength);
    let finalChunkEnd = proposedEndPos;

    const MIN_CHARS_BEFORE_SENTENCE_BREAK = Math.floor(targetChars * 0.5);
    const searchStartForBoundary = Math.max(currentPos + MIN_CHARS_BEFORE_SENTENCE_BREAK, currentPos + 1);
    const searchEndForBoundary = Math.min(textLength, proposedEndPos + 50);
    const sentenceBoundaryRegex = /[.?!](\s+|$)/g;
    sentenceBoundaryRegex.lastIndex = searchStartForBoundary;

    let match;
    let foundBoundary = -1;

    while ((match = sentenceBoundaryRegex.exec(normalizedText)) !== null && match.index < searchEndForBoundary) {
      foundBoundary = match.index + match[0].length;
      if (foundBoundary > currentPos) {
          break;
      }
    }

    if (foundBoundary !== -1 && foundBoundary > currentPos && foundBoundary <= searchEndForBoundary) {
      if (foundBoundary - currentPos > MIN_CHARS_BEFORE_SENTENCE_BREAK || chunks.length === 0) {
        finalChunkEnd = foundBoundary;
      }
    } else {
        const tempChunkContent = normalizedText.substring(currentPos, proposedEndPos);
        const lastSpaceIndex = tempChunkContent.lastIndexOf(' ');
        if (lastSpaceIndex > (targetChars * 0.8) && lastSpaceIndex !== -1 && (currentPos + lastSpaceIndex) > currentPos + (targetChars * 0.5)) {
            finalChunkEnd = currentPos + lastSpaceIndex;
        }
    }

    let rawChunk = normalizedText.substring(currentPos, finalChunkEnd);
    let chunkContent = rawChunk.trim();

    if (chunkContent.length === 0 && currentPos < textLength) {
        finalChunkEnd = Math.min(currentPos + 50, textLength);
        rawChunk = normalizedText.substring(currentPos, finalChunkEnd);
        chunkContent = rawChunk.trim();
    }
    
    if (chunkContent.length === 0) {
      currentPos = Math.min(currentPos + targetChars, textLength);
      continue;
    }
    const leadingSpaces = rawChunk.length - rawChunk.trimStart().length;
    const trueStartChar = currentPos + leadingSpaces;
    const trueEndChar = trueStartChar + chunkContent.length - 1;

    chunks.push({
      content: chunkContent,
      chunk_index: currentChunkIndex,
      start_char: trueStartChar,
      end_char: trueEndChar,
      token_count: estimateTokens(chunkContent),
    });

    currentChunkIndex++;
    currentPos = finalChunkEnd - overlapChars;
    if (currentPos < 0) currentPos = 0;
    if (finalChunkEnd >= textLength) {
        break;
    }
  }

  const MIN_CHUNK_CHARS = 50;
  if (chunks.length > 1) {
    const lastChunk = chunks[chunks.length - 1];
    if (lastChunk.content.length < MIN_CHUNK_CHARS) {
      const secondLastChunk = chunks[chunks.length - 2];
      secondLastChunk.end_char = lastChunk.end_char;
      secondLastChunk.content = normalizedText.substring(secondLastChunk.start_char, secondLastChunk.end_char + 1);
      secondLastChunk.token_count = estimateTokens(secondLastChunk.content);
      chunks.pop();
    }
  }

  return chunks;
}
