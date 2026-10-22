import { insertAuditLog } from '@/lib/db2/admin-repo';

export interface AuditEvent {
  actorUserId: string | null;
  actorName?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Record an audit event. Failures are swallowed and logged — auditing must
 * never break the action it is recording.
 */
export async function logAudit(event: AuditEvent): Promise<void> {
  try {
    await insertAuditLog({
      actor_user_id: event.actorUserId,
      actor_name: event.actorName ?? null,
      action: event.action,
      entity_type: event.entityType ?? null,
      entity_id: event.entityId ?? null,
      details: event.details ?? {},
    });
  } catch (error) {
    console.error('[audit] failed to record event', event.action, error);
  }
}
