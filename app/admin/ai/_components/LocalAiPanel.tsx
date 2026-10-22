'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import type { LocalAiConfig, LocalAiConfigSources } from '@/lib/ai-local/config';

export interface LocalConfigData {
  provider: 'openai' | 'local';
  effective: LocalAiConfig;
  sources: LocalAiConfigSources;
  envVars: Record<keyof LocalAiConfig, string>;
  updated_at: string | null;
  warnings?: string[];
}

interface LocalHealth {
  ready: boolean;
  reachable: boolean;
  baseUrl: string;
  chatModel: string;
  embedModel: string;
  embedDims: number;
  installedModels: string[];
  missingModels: string[];
  error?: string;
  remediation?: string[];
}

type FieldName = 'base_url' | 'chat_model' | 'num_ctx' | 'num_predict' | 'keep_alive' | 'retrieval_top_k';

const FIELDS: { name: FieldName; key: keyof LocalAiConfig; label: string; numeric: boolean; hint: string }[] = [
  {
    name: 'base_url',
    key: 'baseUrl',
    label: 'Ollama Base URL',
    numeric: false,
    hint: 'http(s) URL of the Ollama server',
  },
  {
    name: 'chat_model',
    key: 'chatModel',
    label: 'Chat Model',
    numeric: false,
    hint: 'Ollama tag, e.g. qwen2.5:14b-instruct-q4_K_M',
  },
  { name: 'num_ctx', key: 'numCtx', label: 'Context Window (num_ctx)', numeric: true, hint: '512 – 131072 tokens' },
  {
    name: 'num_predict',
    key: 'numPredict',
    label: 'Max Output (num_predict)',
    numeric: true,
    hint: '64 – 32768, below num_ctx',
  },
  { name: 'keep_alive', key: 'keepAlive', label: 'Keep Alive', numeric: false, hint: '-1, 0, or e.g. 30s, 30m, 2h' },
  { name: 'retrieval_top_k', key: 'retrievalTopK', label: 'Retrieval Top-K', numeric: true, hint: '1 – 20 chunks' },
];

type FormState = Record<FieldName, string>;

function toForm(config: LocalAiConfig): FormState {
  return Object.fromEntries(FIELDS.map(f => [f.name, String(config[f.key])])) as FormState;
}

const inputClass =
  'w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500';

function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      .writeText(command)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };
  return (
    <div className="flex items-center justify-between gap-2 bg-gray-900 text-gray-100 rounded-md px-3 py-2">
      <code className="font-mono text-sm break-all">{command}</code>
      <button
        type="button"
        onClick={copy}
        title="Copy command"
        className="flex items-center gap-1 text-xs text-gray-300 hover:text-white shrink-0"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function HealthCard() {
  const [health, setHealth] = useState<LocalHealth | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(() => {
    setChecking(true);
    setError(null);
    fetch('/api/admin/ai/local-health')
      .then(res => res.json())
      .then(data => {
        if (data.success) setHealth(data.data);
        else setError(data.error || 'Failed to check Ollama');
      })
      .catch(() => setError('Failed to check Ollama'))
      .finally(() => setChecking(false));
  }, []);

  useEffect(check, [check]);

  const status = !health
    ? null
    : health.ready
      ? { label: 'Ready', className: 'bg-green-100 text-green-800' }
      : health.reachable
        ? { label: 'Models missing', className: 'bg-yellow-100 text-yellow-800' }
        : { label: 'Unreachable', className: 'bg-red-100 text-red-800' };

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-4">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <p className="text-sm font-medium text-gray-700">Ollama Health</p>
          <p className="text-xs text-gray-400">{health ? health.baseUrl : checking ? 'Checking…' : 'Unknown'}</p>
        </div>
        <div className="flex items-center gap-3">
          {status && <span className={`text-xs px-2 py-1 rounded-full ${status.className}`}>{status.label}</span>}
          <button
            type="button"
            onClick={check}
            disabled={checking}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking…' : 'Re-check'}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {health && (
        <>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-gray-500">Chat model</dt>
              <dd className="font-mono text-gray-800">{health.chatModel}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Embedding model</dt>
              <dd className="font-mono text-gray-800">
                {health.embedModel} <span className="text-gray-400">({health.embedDims} dims)</span>
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-gray-500">Installed models</dt>
              <dd className="font-mono text-gray-800 break-words">
                {health.installedModels.length > 0 ? health.installedModels.join(', ') : 'None reported'}
              </dd>
            </div>
            {health.missingModels.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-gray-500">Missing models</dt>
                <dd className="font-mono text-red-700">{health.missingModels.join(', ')}</dd>
              </div>
            )}
          </dl>

          {health.error && <p className="text-xs text-red-600">Error: {health.error}</p>}

          {health.remediation && health.remediation.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Run on the Ollama host to fix:</p>
              {health.remediation.map(command => (
                <CopyableCommand key={command} command={command} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function LocalAiPanel({ initial }: { initial: LocalConfigData }) {
  const [data, setData] = useState<LocalConfigData>(initial);
  const [form, setForm] = useState<FormState>(() => toForm(initial.effective));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  // Remounting the health card is the simplest way to re-check after a save.
  const [healthKey, setHealthKey] = useState(0);

  const isEnv = (key: keyof LocalAiConfig) => data.sources[key] === 'env';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch: Record<string, string | number> = {};
    for (const field of FIELDS) {
      if (isEnv(field.key) || form[field.name] === String(data.effective[field.key])) continue;
      patch[field.name] = field.numeric ? Number(form[field.name]) : form[field.name];
    }
    if (Object.keys(patch).length === 0) {
      setMessage({ type: 'error', text: 'No changes to save' });
      return;
    }

    setSaving(true);
    setMessage(null);
    setWarnings([]);
    try {
      const res = await fetch('/api/admin/ai/local-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (body.success) {
        setData(body.data);
        setForm(toForm(body.data.effective));
        setWarnings(body.data.warnings ?? []);
        setMessage({ type: 'success', text: 'Local AI configuration saved' });
        setHealthKey(k => k + 1);
      } else {
        setMessage({ type: 'error', text: body.error || 'Failed to save' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <HealthCard key={healthKey} />

      {message && (
        <div
          className={`px-4 py-2 rounded-md text-sm ${
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}
      {warnings.length > 0 && (
        <ul className="px-4 py-2 rounded-md text-sm bg-yellow-100 text-yellow-800 list-disc list-inside space-y-1">
          {warnings.map(warning => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSave} className="bg-white rounded-lg shadow p-6 space-y-5">
        <div className="border-b pb-4">
          <p className="text-sm font-medium text-gray-700">Local Model Settings</p>
          <p className="text-xs text-gray-400">Environment variables take precedence over values saved here.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {FIELDS.map(field => {
            const env = isEnv(field.key);
            return (
              <div key={field.name}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                <input
                  type={field.numeric ? 'number' : 'text'}
                  value={form[field.name]}
                  onChange={e => setForm({ ...form, [field.name]: e.target.value })}
                  disabled={env}
                  className={`${inputClass} ${field.numeric ? '' : 'font-mono text-sm'}`}
                  required
                />
                <p className={`text-xs mt-1 ${env ? 'text-yellow-700' : 'text-gray-400'}`}>
                  {env ? `Set by ${data.envVars[field.key]}` : field.hint}
                </p>
              </div>
            );
          })}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Embedding Model</label>
            <input
              type="text"
              value={data.effective.embedModel}
              disabled
              className={`${inputClass} font-mono text-sm`}
            />
            <p className="text-xs text-gray-400 mt-1">
              {isEnv('embedModel') ? `Set by ${data.envVars.embedModel}. ` : ''}Read-only: changing it requires a
              migration and a full re-index.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Embedding Dimensions</label>
            <input type="number" value={data.effective.embedDims} disabled className={inputClass} />
            <p className="text-xs text-gray-400 mt-1">
              {isEnv('embedDims') ? `Set by ${data.envVars.embedDims}. ` : ''}Fixed at the VECTOR(1024) columns.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {data.updated_at ? `Last updated ${new Date(data.updated_at).toLocaleString()}` : 'Not yet saved'}
          </span>
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Local Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
