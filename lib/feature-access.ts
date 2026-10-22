import { isScopeEnabled, type FeatureName } from '@/lib/db2/admin-repo';

export type { FeatureName };

export interface FeatureAccessResult {
  allowed: boolean;
  reason?: string;
}

const FEATURE_LABELS: Record<FeatureName, string> = {
  ai_grading: 'AI grading',
  plagiarism: 'plagiarism detection',
};

/**
 * Access is decided per course. A course must be explicitly enabled for the
 * feature before any teacher can use it.
 */
export async function canUseFeature(
  courseId: string,
  feature: FeatureName
): Promise<FeatureAccessResult> {
  const enabled = await isScopeEnabled('course', courseId, feature);
  if (!enabled) {
    return {
      allowed: false,
      reason: `This course is not enabled for ${FEATURE_LABELS[feature]}`,
    };
  }
  return { allowed: true };
}
