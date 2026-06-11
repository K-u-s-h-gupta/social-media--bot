'use client';

import { useCallback, useState, useRef } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import clsx from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Credential {
  id: string;
  platform: string;
  username: string;
  name: string | null;
  enabled: boolean;
  lastLoginAt: string | null;
  loginError: string | null;
  sessionExpiry: string | null;
  createdAt: string;
}

interface AgentStatus {
  id: string;
  credentialId: string;
  platform: string;
  username: string;
  displayName: string;
  status: 'running' | 'paused' | 'stopped' | 'error';
  lastActionAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  isLive: boolean;
}

interface Deployment {
  id: string;
  prompt: string;
  status: 'running' | 'stopped';
  createdAt: string;
  stoppedAt: string | null;
  agents: AgentStatus[];
}

interface LogEntry {
  agentId: string;
  credentialId: string;
  platform: string;
  username: string;
  deploymentId: string;
  taskName: string;
  action: string;
  status: 'success' | 'error';
  detail: string;
  ts: string;
}

interface Platform {
  id: string;
  label: string;
  auth: string;
  description: string;
}

interface DeploymentAttachment {
  id: string;
  name: string;
  url: string;
  path: string;
  mimeType: string;
  size: number;
  type: 'image' | 'video' | 'audio' | 'document' | 'other';
}

interface PlatformCapabilities {
  platform: string;
  supports: {
    post: boolean;
    search: boolean;
    comment: boolean;
    like: boolean;
    mentions: boolean;
    reply: boolean;
    repost: boolean;
  };
  notes: string[];
}

interface PlannedTaskSummary {
  name: string;
  action: 'post' | 'search_and_comment' | 'search_and_like' | 'reply_mentions';
  intervalMs: number;
  intervalLabel: string;
  topic?: string;
  query?: string;
  targetSubreddit?: string;
}

interface AgentPlanReport {
  credentialId: string;
  platform: string;
  username: string;
  displayName: string;
  source: 'llm' | 'deterministic';
  requestedSubagentCount: number | null;
  tasks: PlannedTaskSummary[];
  warnings: string[];
  validationErrors: string[];
  capabilities: PlatformCapabilities;
}

interface DeployApiResponse {
  deploymentId: string | null;
  started: number;
  failed: string[];
  dryRun: boolean;
  requestedSubagentCount: number | null;
  plannedTasks: AgentPlanReport[];
  warnings: string[];
  validationErrors: string[];
  platformCapabilities: PlatformCapabilities[];
}

// ─── SWR Hooks — each must be its own function ───────────────────────────────

const useCredentials = () => {
  const fetch = useFetch();
  const loader = useCallback(async () => {
    const res = await fetch('/swarm/credentials');
    if (!res.ok) return [];
    return res.json();
  }, [fetch]);
  return useSWR<Credential[]>('swarm-credentials', loader, { refreshInterval: 8000 });
};

const useDeployments = () => {
  const fetch = useFetch();
  const loader = useCallback(async () => {
    const res = await fetch('/swarm/deployments');
    if (!res.ok) return [];
    return res.json();
  }, [fetch]);
  return useSWR<Deployment[]>('swarm-deployments', loader, { refreshInterval: 3000 });
};

const useLogs = () => {
  const fetch = useFetch();
  const loader = useCallback(async () => {
    const res = await fetch('/swarm/logs?count=100');
    if (!res.ok) return [];
    return res.json();
  }, [fetch]);
  return useSWR<LogEntry[]>('swarm-logs', loader, { refreshInterval: 3000 });
};

const usePlatforms = () => {
  const fetch = useFetch();
  const loader = useCallback(async () => {
    const res = await fetch('/swarm/platforms');
    if (!res.ok) return { platforms: [] };
    return res.json();
  }, [fetch]);
  return useSWR<{ platforms: Platform[] }>('swarm-platforms', loader);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLATFORM_ICONS: Record<string, string> = {
  x: 'X',
  bluesky: '☁',
  reddit: '●',
  linkedin: 'in',
  'linkedin-page': '📋',
  instagram: '◈',
  threads: '@',
  facebook: 'f',
  discord: '♦',
  tiktok: '▶',
  pinterest: 'P',
  medium: 'M',
  'dev-to': '</>',
  hashnode: '#',
};

const PLATFORM_BG: Record<string, string> = {
  x: '#000000',
  bluesky: '#0085ff',
  reddit: '#ff4500',
  linkedin: '#0077b5',
  'linkedin-page': '#0077b5',
  instagram: '#e1306c',
  threads: '#101010',
  facebook: '#1877f2',
  discord: '#5865f2',
  tiktok: '#010101',
  pinterest: '#e60023',
  medium: '#292929',
  'dev-to': '#0a0a0a',
  hashnode: '#2962ff',
};

function PlatformBadge({ platform }: { platform: string }) {
  const bg = PLATFORM_BG[platform] || '#444';
  const icon = PLATFORM_ICONS[platform] || '?';
  return (
    <span
      style={{ backgroundColor: bg }}
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium text-white whitespace-nowrap"
    >
      <span className="font-bold">{icon}</span>
      <span className="capitalize">{platform.replace(/-/g, ' ')}</span>
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: '#22c55e',
    paused: '#eab308',
    stopped: '#6b7280',
    error: '#ef4444',
  };
  return (
    <span
      style={{ backgroundColor: colors[status] || '#6b7280' }}
      className={clsx(
        'inline-block w-2 h-2 rounded-full shrink-0',
        status === 'running' && 'animate-pulse',
      )}
    />
  );
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const fixed = value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${fixed} ${units[unitIndex]}`;
}

// ─── Main Component ────────────────────────────────────────────────────────────

type Tab = 'deploy' | 'monitor' | 'logs' | 'accounts';

export function SwarmManager() {
  const [activeTab, setActiveTab] = useState<Tab>('deploy');
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<DeploymentAttachment[]>([]);
  const [selectedCredentials, setSelectedCredentials] = useState<Set<string>>(new Set());
  const [isDeploying, setIsDeploying] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [subagentCount, setSubagentCount] = useState('');
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [deployResult, setDeployResult] = useState<string | null>(null);
  const [deployDetails, setDeployDetails] = useState<DeployApiResponse | null>(null);
  const [expandedDeployments, setExpandedDeployments] = useState<Set<string>>(new Set());

  const fetch = useFetch();
  const { data: credentials = [], mutate: refreshCredentials } = useCredentials();
  const { data: deployments = [], mutate: refreshDeployments } = useDeployments();
  const { data: logs = [] } = useLogs();
  const { data: platformsData } = usePlatforms();

  const credentialsByPlatform = credentials.reduce<Record<string, Credential[]>>((acc, c) => {
    if (!acc[c.platform]) acc[c.platform] = [];
    acc[c.platform].push(c);
    return acc;
  }, {});

  const toggleCredential = (id: string) => {
    setSelectedCredentials((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const uploadAttachments = async (files: FileList | null) => {
    if (!files?.length) return;

    setIsUploadingAttachments(true);
    setDeployResult(null);
    setDeployDetails(null);

    try {
      const uploadResults = await Promise.all(
        Array.from(files).map(async (file) => {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch('/swarm/attachments/upload', {
            method: 'POST',
            body: formData,
          });
          const data = await res.json().catch(() => ({}));

          if (!res.ok || (data as any).error) {
            const errorMessage = (data as any).message || (data as any).error || `HTTP ${res.status}`;
            throw new Error(`${file.name}: ${errorMessage}`);
          }

          return data as DeploymentAttachment;
        }),
      );

      setAttachments((prev) => [...prev, ...uploadResults]);
    } catch (err: any) {
      setDeployResult(`Error: ${err.message}`);
    } finally {
      setIsUploadingAttachments(false);
    }
  };

  const removeAttachment = async (attachment: DeploymentAttachment) => {
    setAttachments((prev) => prev.filter((item) => item.id !== attachment.id));
    setDeployDetails(null);
    try {
      await fetch('/swarm/attachments/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: attachment.path }),
      });
    } catch {
      // Ignore cleanup failures: attachment was already removed from UI state.
    }
  };

  const handleDeploy = async () => {
    if (!prompt.trim() || selectedCredentials.size === 0) return;
    setIsDeploying(true);
    setDeployResult(null);
    setDeployDetails(null);
    const parsedSubagentCount = subagentCount.trim() ? Number(subagentCount) : undefined;
    const normalizedSubagentCount =
      typeof parsedSubagentCount === 'number' && Number.isFinite(parsedSubagentCount)
        ? parsedSubagentCount
        : undefined;
    try {
      const res = await fetch('/swarm/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          credentialIds: Array.from(selectedCredentials),
          dryRun,
          subagentCount: normalizedSubagentCount,
          attachments: attachments.map((attachment) => ({
            name: attachment.name,
            url: attachment.url,
            path: attachment.path,
            mimeType: attachment.mimeType,
            size: attachment.size,
            type: attachment.type,
          })),
        }),
      });
      const payload = await res.json().catch(() => ({} as any));
      if (!res.ok || payload.error) {
        setDeployResult(`Error: ${payload.error || payload.message || `HTTP ${res.status}`}`);
      } else {
        const data = payload as DeployApiResponse;
        setDeployDetails(data);
        if (data.dryRun) {
          const issueCount = data.validationErrors?.length || 0;
          const requestedCount = data.requestedSubagentCount ? `, ${data.requestedSubagentCount} subagent${data.requestedSubagentCount !== 1 ? 's' : ''} requested` : '';
          setDeployResult(
            `Dry run complete: ${data.plannedTasks?.length || 0} account(s) analyzed${issueCount ? `, ${issueCount} issue(s)` : ''}${requestedCount}.`,
          );
          return;
        }
        const hasBlockingErrors =
          data.started === 0 && ((data.validationErrors?.length || 0) > 0 || (data.failed?.length || 0) > 0);
        if (hasBlockingErrors) {
          const message =
            data.validationErrors?.[0] ||
            data.failed?.[0] ||
            'No agents could be started for the selected instruction.';
          setDeployResult(`Error: ${message}`);
          return;
        }
        const failNote = data.failed?.length ? ` (${data.failed.length} failed to start)` : '';
        const requestedCount = data.requestedSubagentCount ? `, ${data.requestedSubagentCount} subagent${data.requestedSubagentCount !== 1 ? 's' : ''} planned` : '';
        setDeployResult(`OK: Deployed ${data.started} agent${data.started !== 1 ? 's' : ''}${failNote}${requestedCount}`);
        setSelectedCredentials(new Set());
        setAttachments([]);
        await refreshDeployments();
        setActiveTab('monitor');
      }
    } catch (err: any) {
      setDeployResult(`Error: ${err.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  const handleStopDeployment = async (id: string) => {
    await fetch(`/swarm/deployments/${id}`, { method: 'DELETE' });
    await refreshDeployments();
  };

  const handlePauseDeployment = async (id: string) => {
    await fetch(`/swarm/deployments/${id}/pause`, { method: 'POST' });
    await refreshDeployments();
  };

  const handleResumeDeployment = async (id: string) => {
    await fetch(`/swarm/deployments/${id}/resume`, { method: 'POST' });
    await refreshDeployments();
  };

  const handleStopAgent = async (deploymentId: string, agentId: string) => {
    await fetch(`/swarm/deployments/${deploymentId}/agents/${agentId}`, { method: 'DELETE' });
    await refreshDeployments();
  };

  const handlePauseAgent = async (deploymentId: string, agentId: string) => {
    await fetch(`/swarm/deployments/${deploymentId}/agents/${agentId}/pause`, { method: 'POST' });
    await refreshDeployments();
  };

  const handleResumeAgent = async (deploymentId: string, agentId: string) => {
    await fetch(`/swarm/deployments/${deploymentId}/agents/${agentId}/resume`, { method: 'POST' });
    await refreshDeployments();
  };

  const activeDeployments = deployments.filter((d) => d.status === 'running');
  const runningAgents = deployments.reduce(
    (n, d) => n + d.agents.filter((a) => a.status === 'running').length,
    0,
  );

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'deploy', label: 'Deploy' },
    { id: 'monitor', label: 'Monitor', badge: runningAgents || undefined },
    { id: 'logs', label: 'Live Logs' },
    { id: 'accounts', label: 'Accounts', badge: credentials.length || undefined },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#0e0e0e', color: '#ffffff' }}>
      {/* Header */}
      <div className="border-b px-6 py-4" style={{ borderColor: '#252525' }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">Swarm Manager</h1>
            <p className="text-sm mt-0.5" style={{ color: '#999' }}>
              {activeDeployments.length} active deployment{activeDeployments.length !== 1 ? 's' : ''} ·{' '}
              {runningAgents} agent{runningAgents !== 1 ? 's' : ''} running
            </p>
          </div>
          {runningAgents > 0 && (
            <span className="flex items-center gap-2 text-sm" style={{ color: '#22c55e' }}>
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b px-6" style={{ borderColor: '#252525' }}>
        <div className="max-w-5xl mx-auto flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors"
              style={{
                borderBottomColor: activeTab === tab.id ? '#612bd3' : 'transparent',
                color: activeTab === tab.id ? '#ffffff' : '#999999',
              }}
            >
              {tab.label}
              {tab.badge !== undefined && (
                <span
                  className="px-1.5 py-0.5 text-xs rounded-full text-white"
                  style={{ background: '#612bd3', lineHeight: '1' }}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Page content */}
      <div className="max-w-5xl mx-auto px-6 py-6">
        {activeTab === 'deploy' && (
          <DeployTab
            prompt={prompt}
            setPrompt={setPrompt}
            credentialsByPlatform={credentialsByPlatform}
            selectedCredentials={selectedCredentials}
            toggleCredential={toggleCredential}
            isDeploying={isDeploying}
            dryRun={dryRun}
            setDryRun={setDryRun}
            subagentCount={subagentCount}
            setSubagentCount={setSubagentCount}
            attachments={attachments}
            isUploadingAttachments={isUploadingAttachments}
            onUploadAttachments={uploadAttachments}
            onRemoveAttachment={removeAttachment}
            deployResult={deployResult}
            deployDetails={deployDetails}
            onDeploy={handleDeploy}
          />
        )}

        {activeTab === 'monitor' && (
          <MonitorTab
            deployments={deployments}
            expandedDeployments={expandedDeployments}
            setExpandedDeployments={setExpandedDeployments}
            onStop={handleStopDeployment}
            onPause={handlePauseDeployment}
            onResume={handleResumeDeployment}
            onStopAgent={handleStopAgent}
            onPauseAgent={handlePauseAgent}
            onResumeAgent={handleResumeAgent}
          />
        )}

        {activeTab === 'logs' && <LogsTab logs={logs} />}

        {activeTab === 'accounts' && (
          <AccountsTab
            credentials={credentials}
            platforms={platformsData?.platforms ?? []}
            onRefresh={refreshCredentials}
          />
        )}
      </div>
    </div>
  );
}

// ─── Deploy Tab ───────────────────────────────────────────────────────────────

function DeployTab({
  prompt,
  setPrompt,
  credentialsByPlatform,
  selectedCredentials,
  toggleCredential,
  isDeploying,
  dryRun,
  setDryRun,
  subagentCount,
  setSubagentCount,
  attachments,
  isUploadingAttachments,
  onUploadAttachments,
  onRemoveAttachment,
  deployResult,
  deployDetails,
  onDeploy,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  credentialsByPlatform: Record<string, Credential[]>;
  selectedCredentials: Set<string>;
  toggleCredential: (id: string) => void;
  isDeploying: boolean;
  dryRun: boolean;
  setDryRun: (value: boolean) => void;
  subagentCount: string;
  setSubagentCount: (value: string) => void;
  attachments: DeploymentAttachment[];
  isUploadingAttachments: boolean;
  onUploadAttachments: (files: FileList | null) => Promise<void>;
  onRemoveAttachment: (attachment: DeploymentAttachment) => Promise<void>;
  deployResult: string | null;
  deployDetails: DeployApiResponse | null;
  onDeploy: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canDeploy =
    prompt.trim().length > 0 &&
    selectedCredentials.size > 0 &&
    !isDeploying &&
    !isUploadingAttachments;
  const hasAccounts = Object.keys(credentialsByPlatform).length > 0;

  return (
    <div className="space-y-6">
      {/* Prompt */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white">
          Describe what your agents should do
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          placeholder="Example: Post about Indian stock market trends every 2 hours. Search for and like fintech posts every 30 minutes. Comment thoughtfully on market analysis posts every 45 minutes. Reply to any mentions with helpful insights."
          className="w-full rounded-lg px-4 py-3 text-sm resize-none focus:outline-none transition-colors text-white"
          style={{
            background: '#1a1919',
            border: '1px solid #252525',
          }}
          onFocus={(e) => (e.target.style.borderColor = '#612bd3')}
          onBlur={(e) => (e.target.style.borderColor = '#252525')}
        />
        <p className="text-xs" style={{ color: '#999' }}>
          AI will interpret this and create a recurring task schedule for each agent (posts, comments, likes, replies).
        </p>
        <label className="mt-3 inline-flex items-center gap-2 text-sm text-white cursor-pointer">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(event) => setDryRun(event.target.checked)}
            className="w-4 h-4 rounded"
            style={{ accentColor: '#612bd3' }}
          />
          Dry run only (plan + validate, do not start agents)
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-white">
            <span className="text-xs uppercase tracking-wide" style={{ color: '#999' }}>
              Subagents
            </span>
            <input
              type="number"
              min={1}
              value={subagentCount}
              onChange={(event) => setSubagentCount(event.target.value)}
              placeholder="Auto"
              className="w-24 rounded-md px-2 py-1.5 text-sm text-white focus:outline-none"
              style={{ background: '#1a1919', border: '1px solid #252525' }}
            />
          </label>
          <span className="text-xs" style={{ color: '#999' }}>
            Leave empty to auto-detect from the prompt.
          </span>
        </div>
      </div>

      {/* Attachments */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-white">
            Attach files (optional)
          </label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingAttachments}
            className="px-3 py-1.5 text-xs rounded-md border transition-colors"
            style={{
              borderColor: '#333',
              color: isUploadingAttachments ? '#777' : '#ccc',
              cursor: isUploadingAttachments ? 'not-allowed' : 'pointer',
            }}
          >
            {isUploadingAttachments ? 'Uploading...' : 'Upload files'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={async (event) => {
              await onUploadAttachments(event.target.files);
              event.currentTarget.value = '';
            }}
          />
        </div>
        <p className="text-xs" style={{ color: '#999' }}>
          Add images, videos, PDFs, docs, sheets, or other files to guide your agent instructions.
        </p>
        {attachments.length > 0 && (
          <div className="space-y-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-3 rounded-md px-3 py-2"
                style={{ background: '#1a1919', border: '1px solid #252525' }}
              >
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-white truncate flex-1 hover:underline"
                  title={attachment.name}
                >
                  {attachment.name}
                </a>
                <span className="text-xs shrink-0" style={{ color: '#999' }}>
                  {attachment.type} | {formatFileSize(attachment.size)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(attachment)}
                  className="text-xs shrink-0"
                  style={{ color: '#ef4444' }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Account selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-white">Select accounts to deploy</label>
          {selectedCredentials.size > 0 && (
            <span className="text-sm font-medium" style={{ color: '#612bd3' }}>
              {selectedCredentials.size} selected
            </span>
          )}
        </div>

        {!hasAccounts ? (
          <div className="rounded-lg p-10 text-center" style={{ border: '1px dashed #333' }}>
            <p className="text-white text-sm">No accounts added yet.</p>
            <p className="text-sm mt-1" style={{ color: '#999' }}>
              Go to the <strong className="text-white">Accounts</strong> tab to add your social media credentials.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(credentialsByPlatform).map(([platform, creds]) => (
              <div
                key={platform}
                className="rounded-lg overflow-hidden"
                style={{ border: '1px solid #252525' }}
              >
                <div className="px-3 py-2" style={{ background: '#1a1919', borderBottom: '1px solid #252525' }}>
                  <PlatformBadge platform={platform} />
                </div>
                <div className="p-2 space-y-1">
                  {creds.map((cred) => (
                    <label
                      key={cred.id}
                      className={clsx(
                        'flex items-center gap-3 px-2 py-2 rounded cursor-pointer transition-colors',
                        !cred.enabled && 'opacity-40 pointer-events-none',
                      )}
                      style={{
                        background: selectedCredentials.has(cred.id)
                          ? 'rgba(97,43,211,0.15)'
                          : 'transparent',
                        border: selectedCredentials.has(cred.id)
                          ? '1px solid rgba(97,43,211,0.4)'
                          : '1px solid transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCredentials.has(cred.id)}
                        onChange={() => toggleCredential(cred.id)}
                        disabled={!cred.enabled}
                        className="w-4 h-4 rounded"
                        style={{ accentColor: '#612bd3' }}
                      />
                      <span className="text-sm text-white truncate flex-1">
                        {cred.name || cred.username}
                      </span>
                      {!cred.enabled && (
                        <span className="text-xs" style={{ color: '#999' }}>off</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deploy button */}
      <div className="flex items-center gap-4 pt-1">
        <button
          onClick={onDeploy}
          disabled={!canDeploy}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-all text-white"
          style={{
            background: canDeploy ? '#612bd3' : '#2a2a2a',
            opacity: canDeploy ? 1 : 0.6,
            cursor: canDeploy ? 'pointer' : 'not-allowed',
          }}
        >
          {isDeploying
            ? dryRun
              ? 'Running dry run...'
              : 'Deploying...'
            : dryRun
              ? `Dry run ${selectedCredentials.size > 0 ? selectedCredentials.size + ' ' : ''}Account${selectedCredentials.size !== 1 ? 's' : ''}`
              : `Deploy ${selectedCredentials.size > 0 ? selectedCredentials.size + ' ' : ''}Agent${selectedCredentials.size !== 1 ? 's' : ''} ->`}
        </button>

        {deployResult && (
          <p className="text-sm" style={{ color: deployResult.startsWith('Error:') ? '#ef4444' : '#22c55e' }}>
            {deployResult}
          </p>
        )}
      </div>

      <DeployDiagnosticsPanel deployDetails={deployDetails} />
    </div>
  );
}

// ─── Monitor Tab ──────────────────────────────────────────────────────────────

function DeployDiagnosticsPanel({ deployDetails }: { deployDetails: DeployApiResponse | null }) {
  if (!deployDetails) return null;

  const hasWarnings = (deployDetails.warnings?.length || 0) > 0;
  const hasValidationErrors = (deployDetails.validationErrors?.length || 0) > 0;

  return (
    <div
      className="space-y-3 rounded-lg p-4"
      style={{ border: '1px solid #252525', background: '#151515' }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white">Planner diagnostics</p>
        <div className="text-right text-xs" style={{ color: '#999' }}>
          <p>Source: {deployDetails.plannedTasks.map((task) => task.source).join(', ') || 'n/a'}</p>
          <p>Requested subagents: {deployDetails.requestedSubagentCount ?? 'auto'}</p>
        </div>
      </div>

      {hasValidationErrors && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#f87171' }}>
            Validation errors
          </p>
          {deployDetails.validationErrors.map((item, index) => (
            <p key={`validation-${index}`} className="text-xs" style={{ color: '#fca5a5' }}>
              {item}
            </p>
          ))}
        </div>
      )}

      {hasWarnings && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#fbbf24' }}>
            Warnings
          </p>
          {deployDetails.warnings.map((item, index) => (
            <p key={`warning-${index}`} className="text-xs" style={{ color: '#fcd34d' }}>
              {item}
            </p>
          ))}
        </div>
      )}

      {deployDetails.plannedTasks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#93c5fd' }}>
            Planned subagents
          </p>
          {deployDetails.plannedTasks.map((plan) => (
            <div
              key={plan.credentialId}
              className="rounded-md p-3 space-y-1"
              style={{ background: '#1a1919', border: '1px solid #262626' }}
            >
              <div className="flex items-center gap-2">
                <PlatformBadge platform={plan.platform} />
                <span className="text-sm text-white">{plan.displayName || plan.username}</span>
              </div>
              {plan.tasks.length === 0 ? (
                <p className="text-xs" style={{ color: '#999' }}>
                  No runnable tasks.
                </p>
              ) : (
                plan.tasks.map((task) => (
                  <p key={`${plan.credentialId}-${task.name}`} className="text-xs" style={{ color: '#d4d4d4' }}>
                    {task.action} every {task.intervalLabel}
                    {task.query ? ` | query: ${task.query}` : ''}
                    {task.topic ? ` | topic: ${task.topic}` : ''}
                    {task.targetSubreddit ? ` | r/${task.targetSubreddit}` : ''}
                  </p>
                ))
              )}
            </div>
          ))}
        </div>
      )}

      <details>
        <summary className="text-xs cursor-pointer" style={{ color: '#999' }}>
          Platform capability report ({deployDetails.platformCapabilities.length} platforms)
        </summary>
        <div className="mt-2 space-y-1">
          {deployDetails.platformCapabilities.map((capability) => {
            const active = Object.entries(capability.supports)
              .filter(([, value]) => value)
              .map(([key]) => key)
              .join(', ');
            return (
              <p key={capability.platform} className="text-xs" style={{ color: '#bdbdbd' }}>
                {capability.platform}: {active || 'none'}
              </p>
            );
          })}
        </div>
      </details>
    </div>
  );
}
function MonitorTab({
  deployments,
  expandedDeployments,
  setExpandedDeployments,
  onStop,
  onPause,
  onResume,
  onStopAgent,
  onPauseAgent,
  onResumeAgent,
}: {
  deployments: Deployment[];
  expandedDeployments: Set<string>;
  setExpandedDeployments: React.Dispatch<React.SetStateAction<Set<string>>>;
  onStop: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onStopAgent: (deploymentId: string, agentId: string) => void;
  onPauseAgent: (deploymentId: string, agentId: string) => void;
  onResumeAgent: (deploymentId: string, agentId: string) => void;
}) {
  const toggle = (id: string) => {
    setExpandedDeployments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (deployments.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-white">No deployments yet.</p>
        <p className="text-sm mt-1" style={{ color: '#999' }}>Use the Deploy tab to launch agents.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {deployments.map((dep) => {
        const isExpanded = expandedDeployments.has(dep.id);
        const running = dep.agents.filter((a) => a.status === 'running').length;
        const paused = dep.agents.filter((a) => a.status === 'paused').length;
        const isActive = dep.status === 'running';
        const allPaused = paused > 0 && running === 0 && isActive;

        return (
          <div key={dep.id} className="rounded-lg overflow-hidden" style={{ border: '1px solid #252525' }}>
            {/* Header row */}
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
              style={{ background: isExpanded ? '#1a1919' : 'transparent' }}
              onClick={() => toggle(dep.id)}
            >
              <StatusDot status={isActive ? 'running' : 'stopped'} />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {dep.prompt.length > 90 ? dep.prompt.slice(0, 90) + '…' : dep.prompt}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#999' }}>
                  {dep.agents.length} agent{dep.agents.length !== 1 ? 's' : ''}
                  {running > 0 && ` · ${running} running`}
                  {paused > 0 && ` · ${paused} paused`}
                  {' · '}started {timeAgo(dep.createdAt)}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                {isActive && (
                  <>
                    {allPaused ? (
                      <button
                        onClick={() => onResume(dep.id)}
                        className="text-xs px-2 py-1 rounded transition-colors"
                        style={{ border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e' }}
                      >
                        Resume all
                      </button>
                    ) : (
                      <button
                        onClick={() => onPause(dep.id)}
                        className="text-xs px-2 py-1 rounded transition-colors"
                        style={{ border: '1px solid #333', color: '#ccc' }}
                      >
                        Pause all
                      </button>
                    )}
                    <button
                      onClick={() => onStop(dep.id)}
                      className="text-xs px-2 py-1 rounded transition-colors"
                      style={{ border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}
                    >
                      Stop
                    </button>
                  </>
                )}
                {!isActive && (
                  <span className="text-xs px-2 py-1 rounded" style={{ background: '#1a1919', color: '#999' }}>
                    Stopped {timeAgo(dep.stoppedAt)}
                  </span>
                )}
                <span
                  className="text-xs transition-transform duration-200"
                  style={{
                    color: '#999',
                    display: 'inline-block',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                >
                  ▼
                </span>
              </div>
            </div>

            {/* Agent rows */}
            {isExpanded && dep.agents.length > 0 && (
              <div style={{ borderTop: '1px solid #252525' }}>
                {dep.agents.map((agent, i) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-3 px-5 py-2.5 transition-colors"
                    style={{
                      borderTop: i > 0 ? '1px solid #1f1f1f' : 'none',
                    }}
                  >
                    <StatusDot status={agent.status} />
                    <PlatformBadge platform={agent.platform} />
                    <span className="text-sm text-white flex-1 min-w-0 truncate">
                      {agent.displayName}
                    </span>
                    <span className="text-xs shrink-0" style={{ color: '#999' }}>
                      {agent.lastActionAt ? `Active ${timeAgo(agent.lastActionAt)}` : 'Waiting…'}
                    </span>
                    {agent.errorMessage && (
                      <span
                        className="text-xs truncate max-w-40 shrink-0"
                        style={{ color: '#ef4444' }}
                        title={agent.errorMessage}
                      >
                        ⚠ {agent.errorMessage.slice(0, 30)}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {agent.status === 'running' && (
                        <>
                          <button
                            onClick={() => onPauseAgent(dep.id, agent.id)}
                            className="text-xs px-2 py-0.5 rounded transition-colors"
                            style={{ border: '1px solid #333', color: '#ccc' }}
                          >
                            Pause
                          </button>
                          <button
                            onClick={() => onStopAgent(dep.id, agent.id)}
                            className="text-xs px-2 py-0.5 rounded transition-colors"
                            style={{ border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}
                          >
                            Stop
                          </button>
                        </>
                      )}
                      {agent.status === 'paused' && (
                        <button
                          onClick={() => onResumeAgent(dep.id, agent.id)}
                          className="text-xs px-2 py-0.5 rounded transition-colors"
                          style={{ border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e' }}
                        >
                          Resume
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Logs Tab ─────────────────────────────────────────────────────────────────

function LogsTab({ logs }: { logs: LogEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (logs.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-white">No logs yet.</p>
        <p className="text-sm mt-1" style={{ color: '#999' }}>Deploy agents to see live activity here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: '#999' }}>{logs.length} recent entries</span>
        <span className="flex items-center gap-1.5 text-xs" style={{ color: '#22c55e' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Auto-refreshing
        </span>
      </div>

      <div ref={containerRef} className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
        {logs.map((log, i) => (
          <div
            key={i}
            className="flex items-start gap-2.5 px-3 py-2 rounded text-xs"
            style={{
              background: log.status === 'success' ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
              border: log.status === 'success'
                ? '1px solid rgba(34,197,94,0.15)'
                : '1px solid rgba(239,68,68,0.15)',
            }}
          >
            <span className="font-mono pt-px shrink-0" style={{ color: '#666' }}>
              {new Date(log.ts).toLocaleTimeString()}
            </span>
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
              style={{ background: log.status === 'success' ? '#22c55e' : '#ef4444' }}
            />
            <span className="shrink-0" style={{ color: '#aaa' }}>
              {PLATFORM_ICONS[log.platform] || '?'}{' '}
              <span className="text-white font-medium">{log.username}</span>
            </span>
            <span className="font-mono shrink-0" style={{ color: '#666' }}>
              [{log.taskName}]
            </span>
            <span
              className="flex-1 min-w-0 break-all"
              style={{ color: log.status === 'success' ? '#86efac' : '#fca5a5' }}
            >
              {log.detail}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Accounts Tab ─────────────────────────────────────────────────────────────

function AccountsTab({
  credentials,
  platforms,
  onRefresh,
}: {
  credentials: Credential[];
  platforms: Platform[];
  onRefresh: () => void;
}) {
  const fetch = useFetch();
  const [showAdd, setShowAdd] = useState(false);
  const [platform, setPlatform] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');

  const resetForm = () => {
    setPlatform('');
    setUsername('');
    setPassword('');
    setDisplayName('');
    setAddError(null);
  };

  const handleAdd = async () => {
    if (!platform || !username || !password) {
      setAddError('Platform, username, and password are required.');
      return;
    }
    setIsAdding(true);
    setAddError(null);
    try {
      const res = await fetch('/swarm/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, username, password, name: displayName.trim() || undefined }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as any).message || `HTTP ${res.status}`);
      }
      resetForm();
      setShowAdd(false);
      onRefresh();
    } catch (err: any) {
      setAddError(err.message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this account? Any active agents using it will be stopped.')) return;
    await fetch(`/swarm/credentials/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await fetch(`/swarm/credentials/${id}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    onRefresh();
  };

  const handleRename = async (id: string) => {
    await fetch(`/swarm/credentials/${id}/name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editNameValue }),
    });
    setEditingName(null);
    onRefresh();
  };

  const selectedPlatform = platforms.find((p) => p.id === platform);

  const inputStyle = {
    background: '#1a1919',
    border: '1px solid #252525',
    color: '#ffffff',
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-white">
          {credentials.length} account{credentials.length !== 1 ? 's' : ''}
        </h2>
        <button
          onClick={() => { setShowAdd(!showAdd); if (!showAdd) resetForm(); }}
          className="px-4 py-2 text-sm rounded-lg text-white font-medium transition-opacity hover:opacity-90"
          style={{ background: '#612bd3' }}
        >
          + Add Account
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-lg p-5 space-y-4" style={{ background: '#1a1919', border: '1px solid #252525' }}>
          <h3 className="text-sm font-semibold text-white">Add social media account</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs mb-1" style={{ color: '#999' }}>Platform</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ ...inputStyle }}
              >
                <option value="">Select platform…</option>
                {platforms.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              {selectedPlatform && (
                <p className="text-xs mt-1" style={{ color: '#999' }}>{selectedPlatform.description}</p>
              )}
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: '#999' }}>
                {platform === 'bluesky' ? 'Handle' : 'Username / Email'}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={platform === 'bluesky' ? 'you.bsky.social' : 'username or email'}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ ...inputStyle }}
              />
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: '#999' }}>
                {platform === 'dev-to' || platform === 'hashnode'
                  ? 'API Token'
                  : platform === 'bluesky'
                  ? 'App Password'
                  : 'Password'}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ ...inputStyle }}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs mb-1" style={{ color: '#999' }}>
                Display name <span style={{ color: '#555' }}>(optional)</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="My X Account"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ ...inputStyle }}
              />
            </div>
          </div>

          {addError && <p className="text-sm" style={{ color: '#ef4444' }}>{addError}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAdd}
              disabled={!platform || !username || !password || isAdding}
              className="px-4 py-2 text-sm rounded-lg text-white font-medium transition-opacity"
              style={{
                background: '#612bd3',
                opacity: (!platform || !username || !password || isAdding) ? 0.4 : 1,
                cursor: (!platform || !username || !password || isAdding) ? 'not-allowed' : 'pointer',
              }}
            >
              {isAdding ? 'Adding…' : 'Add Account'}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 text-sm rounded-lg transition-colors"
              style={{ border: '1px solid #333', color: '#ccc' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Credentials list */}
      {credentials.length === 0 && !showAdd ? (
        <div className="text-center py-12 rounded-lg" style={{ border: '1px dashed #333' }}>
          <p className="text-white">No accounts yet.</p>
          <p className="text-sm mt-1" style={{ color: '#999' }}>Add your first account to get started.</p>
        </div>
      ) : (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #252525' }}>
          {credentials.map((cred, i) => (
            <div
              key={cred.id}
              className="flex items-center gap-3 px-4 py-3 transition-colors"
              style={{
                borderTop: i > 0 ? '1px solid #1f1f1f' : 'none',
                opacity: cred.enabled ? 1 : 0.5,
              }}
            >
              <PlatformBadge platform={cred.platform} />

              <div className="flex-1 min-w-0">
                {editingName === cred.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRename(cred.id)}
                      className="rounded px-2 py-0.5 text-sm text-white focus:outline-none"
                      style={{ background: '#252525', border: '1px solid #612bd3' }}
                      autoFocus
                    />
                    <button
                      onClick={() => handleRename(cred.id)}
                      className="text-xs font-medium"
                      style={{ color: '#22c55e' }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingName(null)}
                      className="text-xs"
                      style={{ color: '#999' }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-white truncate">
                      {cred.name || cred.username}
                    </span>
                    {cred.name && (
                      <span className="text-xs truncate" style={{ color: '#999' }}>({cred.username})</span>
                    )}
                    <button
                      onClick={() => { setEditingName(cred.id); setEditNameValue(cred.name || cred.username); }}
                      className="text-xs shrink-0 transition-colors"
                      style={{ color: '#555' }}
                      title="Rename"
                    >
                      ✏
                    </button>
                  </div>
                )}
                {cred.loginError && (
                  <p className="text-xs mt-0.5" style={{ color: '#ef4444' }}>⚠ {cred.loginError}</p>
                )}
                {!cred.loginError && cred.lastLoginAt && (
                  <p className="text-xs mt-0.5" style={{ color: '#999' }}>
                    Last session {timeAgo(cred.lastLoginAt)}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleToggle(cred.id, !cred.enabled)}
                  className="text-xs px-2 py-1 rounded transition-colors"
                  style={{
                    border: cred.enabled
                      ? '1px solid #333'
                      : '1px solid rgba(34,197,94,0.4)',
                    color: cred.enabled ? '#ccc' : '#22c55e',
                  }}
                >
                  {cred.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={() => handleDelete(cred.id)}
                  className="text-xs px-2 py-1 rounded transition-colors"
                  style={{ border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


