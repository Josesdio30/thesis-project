import { createHash } from 'node:crypto';

/** Content identity for `rag_documents`. Shared by ingestion and the pre-flight
 *  file check so both agree on what "already indexed" means. */
export const sha256 = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');
