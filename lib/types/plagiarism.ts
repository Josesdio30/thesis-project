export interface PdsDetection {
  id: string;
  assignment_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  started_at: Date;
  completed_at?: Date;
  total_submissions: number;
  processed_submissions: number;
  error_message?: string;
  created_by: string;
}

export interface PdsChunk {
  id: string;
  submission_id: string;
  content: string;
  chunk_index: number;
  start_char: number;
  end_char: number;
  token_count: number;
  created_at: Date;
}

export interface PdsEmbedding {
  id: string;
  chunk_id: string;
  vector: number[]; // 384 dimensions
  model: string;
  created_at: Date;
}

export interface ChunkMatch {
  source_chunk_id: string;
  target_chunk_id: string;
  similarity: number;
  source_text: string;
  target_text: string;
  source_start: number;
  source_end: number;
  target_start: number;
  target_end: number;
}

export interface PdsComparison {
  id: string;
  source_submission_id: string;
  target_submission_id: string;
  semantic_score: number;
  lexical_score: number;
  combined_score: number;
  risk_level: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  matched_chunks: ChunkMatch[];
  compared_at: Date;
}

export interface PdsFlag {
  id: string;
  comparison_id: string;
  submission_id: string;
  status: 'pending' | 'reviewed' | 'false_positive' | 'confirmed';
  reviewed: boolean;
  reviewed_at?: Date;
  reviewed_by?: string;
  is_false_positive: boolean;
  teacher_notes?: string;
  action_taken?: string;
  created_at: Date;
}

export interface PdsTeacherAction {
  id: string;
  flag_id: string;
  teacher_id: string;
  action: string;
  notes?: string;
  created_at: Date;
}

export interface PdsAuditLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata?: Record<string, any>;
  created_at: Date;
}
