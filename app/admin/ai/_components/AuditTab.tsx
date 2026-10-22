'use client';

import { useCallback, useEffect, useState } from 'react';

interface AuditLog {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

interface TokenUsage {
  teacher_id: string;
  teacher_name: string | null;
  calls: number;
  total_tokens: number;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'ai.grading.call', label: 'AI grading call' },
  { value: 'ai_config.updated', label: 'AI config updated' },
  { value: 'credential.updated', label: 'Credential updated' },
  { value: 'credential.reset', label: 'Credential reset' },
  { value: 'access_control.updated', label: 'Access control updated' },
];

export default function AuditTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (action) params.set('action', action);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    fetch(`/api/admin/audit-logs?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setLogs(data.data.logs);
          setTokenUsage(data.data.tokenUsageByTeacher);
          setPagination(data.data.pagination);
        }
      })
      .finally(() => setLoading(false));
  }, [page, action, from, to]);

  useEffect(load, [load]);

  return (
    <div>
      <p className="text-gray-500 text-sm mb-4">
        System audit trail and per-teacher AI token usage.
      </p>

      {/* Token usage per teacher */}
      <div className="bg-white rounded-lg shadow mb-6 overflow-hidden">
        <h2 className="text-base font-semibold px-6 py-3 border-b bg-gray-50">
          Token Usage by Teacher
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="px-6 py-2 font-medium">Teacher</th>
                <th className="px-4 py-2 font-medium text-right">Grading Calls</th>
                <th className="px-4 py-2 font-medium text-right">Total Tokens</th>
              </tr>
            </thead>
            <tbody>
              {tokenUsage.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-center text-gray-400">
                    No grading activity yet
                  </td>
                </tr>
              ) : (
                tokenUsage.map(t => (
                  <tr key={t.teacher_id} className="border-b last:border-0">
                    <td className="px-6 py-3">{t.teacher_name || `User #${t.teacher_id}`}</td>
                    <td className="px-4 py-3 text-right">{t.calls.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {t.total_tokens.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Action</label>
          <select
            value={action}
            onChange={e => {
              setPage(1);
              setAction(e.target.value);
            }}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
          >
            {ACTION_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={e => {
              setPage(1);
              setFrom(e.target.value);
            }}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={e => {
              setPage(1);
              setTo(e.target.value);
            }}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Audit log table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-4 py-2 font-medium">Actor</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    Loading…
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    No audit entries
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="border-b last:border-0 align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {log.actor_name || log.actor_user_id || 'System'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs whitespace-nowrap">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs text-gray-500 break-all">
                        {JSON.stringify(log.details)}
                      </code>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
            <span className="text-gray-500">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} entries)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
                className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
