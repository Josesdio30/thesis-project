import {
  calculateCombinedScore,
  calculateRiskLevel,
  calculateCosineSimilarity,
  calculateJaccardSimilarity,
  calculateBM25CorpusStats,
  calculateBM25Similarity,
  tokenizeForLexical,
  tokenizeForJaccard,
  calculateDistributionStats,
  calculateZScore,
  zScoreToNormalizedScore,
} from '@/lib/plagiarism/similarity';

describe('Similarity Calculations', () => {
  describe('Cosine Similarity', () => {
    it('should calculate cosine similarity correctly for identical vectors', () => {
      const vecA = [1, 2, 3];
      const vecB = [1, 2, 3];
      expect(calculateCosineSimilarity(vecA, vecB)).toBeCloseTo(1.0);
    });

    it('should calculate cosine similarity for orthogonal vectors', () => {
      const vecA = [1, 0];
      const vecB = [0, 1];
      expect(calculateCosineSimilarity(vecA, vecB)).toBeCloseTo(0.0);
    });

    it('should calculate cosine similarity for opposite vectors', () => {
      const vecA = [1, 1];
      const vecB = [-1, -1];
      expect(calculateCosineSimilarity(vecA, vecB)).toBeCloseTo(-1.0);
    });

    it('should handle zero vectors', () => {
      const vecA = [0, 0];
      const vecB = [1, 1];
      expect(calculateCosineSimilarity(vecA, vecB)).toBe(0);
    });

    it('should throw error for mismatched dimensions', () => {
      expect(() => calculateCosineSimilarity([1], [1, 2])).toThrow();
    });
  });

  describe('BM25 Lexical Similarity', () => {
    it('should calculate corpus stats and similarity correctly', () => {
      const corpus = [
        'The quick brown fox jumps over the lazy dog',
        'A quick brown fox',
        'Something completely different and unrelated',
      ];
      
      const stats = calculateBM25CorpusStats(corpus);
      expect(stats.avgdl).toBeGreaterThan(0);
      expect(stats.idf.size).toBeGreaterThan(0);

      const simExact = calculateBM25Similarity(corpus[0], corpus[0], stats);
      expect(simExact).toBeCloseTo(1.0);

      const simPartial = calculateBM25Similarity(corpus[0], corpus[1], stats);
      expect(simPartial).toBeGreaterThan(0.0);
      expect(simPartial).toBeLessThan(1.0);

      const simNone = calculateBM25Similarity(corpus[0], corpus[2], stats);
      expect(simNone).toBe(0.0);
    });

    it('should safely return 0 for empty arrays', () => {
      const stats = calculateBM25CorpusStats([]);
      expect(stats.avgdl).toBe(0);
      expect(stats.idf.size).toBe(0);
    });

    it('should handle missing embeddings/tokens gracefully', () => {
      const stats = calculateBM25CorpusStats(['apple banana', 'banana orange']);
      const sim = calculateBM25Similarity('', 'apple banana', stats);
      expect(sim).toBe(0);
    });

    it('should handle out of vocabulary words safely', () => {
      const stats = calculateBM25CorpusStats(['apple banana', 'banana orange']);
      const sim = calculateBM25Similarity('strawberry melon', 'apple banana', stats);
      expect(sim).toBe(0);
    });
  });

  describe('Jaccard Similarity', () => {
    it('should calculate Jaccard similarity correctly', () => {
      const textA = 'The quick brown fox';
      const textB = 'quick brown dog';
      expect(calculateJaccardSimilarity(textA, textB)).toBe(0.5);
    });

    it('should return 1.0 for identical texts', () => {
      const text = 'hello world';
      expect(calculateJaccardSimilarity(text, text)).toBe(1.0);
    });

    it('should return 0.0 for completely different texts', () => {
      const textA = 'hello world';
      const textB = 'foo bar';
      expect(calculateJaccardSimilarity(textA, textB)).toBe(0.0);
    });

    it('should handle empty text gracefully', () => {
      const textA = '';
      const textB = 'hello world';
      expect(tokenizeForJaccard(textA).size).toBe(0);
      expect(calculateJaccardSimilarity(textA, textB)).toBe(0);
    });

    it('should handle both empty texts gracefully', () => {
      const textA = '';
      const textB = '';
      expect(tokenizeForJaccard(textA).size).toBe(0);
      expect(calculateJaccardSimilarity(textA, textB)).toBe(0);
    });

    it('should handle text with only stopwords', () => {
      const textA = 'the and or';
      const textB = 'the and or';
      expect(calculateJaccardSimilarity(textA, textB)).toBe(0);
    });
  });

  describe('Combined Score (fallback: 0.55 semantic + 0.45 lexical)', () => {
    it('should compute weighted average above soft gate', () => {
      // semantic=0.8 > 0.3 → weighted=0.8; 0.55*0.8 + 0.45*0.5 = 0.665
      expect(calculateCombinedScore(0.8, 0.5)).toBeCloseTo(0.665, 3);
    });

    it('should apply soft-gate penalty when semantic is below 0.3', () => {
      // semantic=0.2 < 0.3 → weighted=0.1; 0.55*0.1 + 0.45*0.8 = 0.415
      expect(calculateCombinedScore(0.2, 0.8)).toBeCloseTo(0.415, 3);
    });

    it('should not return 0 when lexical is 0 (semantic still contributes)', () => {
      // 0.55 * 0.6 + 0.45 * 0 = 0.33
      expect(calculateCombinedScore(0.6, 0.0)).toBeCloseTo(0.33, 3);
    });

    it('should clamp final score to [0, 1]', () => {
      expect(calculateCombinedScore(1.0, 1.0)).toBeLessThanOrEqual(1);
      expect(calculateCombinedScore(0.0, 0.0)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Distribution Stats', () => {
    it('should compute mean and sample std correctly', () => {
      const { mean, std } = calculateDistributionStats([2, 4, 4, 4, 5, 5, 7, 9]);
      expect(mean).toBeCloseTo(5.0, 2);
      // Sample std (Bessel): sqrt(32/7) ≈ 2.138
      expect(std).toBeCloseTo(2.138, 2);
    });

    it('should return zero std for single-element arrays', () => {
      const { mean, std } = calculateDistributionStats([0.5]);
      expect(mean).toBe(0.5);
      expect(std).toBe(0);
    });

    it('should return zero for empty arrays', () => {
      const { mean, std } = calculateDistributionStats([]);
      expect(mean).toBe(0);
      expect(std).toBe(0);
    });
  });

  describe('Z-Score Normalization', () => {
    it('should compute z-score as (value - mean) / std', () => {
      expect(calculateZScore(0.8, 0.5, 0.1)).toBeCloseTo(3.0, 2);
      expect(calculateZScore(0.5, 0.5, 0.1)).toBeCloseTo(0.0, 2);
      expect(calculateZScore(0.4, 0.5, 0.1)).toBeCloseTo(-1.0, 2);
    });

    it('should return 0 when std is 0 (no discrimination)', () => {
      expect(calculateZScore(0.8, 0.5, 0)).toBe(0);
    });

    it('should map z-score to [0,1] via linear clamp at z=3', () => {
      expect(zScoreToNormalizedScore(0)).toBe(0);
      expect(zScoreToNormalizedScore(-1)).toBe(0); // clamped to 0
      expect(zScoreToNormalizedScore(1.2)).toBeCloseTo(0.4, 2); // LOW threshold
      expect(zScoreToNormalizedScore(1.8)).toBeCloseTo(0.6, 2); // MEDIUM threshold
      expect(zScoreToNormalizedScore(2.4)).toBeCloseTo(0.8, 2); // HIGH threshold
      expect(zScoreToNormalizedScore(3)).toBe(1);
      expect(zScoreToNormalizedScore(5)).toBe(1); // clamped to 1
    });
  });

  describe('Risk Level', () => {
    it('should calculate risk level HIGH', () => {
      expect(calculateRiskLevel(0.85)).toBe('HIGH');
      expect(calculateRiskLevel(0.8)).toBe('HIGH');
    });

    it('should calculate risk level MEDIUM', () => {
      expect(calculateRiskLevel(0.79)).toBe('MEDIUM');
      expect(calculateRiskLevel(0.6)).toBe('MEDIUM');
    });

    it('should calculate risk level LOW', () => {
      expect(calculateRiskLevel(0.59)).toBe('LOW');
      expect(calculateRiskLevel(0.4)).toBe('LOW');
    });

    it('should calculate risk level NONE', () => {
      expect(calculateRiskLevel(0.39)).toBe('NONE');
      expect(calculateRiskLevel(0.0)).toBe('NONE');
    });
  });
});
