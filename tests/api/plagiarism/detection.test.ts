import { initDetection, processDetection } from '@/lib/plagiarism/detection';
import { queryLMS } from '@/lib/lms-db';
import { generateEmbeddingsBatch } from '@/lib/plagiarism/embeddings';
import {
  cleanupPreviousDetectionData,
  createDetection,
  insertAuditLog,
  insertChunksReturningIds,
  insertComparisons,
  insertEmbeddings,
  insertFlags,
  updateDetection,
} from '@/lib/db2/pds-repo';

// Mock dependencies
jest.mock('@/lib/lms-db', () => ({
  queryLMS: jest.fn(),
}));

const BASELINE_TABLES = {
  detections: 'pds_detections',
  chunks: 'pds_chunks',
  embeddings: 'pds_embeddings',
  comparisons: 'pds_comparisons',
  flags: 'pds_flags',
  teacherActions: 'pds_teacher_actions',
  auditLogs: 'pds_audit_logs',
};

jest.mock('@/lib/db2/pds-repo', () => ({
  cleanupPreviousDetectionData: jest.fn(),
  createDetection: jest.fn(),
  updateDetection: jest.fn(),
  insertChunksReturningIds: jest.fn(),
  insertEmbeddings: jest.fn(),
  insertComparisons: jest.fn(),
  insertFlags: jest.fn(),
  insertAuditLog: jest.fn(),
  findSimilarChunksLateral: jest.fn(),
  // The real thing returns one of two frozen table sets; detection.ts only
  // forwards it to the (mocked) repo, so echoing a marker is enough here.
  pdsTables: jest.fn(() => ({
    detections: 'pds_detections',
    chunks: 'pds_chunks',
    embeddings: 'pds_embeddings',
    comparisons: 'pds_comparisons',
    flags: 'pds_flags',
    teacherActions: 'pds_teacher_actions',
    auditLogs: 'pds_audit_logs',
  })),
}));

jest.mock('@/lib/plagiarism/embeddings', () => ({
  generateEmbeddingsBatch: jest.fn(),
}));

describe('plagiarism detection', () => {
  const mockQueryLMS = queryLMS as jest.Mock;
  const mockGenerateEmbeddingsBatch = generateEmbeddingsBatch as jest.Mock;
  const mockCreateDetection = createDetection as jest.Mock;
  const mockUpdateDetection = updateDetection as jest.Mock;
  const mockCleanup = cleanupPreviousDetectionData as jest.Mock;
  const mockInsertChunksReturningIds = insertChunksReturningIds as jest.Mock;
  const mockInsertEmbeddings = insertEmbeddings as jest.Mock;
  const mockInsertComparisons = insertComparisons as jest.Mock;
  const mockInsertFlags = insertFlags as jest.Mock;
  const mockInsertAuditLog = insertAuditLog as jest.Mock;
  const mockFindSimilarChunksLateral = require('@/lib/db2/pds-repo').findSimilarChunksLateral as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateDetection.mockResolvedValue({ id: 'detection-123' });
    mockUpdateDetection.mockResolvedValue(undefined);
    mockCleanup.mockResolvedValue(undefined);
    mockInsertChunksReturningIds.mockImplementation((chunks: any) =>
      Promise.resolve(chunks.map((c: any) => ({ id: `chunk-${c.chunk_index}`, chunk_index: c.chunk_index })))
    );
    mockInsertEmbeddings.mockResolvedValue(undefined);
    mockInsertComparisons.mockResolvedValue(undefined);
    mockInsertFlags.mockResolvedValue(undefined);
    mockInsertAuditLog.mockResolvedValue(undefined);
    mockFindSimilarChunksLateral.mockResolvedValue([]);
  });

  describe('initDetection', () => {
    it('should create a detection record with all-questions scope and return the ID', async () => {
      const detectionId = await initDetection('101', 'teacher-1');

      expect(detectionId).toBe('detection-123');
      expect(mockCreateDetection).toHaveBeenCalledWith(
        {
          assignment_id: '101',
          status: 'processing',
          created_by: 'teacher-1',
          scanned_question_ids: ['all'],
        },
        BASELINE_TABLES
      );
    });

    it('should store specific question IDs when provided', async () => {
      await initDetection('101', 'teacher-1', ['42', '57']);

      expect(mockCreateDetection).toHaveBeenCalledWith(
        {
          assignment_id: '101',
          status: 'processing',
          created_by: 'teacher-1',
          scanned_question_ids: ['42', '57'],
        },
        BASELINE_TABLES
      );
    });
  });

  describe('processDetection', () => {
    it('should run detection with per-question scoring and store per_question_scores', async () => {
      // One row per (submission, question) with question_id
      mockQueryLMS.mockResolvedValue([
        { submission_id: 'sub-1', student_id: 'student-A', question_id: 'q-1', answer_text: 'Apple banana cherry is a fruit.' },
        { submission_id: 'sub-1', student_id: 'student-A', question_id: 'q-2', answer_text: 'Second essay answer here.' },
        { submission_id: 'sub-2', student_id: 'student-B', question_id: 'q-1', answer_text: 'Apple banana cherry is a fruit.' },
        { submission_id: 'sub-2', student_id: 'student-B', question_id: 'q-2', answer_text: 'Second essay answer here.' },
      ]);

      mockGenerateEmbeddingsBatch.mockResolvedValue({
        vectors: [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]],
        totalTokens: 20,
      });

      mockFindSimilarChunksLateral.mockResolvedValue([
        {
          source_chunk_id: 'chunk-0',
          target_chunk_id: 'chunk-2',
          source_submission_id: 'sub-1',
          target_submission_id: 'sub-2',
          source_content: 'Apple banana cherry is a fruit.',
          target_content: 'Apple banana cherry is a fruit.',
          question_index: 0,
          similarity: 1.0,
        },
        {
          source_chunk_id: 'chunk-1',
          target_chunk_id: 'chunk-3',
          source_submission_id: 'sub-1',
          target_submission_id: 'sub-2',
          source_content: 'Second essay answer here.',
          target_content: 'Second essay answer here.',
          question_index: 1,
          similarity: 1.0,
        }
      ]);

      await processDetection('detection-123', '101', 'teacher-1');

      expect(mockCleanup).toHaveBeenCalledWith(['sub-1', 'sub-2'], BASELINE_TABLES);
      expect(mockQueryLMS).toHaveBeenCalled();
      expect(mockInsertEmbeddings).toHaveBeenCalled();

      expect(mockInsertComparisons).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            source_submission_id: 'sub-1',
            target_submission_id: 'sub-2',
            matched_chunks: expect.objectContaining({
              per_question_scores: expect.arrayContaining([
                expect.objectContaining({ question_index: 0 }),
                expect.objectContaining({ question_index: 1 }),
              ]),
            }),
          }),
        ]),
        BASELINE_TABLES
      );

      expect(mockInsertFlags).toHaveBeenCalled();
      expect(mockInsertAuditLog).toHaveBeenCalled();
      expect(mockUpdateDetection).toHaveBeenCalledWith(
        'detection-123',
        expect.objectContaining({ status: 'completed' }),
        BASELINE_TABLES
      );
    });

    it('should detect similarity even with moderate cosine (no 0.7 hard gate)', async () => {
      mockQueryLMS.mockResolvedValue([
        { submission_id: 'sub-1', student_id: 'student-A', question_id: 'q-1', answer_text: 'Model bahasa tidak menggunakan kata sebagai unit pemrosesan karena dua masalah utama.' },
        { submission_id: 'sub-2', student_id: 'student-B', question_id: 'q-1', answer_text: 'Model bahasa tidak menggunakan kata sebagai unit pemrosesan karena dua masalah utama.' },
      ]);

      mockGenerateEmbeddingsBatch
        .mockResolvedValueOnce({ vectors: [[1, 0, 0]], totalTokens: 10 })
        .mockResolvedValueOnce({ vectors: [[0.65, 0.76, 0]], totalTokens: 10 });

      mockFindSimilarChunksLateral.mockResolvedValue([
        {
          source_chunk_id: 'chunk-0',
          target_chunk_id: 'chunk-1',
          source_submission_id: 'sub-1',
          target_submission_id: 'sub-2',
          source_content: 'Model bahasa tidak menggunakan kata sebagai unit pemrosesan karena dua masalah utama.',
          target_content: 'Model bahasa tidak menggunakan kata sebagai unit pemrosesan karena dua masalah utama.',
          question_index: 0,
          similarity: 0.65,
        }
      ]);

      await processDetection('detection-123', '101', 'teacher-1');

      expect(mockInsertComparisons).toHaveBeenCalled();
      const comparisonArg = mockInsertComparisons.mock.calls[0][0][0];
      expect(comparisonArg.combined_score).toBeGreaterThan(0.4);
    });

    it('should handle errors gracefully and mark detection as failed', async () => {
      mockQueryLMS.mockRejectedValue(new Error('DB Connection Failed'));

      await processDetection('detection-123', '101', 'teacher-1');

      expect(mockUpdateDetection).toHaveBeenCalledWith(
        'detection-123',
        { status: 'failed', error_message: 'DB Connection Failed' },
        BASELINE_TABLES
      );
    });
  });
});
