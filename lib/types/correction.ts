export interface GradingResult {
  score: number | null;
  max_score: number;
  qualitative_grade: 'Excellent' | 'Good' | 'Fair' | 'Poor' | null;
  feedback: string;
  citations: string[];
  confidence: 'low' | 'medium' | 'high';
  rubric_alignment: Record<string, 'pass' | 'fail'>;
  language_detected: 'id' | 'en';
  token_usage_estimate: number;
}

export interface RubricCriteria {
  [key: string]: number;
}

export interface Rubric {
  max_score: number;
  criteria: RubricCriteria;
  qualitative_scale: string[];
}

export interface ACSAssignment {
  id: string;
  assignment_id: string;
  course_id: string;
  vector_store_id: string;
  rubric: Rubric[];
  created_by: string;
  status: 'setup' | 'active' | 'archived';
  created_at: string;
  archived_at?: string;
}
