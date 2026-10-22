import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getAiConfigRow, updateAiConfig } from '@/lib/db2/admin-repo';
import { getEffectiveAiConfig, getAiConfigDefaults } from '@/lib/ai-config';
import { logAudit } from '@/lib/audit';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const [row, effective] = await Promise.all([getAiConfigRow(), getEffectiveAiConfig()]);
  const defaults = getAiConfigDefaults();

  return NextResponse.json({
    success: true,
    data: {
      model: row?.model ?? effective.model,
      temperature: row?.temperature ?? effective.temperature,
      max_tokens: row?.max_tokens ?? effective.maxTokens,
      system_prompt: row?.system_prompt ?? effective.systemPrompt,
      updated_by: row?.updated_by ?? null,
      updated_at: row?.updated_at ?? null,
    },
    defaults: {
      model: defaults.model,
      temperature: defaults.temperature,
      max_tokens: defaults.maxTokens,
      system_prompt: defaults.systemPrompt,
    },
  });
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { model, temperature, max_tokens, system_prompt } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (typeof model !== 'string' || model.trim().length === 0) {
    return NextResponse.json({ success: false, error: 'model is required' }, { status: 400 });
  }
  if (typeof temperature !== 'number' || temperature < 0 || temperature > 2) {
    return NextResponse.json(
      { success: false, error: 'temperature must be a number between 0 and 2' },
      { status: 400 }
    );
  }
  if (max_tokens !== null && (typeof max_tokens !== 'number' || max_tokens <= 0)) {
    return NextResponse.json(
      { success: false, error: 'max_tokens must be a positive number or null' },
      { status: 400 }
    );
  }
  if (typeof system_prompt !== 'string') {
    return NextResponse.json(
      { success: false, error: 'system_prompt must be a string' },
      { status: 400 }
    );
  }

  const updated = await updateAiConfig({
    model: model.trim(),
    temperature,
    max_tokens: (max_tokens as number | null) ?? null,
    system_prompt,
    updated_by: admin.user.id,
  });

  await logAudit({
    actorUserId: admin.user.id,
    actorName: admin.user.name,
    action: 'ai_config.updated',
    entityType: 'ai_config',
    entityId: '1',
    details: { model: updated.model, temperature: updated.temperature, max_tokens: updated.max_tokens },
  });

  return NextResponse.json({ success: true, data: updated });
}
