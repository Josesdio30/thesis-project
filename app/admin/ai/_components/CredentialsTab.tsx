'use client';

import { useEffect, useState } from 'react';

interface CredentialInfo {
  configured: boolean;
  source: 'database' | 'env' | 'none';
  key_hint: string | null;
  updated_at: string | null;
}

export default function CredentialsTab() {
  const [info, setInfo] = useState<CredentialInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/admin/credentials')
      .then(res => res.json())
      .then(data => {
        if (data.success) setInfo(data.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'API key updated' });
        setApiKey('');
        load();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (
      !confirm(
        'Remove the stored API key? AI features will fall back to the OPENAI_API_KEY environment variable.'
      )
    )
      return;
    setResetting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/credentials', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Reset to environment default' });
        load();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to reset' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to reset' });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <p className="text-gray-500 text-sm mb-4">
        The OpenAI API key used for AI grading and plagiarism detection. Stored encrypted; falls
        back to the <code>OPENAI_API_KEY</code> environment variable when no key is stored.
      </p>

      {message && (
        <div
          className={`mb-4 px-4 py-2 rounded-md text-sm ${
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 space-y-5">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <p className="text-sm font-medium text-gray-700">OpenAI</p>
            <p className="text-xs text-gray-400">
              {loading
                ? 'Loading…'
                : info?.configured
                  ? `Current key: ${info.key_hint}`
                  : 'No key configured'}
            </p>
          </div>
          {!loading && info && (
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                info.source === 'database'
                  ? 'bg-green-100 text-green-800'
                  : info.source === 'env'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-600'
              }`}
            >
              {info.source === 'database'
                ? 'Managed'
                : info.source === 'env'
                  ? 'From environment'
                  : 'Not set'}
            </span>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-…"
              autoComplete="off"
              className="w-full border border-gray-300 rounded-md px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              The key is encrypted before storage and never displayed again.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || apiKey.trim().length < 8}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Update Key'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={resetting || info?.source !== 'database'}
              title={
                info?.source === 'database'
                  ? 'Remove the stored key and use the environment variable'
                  : 'No stored key to reset'
              }
              className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {resetting ? 'Resetting…' : 'Reset to environment key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
