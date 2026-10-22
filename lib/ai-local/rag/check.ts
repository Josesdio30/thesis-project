/**
 * Pre-flight check for the files an assignment will be graded against — the
 * local counterpart of asking OpenAI whether each uploaded file still exists.
 *
 * The response types live here rather than in the route so the lib module and
 * the route share one definition; the route re-exports them.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from '@/lib/ai-local/rag/checksum';
import { countDocumentChunks, findDocumentByChecksum } from '@/lib/ai-local/rag/repo';

export interface FileCheckResult {
  resource_id: number;
  filename: string;
  local_path: string;
  local_exists: boolean;
  openai_file_id: string | null;
  openai_exists: boolean;
  status: 'ok' | 'missing_openai' | 'missing_local' | 'new';
}

export interface CheckFilesResponse {
  files: FileCheckResult[];
  summary: {
    ok: number;
    missing_openai: number;
    missing_local: number;
    new: number;
  };
  can_proceed: boolean;
}

export interface CheckResource {
  id: number;
  file_url: string;
  file_name: string;
}

/**
 * Locally the file on disk is the only source, so `missing_openai` cannot
 * occur. "ok" means identical bytes are already parsed and embedded, which is
 * exactly the condition under which `createLocalCorpus` reuses a document.
 */
export async function checkLocalResources(resources: CheckResource[]): Promise<FileCheckResult[]> {
  return Promise.all(
    resources.map(async (resource): Promise<FileCheckResult> => {
      const absolutePath = path.join(process.cwd(), 'public', resource.file_url);
      const localExists = existsSync(absolutePath);

      let status: FileCheckResult['status'] = 'missing_local';
      if (localExists) {
        const cached = await findDocumentByChecksum(sha256(await readFile(absolutePath)));
        status = cached && (await countDocumentChunks(cached.id)) > 0 ? 'ok' : 'new';
      }

      return {
        resource_id: resource.id,
        filename: resource.file_name,
        local_path: resource.file_url,
        local_exists: localExists,
        openai_file_id: null,
        openai_exists: false,
        status,
      };
    })
  );
}
