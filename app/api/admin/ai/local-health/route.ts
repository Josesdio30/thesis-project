import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { resolveProviderName } from '@/lib/ai';
import { resolveLocalAiConfig } from '@/lib/ai-local/config';
import { refreshLocalAiConfig } from '@/lib/ai-local/config-repo';
import { preflight } from '@/lib/ai-local/ollama-client';

/**
 * Operational check for the local stack: is Ollama reachable, and are the two
 * configured models pulled?
 *
 * Worth a dedicated endpoint because the alternative is discovering a missing
 * model halfway through a 27-answer grading run, by which point the job row
 * says "failed" and the cause is buried in server logs.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const provider = resolveProviderName();
  // Forced: an admin checking health right after saving must see the new row.
  await refreshLocalAiConfig({ force: true });
  const config = resolveLocalAiConfig();
  const health = await preflight([config.chatModel, config.embedModel], config);

  const ready = health.reachable && health.missingModels.length === 0;

  return NextResponse.json({
    success: true,
    data: {
      provider,
      ready,
      reachable: health.reachable,
      baseUrl: health.baseUrl,
      chatModel: config.chatModel,
      embedModel: config.embedModel,
      embedDims: config.embedDims,
      numCtx: config.numCtx,
      numPredict: config.numPredict,
      keepAlive: config.keepAlive,
      installedModels: health.installedModels,
      missingModels: health.missingModels,
      ...(health.error ? { error: health.error } : {}),
      // Actionable rather than merely diagnostic: the operator can copy this.
      ...(health.missingModels.length > 0
        ? { remediation: health.missingModels.map(m => `ollama pull ${m}`) }
        : {}),
    },
  });
}
