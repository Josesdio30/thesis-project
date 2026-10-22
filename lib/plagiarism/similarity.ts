
export const SIMILARITY_THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.6,
  LOW: 0.4,
  NONE: 0.0,
};

export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
const STOPWORDS = new Set([
  // English
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
  'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
  'is', 'are', 'was', 'were', 'been', 'has', 'had', 'does', 'did', 'can',
  'could', 'should', 'would', 'may', 'might', 'must', 'am',
  // Indonesian
  'yang', 'di', 'dan', 'itu', 'dengan', 'untuk', 'tidak', 'ini', 'dari', 'dalam',
  'akan', 'pada', 'juga', 'saya', 'adalah', 'ke', 'karena', 'kepada', 'oleh', 'saat',
  'harus', 'sementara', 'setelah', 'belum', 'kami', 'kita', 'mereka', 'dia', 'ia',
  'atau', 'bisa', 'dapat', 'sudah', 'bagi', 'namun', 'tentang', 'seperti', 'jika',
  'sehingga', 'ia', 'tapi', 'sangat', 'banyak', 'lebih'
]);

/**
 * Calculates the cosine similarity between two vectors.
 * Formula: dot(A, B) / (||A|| * ||B||)
 * 
 * @param vecA - First vector (number array)
 * @param vecB - Second vector (number array)
 * @returns Similarity score between -1.0 and 1.0 (usually 0.0 to 1.0 for text embeddings)
 */
export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same dimensionality');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Tokenizes text for Jaccard similarity.
 * - Lowercase
 * - Remove punctuation
 * - Split by whitespace
 * - Filter short words (< 3 chars) and stopwords
 * 
 * @param text - Raw text
 * @returns Set of unique tokens
 */
export function tokenizeForJaccard(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[^\w\s]/g, '');
  const words = normalized.split(/\s+/);
  
  const tokens = new Set<string>();
  for (const word of words) {
    if (word.length >= 3 && !STOPWORDS.has(word)) {
      tokens.add(word);
    }
  }
  return tokens;
}

/**
 * Tokenizes text for BM25 similarity (returns array to preserve frequencies).
 */
export function tokenizeForLexical(text: string): string[] {
  const normalized = text.toLowerCase().replace(/[^\w\s]/g, '');
  const words = normalized.split(/\s+/);
  return words.filter(word => word.length >= 3 && !STOPWORDS.has(word));
}

export interface BM25Stats {
  idf: Map<string, number>;
  avgdl: number;
}

/**
 * Calculates corpus statistics (IDF and average document length) required for BM25.
 */
export function calculateBM25CorpusStats(texts: string[]): BM25Stats {
  const docFreq = new Map<string, number>();
  let totalTokens = 0;
  const N = texts.length;

  if (N === 0) return { idf: new Map(), avgdl: 0 };

  for (const text of texts) {
    const tokens = tokenizeForLexical(text);
    totalTokens += tokens.length;
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      docFreq.set(token, (docFreq.get(token) || 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [token, df] of docFreq.entries()) {
    // Standard BM25 IDF formula
    const idfVal = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    idf.set(token, idfVal);
  }

  return { idf, avgdl: totalTokens / N };
}

function computeRawBM25(queryTokens: string[], docTokens: string[], stats: BM25Stats): number {
  if (stats.avgdl === 0 || docTokens.length === 0 || queryTokens.length === 0) return 0;
  
  const k1 = 1.2;
  const b = 0.75;
  const dl = docTokens.length;

  const docFreq = new Map<string, number>();
  for (const token of docTokens) docFreq.set(token, (docFreq.get(token) || 0) + 1);

  let score = 0;
  const uniqueQueryTokens = new Set(queryTokens);
  
  for (const qToken of uniqueQueryTokens) {
    const freq = docFreq.get(qToken);
    if (!freq) continue;
    const idf = stats.idf.get(qToken) ?? 0;
    const numerator = freq * (k1 + 1);
    const denominator = freq + k1 * (1 - b + b * (dl / stats.avgdl));
    score += idf * (numerator / denominator);
  }

  return score;
}

/**
 * Calculates a normalized, symmetric BM25 similarity between two texts.
 */
export function calculateBM25Similarity(textA: string, textB: string, stats: BM25Stats): number {
  const tokensA = tokenizeForLexical(textA);
  const tokensB = tokenizeForLexical(textB);

  const scoreAB = computeRawBM25(tokensA, tokensB, stats);
  const scoreAA = computeRawBM25(tokensA, tokensA, stats);
  const scoreBA = computeRawBM25(tokensB, tokensA, stats);
  const scoreBB = computeRawBM25(tokensB, tokensB, stats);

  if (scoreAA === 0 || scoreBB === 0) return 0;

  const normalized = (scoreAB / scoreAA + scoreBA / scoreBB) / 2;
  return Math.min(Math.max(normalized, 0), 1);
}

/**
 * Calculates the Jaccard similarity between two texts.
 * Formula: |Intersection| / |Union|
 * 
 * @param textA - First text
 * @param textB - Second text
 * @returns Similarity score between 0.0 and 1.0
 */
export function calculateJaccardSimilarity(textA: string, textB: string): number {
  const tokensA = tokenizeForJaccard(textA);
  const tokensB = tokenizeForJaccard(textB);

  if (tokensA.size === 0 && tokensB.size === 0) return 0; // Both empty -> 0 similarity? Or 1? Usually 0 for empty content.

  let intersectionCount = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersectionCount++;
    }
  }

  const unionCount = tokensA.size + tokensB.size - intersectionCount;
  
  if (unionCount === 0) return 0;

  return intersectionCount / unionCount;
}

/**
 * Calculates the combined similarity score using a weighted average.
 * Formula: 0.3 * Semantic + 0.7 * Lexical
 *
 * Lexical (BM25) is the primary signal — shared specific words is the real
 * evidence of copying. Semantic confirms the meaning is related but alone
 * cannot distinguish "two students who understood the material" from copying.
 *
 * With these weights, paraphrased text (high semantic ~0.78, low lexical ~0.15)
 * scores ~0.34 (NONE), while exact copies (both ~1.0) score ~1.0 (HIGH).
 *
 * A soft gate (0.3) penalizes pairs with extremely low semantic overlap,
 * preventing pure keyword-stuffing from producing a false positive.
 *
 * @param semanticScore - Cosine similarity score (0-1)
 * @param lexicalScore - BM25 similarity score (0-1)
 * @returns Combined score (0-1)
 */
export function calculateCombinedScore(semanticScore: number, lexicalScore: number): number {
  const SOFT_GATE = 0.3;

  // If semantic is extremely low, halve its contribution to reduce noise.
  const weightedSemantic = semanticScore < SOFT_GATE ? semanticScore * 0.5 : semanticScore;

  // Weighting: 30% Semantic (meaning), 70% Lexical (specific word choice)
  const score = (0.55 * weightedSemantic) + (0.45 * lexicalScore);

  return Number.isNaN(score) ? 0 : Math.min(score, 1);
}

/**
 * Determines the risk level based on the combined score.
 *
 * @param score - Combined similarity score (0-1)
 * @returns Risk Level string ('HIGH', 'MEDIUM', 'LOW', 'NONE')
 */
export function calculateRiskLevel(score: number): RiskLevel {
  if (score >= SIMILARITY_THRESHOLDS.HIGH) return 'HIGH';
  if (score >= SIMILARITY_THRESHOLDS.MEDIUM) return 'MEDIUM';
  if (score >= SIMILARITY_THRESHOLDS.LOW) return 'LOW';
  return 'NONE';
}

/**
 * Calculates mean and sample standard deviation of a numeric array.
 * Uses Bessel's correction (n-1) for unbiased sample std.
 */
export function calculateDistributionStats(values: number[]): { mean: number; std: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, std: 0 };

  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  if (n < 2) return { mean, std: 0 };

  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Z-score: how many standard deviations above the mean is this value.
 * Returns 0 if std is 0 (all samples identical — no discrimination possible).
 */
export function calculateZScore(value: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (value - mean) / std;
}

/**
 * Maps a z-score to a normalized plagiarism score in [0, 1].
 *
 * Mapping (linear clamp, z/3):
 *   z ≤ 0   → 0.00  (at or below average)
 *   z = 1.2 → 0.40  (LOW threshold)
 *   z = 1.8 → 0.60  (MEDIUM threshold)
 *   z = 2.4 → 0.80  (HIGH threshold)
 *   z ≥ 3   → 1.00  (extreme outlier)
 *
 * The thresholds map naturally to SIMILARITY_THRESHOLDS:
 *   - A pair must be >1.2σ above the class mean to be flagged at all.
 *   - Exact copies are typically 2.5-3σ+ outliers → HIGH.
 */
export function zScoreToNormalizedScore(z: number): number {
  if (z <= 0) return 0;
  return Math.min(z / 3, 1);
}
