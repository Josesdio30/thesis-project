import { isScopeEnabled } from '@/lib/db2/admin-repo';
import { canUseFeature } from '@/lib/feature-access';

jest.mock('@/lib/db2/admin-repo', () => ({ isScopeEnabled: jest.fn() }));

const mockIsScopeEnabled = isScopeEnabled as jest.Mock;

describe('FR-AIM-4 / FR-ACS-1: per-course feature access', () => {
  test.each(['ai_grading', 'plagiarism'] as const)('FR-AIM-4: an enabled course may use %s', async feature => {
    mockIsScopeEnabled.mockResolvedValue(true);

    await expect(canUseFeature('7', feature)).resolves.toEqual({ allowed: true });
    expect(mockIsScopeEnabled).toHaveBeenCalledWith('course', '7', feature);
  });

  test.each([
    ['ai_grading', 'This course is not enabled for AI grading'],
    ['plagiarism', 'This course is not enabled for plagiarism detection'],
  ] as const)('FR-ACS-1: a course without %s is refused with a readable reason', async (feature, reason) => {
    mockIsScopeEnabled.mockResolvedValue(false);

    await expect(canUseFeature('7', feature)).resolves.toEqual({ allowed: false, reason });
  });

  test('FR-AIM-7: access is decided by course scope only (teacher scope is unused)', async () => {
    mockIsScopeEnabled.mockResolvedValue(true);

    await canUseFeature('7', 'ai_grading');

    expect(mockIsScopeEnabled).toHaveBeenCalledTimes(1);
    expect(mockIsScopeEnabled.mock.calls[0][0]).toBe('course');
  });

  test('a repository failure propagates instead of granting access', async () => {
    mockIsScopeEnabled.mockRejectedValue(new Error('aux db down'));
    await expect(canUseFeature('7', 'plagiarism')).rejects.toThrow('aux db down');
  });
});
