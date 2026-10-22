import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getCredential, upsertCredential, deleteCredential } from '@/lib/db2/admin-repo';
import { encryptSecret, maskSecret } from '@/lib/crypto';
import { resetOpenAICache } from '@/lib/openai';
import { logAudit } from '@/lib/audit';

const PROVIDER = 'openai';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const credential = await getCredential(PROVIDER);

  if (credential) {
    return NextResponse.json({
      success: true,
      data: {
        provider: PROVIDER,
        configured: true,
        source: 'database',
        key_hint: credential.key_hint,
        updated_by: credential.updated_by,
        updated_at: credential.updated_at,
      },
    });
  }

  const envKey = process.env.OPENAI_API_KEY;
  return NextResponse.json({
    success: true,
    data: {
      provider: PROVIDER,
      configured: Boolean(envKey),
      source: envKey ? 'env' : 'none',
      key_hint: envKey ? maskSecret(envKey) : null,
      updated_by: null,
      updated_at: null,
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

  const { apiKey } = (body ?? {}) as Record<string, unknown>;
  if (typeof apiKey !== 'string' || apiKey.trim().length < 8) {
    return NextResponse.json(
      { success: false, error: 'A valid apiKey is required' },
      { status: 400 }
    );
  }

  const trimmed = apiKey.trim();
  await upsertCredential({
    provider: PROVIDER,
    encrypted_key: encryptSecret(trimmed),
    key_hint: maskSecret(trimmed),
    updated_by: admin.user.id,
  });
  resetOpenAICache();

  await logAudit({
    actorUserId: admin.user.id,
    actorName: admin.user.name,
    action: 'credential.updated',
    entityType: 'api_credential',
    entityId: PROVIDER,
    details: { provider: PROVIDER, key_hint: maskSecret(trimmed) },
  });

  return NextResponse.json({
    success: true,
    data: { provider: PROVIDER, key_hint: maskSecret(trimmed) },
  });
}

/** Reset to default: remove the stored key so the OPENAI_API_KEY env var is used. */
export async function DELETE() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  await deleteCredential(PROVIDER);
  resetOpenAICache();

  await logAudit({
    actorUserId: admin.user.id,
    actorName: admin.user.name,
    action: 'credential.reset',
    entityType: 'api_credential',
    entityId: PROVIDER,
    details: { provider: PROVIDER },
  });

  return NextResponse.json({ success: true });
}
