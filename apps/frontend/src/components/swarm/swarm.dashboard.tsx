'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import clsx from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentStatus {
  platform: string;
  running: boolean;
  paused: boolean;
  counters: { posts: number; comments: number; engagements: number; errors: number };
  lastAction: string;
}

interface SwarmStatus {
  status: string;
  config: any;
  logs: string[];
  agents: AgentStatus[];
}

interface Credential {
  id: string;
  platform: string;
  username: string;
  enabled: boolean;
  lastLoginAt: string | null;
  loginError: string | null;
  sessionExpiry: string | null;
  createdAt: string;
}

interface SubAgentInfo {
  name: string;
  running: boolean;
  paused: boolean;
}

interface CommanderStatus {
  key: string;
  running: boolean;
  sharedState: {
    trendingCount: number;
    actionQueueLength: number;
    recentPosts: number;
    stats: Record<string, { runs: number; successes: number; errors: number }>;
  };
  subAgents: SubAgentInfo[];
}

// ─── SWR Hooks (each in its own hook per rules-of-hooks) ─────────────────────

const useSwarmStatus = () => {
  const fetch = useFetch();
  const loader = useCallback(async () => {
    const res = await fetch('/swarm');
    return res.json();
  }, [fetch]);
  return useSWR<SwarmStatus>('swarm-status', loader, { refreshInterval: 5000 });
};

const useSwarmPlatforms = () => {
  const fetch = useFetch();
  const loader = useCallback(async () => {
    const res = await fetch('/swarm/platforms');
    return res.json();
  }, [fetch]);
  return useSWR('swarm-platforms', loader, { revalidateOnFocus: false, revalidateIfStale: false });
};

const useCredentials = () => {
  const fetch = useFetch();
  const loader = useCallback(async () => {
    const res = await fetch('/swarm/credentials');
    return res.json();
  }, [fetch]);
  return useSWR<Credential[]>('swarm-credentials', loader, { refreshInterval: 10000 });
};

const useCommanderStatuses = () => {
  const fetch = useFetch();
  const loader = useCallback(async () => {
    const res = await fetch('/swarm/commanders');
    return res.json();
  }, [fetch]);
  return useSWR<CommanderStatus[]>('swarm-commanders', loader, { refreshInterval: 5000 });
};

// ─── Small Components ─────────────────────────────────────────────────────────

const StatusBadge = ({ status }: { status: string }) => {
  const colorMap: Record<string, string> = {
    running: 'bg-green-500/20 text-green-400 border-green-500/30',
    paused: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    stopped: 'bg-red-500/20 text-red-400 border-red-500/30',
    enabled: 'bg-green-500/20 text-green-400 border-green-500/30',
    disabled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return (
    <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-medium border', colorMap[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30')}>
      {status.toUpperCase()}
    </span>
  );
};

const PlatformIcon: Record<string, string> = {
  x: '𝕏',
  twitter: '𝕏',
  linkedin: 'in',
  'linkedin-page': 'in',
  reddit: 'r/',
  instagram: '📷',
  facebook: 'fb',
  threads: '𝕋',
};

// ─── Credential Card ─────────────────────────────────────────────────────────

const CredentialCard = ({
  cred,
  onToggle,
  onDelete,
  onStartCommander,
}: {
  cred: Credential;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onStartCommander: (id: string) => void;
}) => {
  const status = cred.loginError ? 'error' : cred.enabled ? 'enabled' : 'disabled';
  return (
    <div className="bg-secondary rounded-xl border border-tableBorder p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-bold">
            {PlatformIcon[cred.platform] || cred.platform[0].toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-semibold capitalize">{cred.platform.replace('-', ' ')}</div>
            <div className="text-xs text-gray-400">@{cred.username}</div>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {cred.loginError && (
        <div className="text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1 truncate" title={cred.loginError}>
          ⚠ {cred.loginError}
        </div>
      )}

      {cred.sessionExpiry && !cred.loginError && (
        <div className="text-[10px] text-gray-500">
          Session expires: {new Date(cred.sessionExpiry).toLocaleDateString()}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button onClick={() => onStartCommander(cred.id)} className="flex-1 text-xs py-1.5">
          Launch Commander
        </Button>
        <button
          onClick={() => onToggle(cred.id, !cred.enabled)}
          className="px-3 py-1.5 rounded-lg text-xs bg-primary border border-tableBorder hover:border-blue-500 transition-colors"
        >
          {cred.enabled ? 'Disable' : 'Enable'}
        </button>
        <button
          onClick={() => onDelete(cred.id)}
          className="px-3 py-1.5 rounded-lg text-xs bg-primary border border-tableBorder hover:border-red-500 hover:text-red-400 transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

// ─── Commander Card ───────────────────────────────────────────────────────────

const CommanderCard = ({
  commander,
  onPause,
  onResume,
  onStop,
}: {
  commander: CommanderStatus;
  onPause: (key: string) => void;
  onResume: (key: string) => void;
  onStop: (key: string) => void;
}) => {
  const credId = commander.key.split(':').slice(1).join(':');
  const totalSuccesses = Object.values(commander.sharedState.stats).reduce((s, v) => s + v.successes, 0);
  const totalErrors   = Object.values(commander.sharedState.stats).reduce((s, v) => s + v.errors, 0);

  return (
    <div className="bg-secondary rounded-xl border border-tableBorder p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Commander</div>
          <div className="text-[10px] text-gray-400 font-mono">{credId.slice(0, 20)}…</div>
        </div>
        <StatusBadge status={commander.running ? 'running' : 'stopped'} />
      </div>

      {/* Sub-agent status dots */}
      <div className="flex gap-2 flex-wrap">
        {commander.subAgents.map((sa) => (
          <div key={sa.name} className="flex items-center gap-1">
            <div className={clsx('w-2 h-2 rounded-full', sa.running && !sa.paused ? 'bg-green-400' : sa.paused ? 'bg-yellow-400' : 'bg-gray-600')} />
            <span className="text-[10px] text-gray-400">{sa.name}</span>
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-bold text-green-400">{totalSuccesses}</div>
          <div className="text-[10px] text-gray-400">Actions OK</div>
        </div>
        <div>
          <div className="text-lg font-bold text-red-400">{totalErrors}</div>
          <div className="text-[10px] text-gray-400">Errors</div>
        </div>
        <div>
          <div className="text-lg font-bold">{commander.sharedState.trendingCount}</div>
          <div className="text-[10px] text-gray-400">Trends</div>
        </div>
      </div>

      {/* Per-agent micro stats */}
      {Object.entries(commander.sharedState.stats).length > 0 && (
        <div className="grid grid-cols-5 gap-1">
          {Object.entries(commander.sharedState.stats).map(([name, s]) => (
            <div key={name} className="bg-primary rounded px-1 py-1 text-center">
              <div className="text-[9px] text-gray-500 mb-0.5">{name}</div>
              <div className="text-[10px] font-bold">{s.successes}<span className="text-red-400">/{s.errors}</span></div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        {commander.running && (
          <button onClick={() => onPause(credId)} className="flex-1 px-2 py-1.5 rounded-lg text-xs bg-primary border border-tableBorder hover:border-yellow-500 transition-colors">
            Pause
          </button>
        )}
        {!commander.running && (
          <button onClick={() => onResume(credId)} className="flex-1 px-2 py-1.5 rounded-lg text-xs bg-primary border border-tableBorder hover:border-green-500 transition-colors">
            Resume
          </button>
        )}
        <button onClick={() => onStop(credId)} className="flex-1 px-2 py-1.5 rounded-lg text-xs bg-primary border border-tableBorder hover:border-red-500 hover:text-red-400 transition-colors">
          Stop
        </button>
      </div>
    </div>
  );
};

// ─── Commander Launch Modal ───────────────────────────────────────────────────

const LaunchCommanderModal = ({
  credentialId,
  onClose,
  onLaunch,
}: {
  credentialId: string;
  onClose: () => void;
  onLaunch: (credId: string, cfg: any) => void;
}) => {
  const [niche, setNiche] = useState('technology');
  const [tone, setTone] = useState('professional');
  const [hashtags, setHashtags] = useState('#tech #ai #startup');
  const [loading, setLoading] = useState(false);

  const handleLaunch = async () => {
    setLoading(true);
    await onLaunch(credentialId, {
      niche,
      tone,
      hashtags: hashtags.split(/[\s,]+/).filter(Boolean),
    });
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-secondary rounded-2xl border border-tableBorder p-6 w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">Launch Commander</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-gray-400">
          The Commander will fork 5 sub-agents (Scout, Poster, Commenter, Engager, Responder) that all share one login session.
        </p>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Niche / Topic</label>
            <input
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="e.g. fintech, AI tools, startup growth"
              className="w-full px-3 py-2 rounded-lg bg-primary border border-tableBorder text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Tone</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-primary border border-tableBorder text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="professional">Professional</option>
              <option value="casual">Casual & Friendly</option>
              <option value="bold">Bold & Confident</option>
              <option value="educational">Educational</option>
              <option value="inspirational">Inspirational</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Hashtags (space or comma separated)</label>
            <input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="#tech #ai #startup"
              className="w-full px-3 py-2 rounded-lg bg-primary border border-tableBorder text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={handleLaunch} loading={loading} className="flex-1">
            Launch Commander
          </Button>
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-primary border border-tableBorder text-sm hover:border-gray-400">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Add Credential Form ──────────────────────────────────────────────────────

const AddCredentialForm = ({ onAdd, onClose }: { onAdd: (data: any) => void; onClose: () => void }) => {
  const [platform, setPlatform] = useState('x');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const PLATFORMS = ['x', 'bluesky', 'reddit', 'linkedin', 'linkedin-page', 'instagram', 'threads'];

  const handleSubmit = async () => {
    if (!username || !password) return;
    setLoading(true);
    await onAdd({ platform, username, password });
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-secondary rounded-2xl border border-tableBorder p-6 w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">Add Account</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-gray-400">
          Your password is encrypted with AES-256-GCM before storage. The Commander uses it to log in and then stores only the session cookie.
        </p>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-primary border border-tableBorder text-sm focus:outline-none focus:border-blue-500"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">
              {platform === 'reddit' ? 'Reddit username' : platform === 'bluesky' ? 'Handle (e.g. you.bsky.social)' : 'Username or Email'}
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={platform === 'bluesky' ? 'you.bsky.social' : platform === 'linkedin' ? 'your@email.com' : '@username'}
              className="w-full px-3 py-2 rounded-lg bg-primary border border-tableBorder text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">
              {platform === 'bluesky' ? 'App Password (from bsky.social/settings/app-passwords)' : 'Password'}
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={platform === 'bluesky' ? 'xxxx-xxxx-xxxx-xxxx' : '••••••••'}
                className="w-full px-3 py-2 pr-10 rounded-lg bg-primary border border-tableBorder text-sm focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs"
              >
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>
            {platform === 'bluesky' && (
              <p className="text-[10px] text-gray-500 mt-1">
                Create a free app password at bsky.social → Settings → App passwords (10 seconds, revokable).
              </p>
            )}
            {platform === 'reddit' && (
              <p className="text-[10px] text-gray-500 mt-1">
                Also set REDDIT_SWARM_CLIENT_ID in .env. Create a free "script" app at reddit.com/prefs/apps.
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={handleSubmit} loading={loading} className="flex-1" disabled={!username || !password}>
            Add Account
          </Button>
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-primary border border-tableBorder text-sm hover:border-gray-400">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Tab type ─────────────────────────────────────────────────────────────────

type Tab = 'commanders' | 'integrations' | 'logs';

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export const SwarmDashboard = () => {
  const fetch = useFetch();
  const { data: swarmStatus, isLoading, mutate: mutateSwarm } = useSwarmStatus();
  const { data: platforms } = useSwarmPlatforms();
  const { data: credentials, mutate: mutateCreds } = useCredentials();
  const { data: commanders, mutate: mutateCommanders } = useCommanderStatuses();

  const [tab, setTab] = useState<Tab>('commanders');
  const [actionLoading, setActionLoading] = useState('');
  const [showAddCredential, setShowAddCredential] = useState(false);
  const [launchingCredId, setLaunchingCredId] = useState<string | null>(null);

  // ── Credential actions ──────────────────────────────────────────────────────

  const handleAddCredential = useCallback(async (data: { platform: string; username: string; password: string }) => {
    try {
      await fetch('/swarm/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      await mutateCreds();
    } catch (err) {
      console.error('Add credential failed:', err);
    }
  }, [fetch, mutateCreds]);

  const handleToggleCredential = useCallback(async (id: string, enabled: boolean) => {
    await fetch(`/swarm/credentials/${id}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    await mutateCreds();
  }, [fetch, mutateCreds]);

  const handleDeleteCredential = useCallback(async (id: string) => {
    if (!confirm('Remove this account? Running Commanders will be stopped.')) return;
    await fetch(`/swarm/credentials/${id}`, { method: 'DELETE' });
    await mutateCreds();
    await mutateCommanders();
  }, [fetch, mutateCreds, mutateCommanders]);

  // ── Commander actions ───────────────────────────────────────────────────────

  const handleLaunchCommander = useCallback(async (credId: string, cfg: any) => {
    await fetch(`/swarm/commanders/${credId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    await mutateCommanders();
  }, [fetch, mutateCommanders]);

  const handleCommanderAction = useCallback(async (credId: string, action: 'pause' | 'resume' | 'stop') => {
    const method = action === 'stop' ? 'DELETE' : 'POST';
    await fetch(`/swarm/commanders/${credId}/${action}`, { method });
    await mutateCommanders();
  }, [fetch, mutateCommanders]);

  // ── Integration-based swarm actions ─────────────────────────────────────────

  const handleSwarmAction = useCallback(async (action: 'start' | 'stop' | 'pause' | 'resume') => {
    setActionLoading(action);
    try {
      const methods: Record<string, string> = { start: 'POST', stop: 'DELETE', pause: 'POST', resume: 'POST' };
      await fetch(`/swarm/${action === 'start' ? 'start' : action}`, { method: methods[action] });
      await mutateSwarm();
    } finally {
      setActionLoading('');
    }
  }, [fetch, mutateSwarm]);

  if (isLoading) return <LoadingComponent />;

  const runningCommanders = (commanders || []).filter((c) => c.running).length;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Prospektlab Agent Swarm</h1>
          <p className="text-sm text-gray-400 mt-1">
            Autonomous social media operations — Commanders fork typed sub-agents sharing one session
          </p>
        </div>
        <div className="flex items-center gap-3">
          {runningCommanders > 0 && (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
              {runningCommanders} Commander{runningCommanders !== 1 ? 's' : ''} active
            </span>
          )}
        </div>
      </div>

      {/* Quick stats bar */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Accounts', value: (credentials || []).length, color: '' },
          { label: 'Commanders', value: runningCommanders, color: 'text-green-400' },
          { label: 'Actions OK', value: (commanders || []).reduce((s, c) => s + Object.values(c.sharedState.stats).reduce((a, v) => a + v.successes, 0), 0), color: 'text-blue-400' },
          { label: 'Trends Tracked', value: (commanders || []).reduce((s, c) => s + c.sharedState.trendingCount, 0), color: 'text-purple-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-secondary rounded-xl border border-tableBorder p-4 text-center">
            <div className={clsx('text-3xl font-bold', color)}>{value}</div>
            <div className="text-xs text-gray-400 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-primary rounded-xl p-1 border border-tableBorder">
        {(['commanders', 'integrations', 'logs'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize',
              tab === t ? 'bg-secondary text-white' : 'text-gray-400 hover:text-white'
            )}
          >
            {t === 'commanders' ? '🤖 Commanders' : t === 'integrations' ? '🔗 Integration Swarm' : '📋 Logs'}
          </button>
        ))}
      </div>

      {/* ── Tab: Commanders ── */}
      {tab === 'commanders' && (
        <div className="flex flex-col gap-4">
          {/* Accounts section */}
          <div className="bg-secondary rounded-xl border border-tableBorder p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Accounts</h2>
              <Button onClick={() => setShowAddCredential(true)} className="text-xs py-1.5 px-3">
                + Add Account
              </Button>
            </div>

            {(credentials || []).length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                <div className="text-3xl mb-2">🔐</div>
                No accounts added yet.
                <br />Add a social media account to start a Commander.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(credentials || []).map((cred) => (
                  <CredentialCard
                    key={cred.id}
                    cred={cred}
                    onToggle={handleToggleCredential}
                    onDelete={handleDeleteCredential}
                    onStartCommander={(id) => setLaunchingCredId(id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Active Commanders section */}
          {(commanders || []).length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-3">Running Commanders</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(commanders || []).map((c) => (
                  <CommanderCard
                    key={c.key}
                    commander={c}
                    onPause={(credId) => handleCommanderAction(credId, 'pause')}
                    onResume={(credId) => handleCommanderAction(credId, 'resume')}
                    onStop={(credId) => handleCommanderAction(credId, 'stop')}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Integration Swarm ── */}
      {tab === 'integrations' && (
        <div className="flex flex-col gap-4">
          <div className="bg-secondary rounded-xl border border-tableBorder p-5">
            <h2 className="text-sm font-semibold mb-4">Integration-based Swarm</h2>
            <p className="text-xs text-gray-400 mb-4">
              Uses your connected OAuth integrations from the Integrations page. Each platform runs one agent loop.
            </p>

            {(swarmStatus?.status === 'stopped' || !swarmStatus?.status) ? (
              <Button onClick={() => handleSwarmAction('start')} loading={actionLoading === 'start'}>
                Start Integration Swarm
              </Button>
            ) : (
              <div className="flex gap-3">
                {swarmStatus.status === 'running' && (
                  <Button onClick={() => handleSwarmAction('pause')} loading={actionLoading === 'pause'} secondary>Pause</Button>
                )}
                {swarmStatus.status === 'paused' && (
                  <Button onClick={() => handleSwarmAction('resume')} loading={actionLoading === 'resume'}>Resume</Button>
                )}
                <Button onClick={() => handleSwarmAction('stop')} loading={actionLoading === 'stop'} secondary>Stop</Button>
              </div>
            )}
          </div>

          {(swarmStatus?.agents || []).length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(swarmStatus?.agents || []).map((agent, i) => (
                <div key={`${agent.platform}-${i}`} className="bg-secondary rounded-xl border border-tableBorder p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold capitalize">{agent.platform.replace('-', ' ')}</h3>
                    <StatusBadge status={agent.running ? (agent.paused ? 'paused' : 'running') : 'stopped'} />
                  </div>
                  <div className="grid grid-cols-4 gap-2 mb-2 text-center text-xs">
                    <div><div className="font-bold">{agent.counters.posts}</div><div className="text-gray-400">Posts</div></div>
                    <div><div className="font-bold">{agent.counters.comments}</div><div className="text-gray-400">Comments</div></div>
                    <div><div className="font-bold">{agent.counters.engagements}</div><div className="text-gray-400">Engage</div></div>
                    <div><div className="font-bold text-red-400">{agent.counters.errors}</div><div className="text-gray-400">Errors</div></div>
                  </div>
                  <div className="text-[10px] text-gray-400 truncate">{agent.lastAction || 'Idle'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Logs ── */}
      {tab === 'logs' && (
        <div className="bg-secondary rounded-xl border border-tableBorder p-5">
          <h2 className="text-sm font-semibold mb-3">Activity Logs</h2>
          <div className="bg-primary rounded-lg p-3 max-h-[60vh] overflow-y-auto font-mono text-xs">
            {swarmStatus?.logs && swarmStatus.logs.length > 0 ? (
              swarmStatus.logs.map((log, i) => (
                <div key={i} className="py-0.5 text-gray-300 border-b border-tableBorder/20">{log}</div>
              ))
            ) : (
              <div className="text-gray-500 text-center py-8">No logs yet</div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showAddCredential && (
        <AddCredentialForm
          onAdd={handleAddCredential}
          onClose={() => setShowAddCredential(false)}
        />
      )}

      {launchingCredId && (
        <LaunchCommanderModal
          credentialId={launchingCredId}
          onClose={() => setLaunchingCredId(null)}
          onLaunch={handleLaunchCommander}
        />
      )}
    </div>
  );
};
