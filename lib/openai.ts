import OpenAI from 'openai';
import { getCredential } from '@/lib/db2/admin-repo';
import { decryptSecret } from '@/lib/crypto';

let cached: { key: string; client: OpenAI } | null = null;

async function resolveApiKey(): Promise<string> {
  try {
    const credential = await getCredential('openai');
    if (credential?.encrypted_key) {
      return decryptSecret(credential.encrypted_key);
    }
  } catch (error) {
    console.error('[openai] failed to load stored credential, falling back to env', error);
  }

  const envKey = process.env.OPENAI_API_KEY;
  if (!envKey) {
    throw new Error('No OpenAI API key configured (set one in Admin > Credentials or OPENAI_API_KEY)');
  }
  return envKey;
}

/**
 * Returns an OpenAI client built from the admin-managed credential, falling
 * back to the OPENAI_API_KEY env var. The client is cached and rebuilt only
 * when the underlying key changes.
 */
export async function getOpenAI(): Promise<OpenAI> {
  const key = await resolveApiKey();
  if (cached && cached.key === key) {
    return cached.client;
  }
  const client = new OpenAI({ apiKey: key });
  cached = { key, client };
  return client;
}

/** Drop the cached client — call after the stored credential is updated. */
export function resetOpenAICache(): void {
  cached = null;
}
