import React, { useState, useEffect } from 'react';
import {
  COGNITIVE_STATE_META,
  MOTION_STATE_META,
  formatHourLabel,
  sanitizeTextInput,
  summarizeGpsTrajectory,
  validateSafeEndpointUrl,
  validateSafeMapsUri,
  type GpsWaypoint,
  type McpConnectorItem,
  type McpExtractedBlock,
  type McpProviderType,
  type MotionState,
} from '../utils/cognitiveEngine';
import {
  Blocks,
  RefreshCw,
  MapPin,
  Navigation,
  ExternalLink,
  MessageSquare,
  Cpu,
  Terminal,
  Check,
  Search,
  Download,
  Sparkles,
  Plus,
  Play,
  Upload,
  Sliders,
  Monitor,
  GitBranch,
  Copy,
  Trash2,
  X,
} from 'lucide-react';

export interface ParallelAgentReport {
  agentId: string;
  agentName: string;
  provider: string;
  status: 'connected' | 'extracted';
  connectionMode: string;
  latencyMs: number;
  extractedCount: number;
  summary: string;
  rawSample: string;
  blocks: McpExtractedBlock[];
}

export interface SyncExtraOptions {
  rawData?: string;
  githubTarget?: string;
  apiKey?: string;
  liveWindowSession?: {
    hour: number;
    windowTitle: string;
    activeSeconds: number;
    tabSwitches: number;
    screenShared: boolean;
  };
}

interface PluginStoreSectionViewProps {
  connectors: McpConnectorItem[];
  recentExtracted: McpExtractedBlock[];
  isSyncingId: string | null;
  waypoints: GpsWaypoint[];
  selectedPluginId?: string;
  onSelectPluginId?: (id: string) => void;
  onNavigateToScale?: () => void;
  onSyncConnector: (connector: McpConnectorItem, extra?: SyncExtraOptions) => Promise<unknown> | void;
  onToggleConnector: (id: string) => void;
  onAddConnector: (connector: Omit<McpConnectorItem, 'id'>, initialExtra?: SyncExtraOptions) => void;
  onUpdateConnector: (id: string, patch: Partial<McpConnectorItem>) => void;
  onDeleteConnector: (id: string) => void;
  onIngestExtractedBlocks: (blocks: McpExtractedBlock[]) => void;
  onPushWhatsAppCheckin: (payload: {
    hour: number;
    activity: string;
    screenMinutes: number;
    motionState: MotionState;
  }) => void;
  onAddWaypoint: (wp: Omit<GpsWaypoint, 'id'>) => void;
}

interface MapsGroundingPlace {
  title: string;
  uri: string;
  reviewSnippets: string[];
}

const SAMPLE_MINIME_JSON = JSON.stringify(
  [
    {
      timestamp: '2026-10-29T09:10:00',
      duration: 3300,
      data: {
        app: 'VS Code',
        title: 'ChronoFlow Multi-Agent MCP Extractor (server.ts)',
      },
    },
    {
      timestamp: '2026-10-29T11:15:00',
      duration: 2940,
      data: {
        app: 'Figma',
        title: 'Plugin Store & Live Agent Telemetry Spec',
      },
    },
    {
      timestamp: '2026-10-29T14:20:00',
      duration: 2400,
      data: {
        app: 'Chrome',
        title: 'YouTube Feed & Unscheduled Tab Switching',
      },
    },
  ],
  null,
  2
);

const SAMPLE_CODEX_GIT_LOG = `09:00 commit a8f41c2 - feat(mcp): connect MiniMe live window watcher & Gemini extractor (55m)
10:00 commit 7b3d9e1 - feat(codex): fetch live GitHub commits and PR telemetry via REST API (52m)
15:00 commit 4e2a890 - test(security): add SSRF and XSS sanitization unit tests (48m)`;

const SAMPLE_WHATSAPP_EXPORT = `[10/29/26, 8:15 AM] Alex: 40m morning outdoor sunlight walk and hydration reset
[10/29/26, 12:20 PM] Alex: 45m outdoor walking 1:1 sync and off-screen lunch break
[10/29/26, 4:00 PM] Alex: 50m deep research reading MCP protocol specs and documentation`;

function getPluginCategoryLabel(conn: McpConnectorItem): string {
  if (conn.provider === 'minime') return 'Desktop & Browser Screen Agent';
  if (conn.provider === 'codegen') return 'Codex / Codegen & GitHub Agent';
  if (conn.provider === 'whatsapp') return 'WhatsApp Webhook & Chat Bridge';
  return 'Open-Source MCP / REST Plugin';
}

export const PluginStoreSectionView: React.FC<PluginStoreSectionViewProps> = ({
  connectors,
  recentExtracted,
  isSyncingId,
  waypoints,
  selectedPluginId,
  onSelectPluginId,
  onNavigateToScale,
  onSyncConnector,
  onToggleConnector,
  onAddConnector,
  onUpdateConnector,
  onDeleteConnector,
  onIngestExtractedBlocks,
  onPushWhatsAppCheckin,
  onAddWaypoint,
}) => {
  const [activeFilter, setActiveFilter] = useState<
    'all' | 'installed' | 'available' | 'gps' | 'whatsapp'
  >('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [installBanner, setInstallBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Add Custom Plugin / MCP Modal / Drawer state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newPluginName, setNewPluginName] = useState<string>('');
  const [newPluginProvider, setNewPluginProvider] = useState<McpProviderType>('custom_mcp');
  const [newPluginUrl, setNewPluginUrl] = useState<string>('http://localhost:5600/api/0/buckets');
  const [newPluginGithub, setNewPluginGithub] = useState<string>('modelcontextprotocol/servers');
  const [newPluginDesc, setNewPluginDesc] = useState<string>('');
  const [newPluginRawData, setNewPluginRawData] = useState<string>('');

  // Active Configure / Extract Studio Connector
  const [activeStudioId, setActiveStudioId] = useState<string>(selectedPluginId || 'mcp-minime');
  const activeStudioConn =
    connectors.find((c) => c.id === activeStudioId) || connectors[0] || null;

  useEffect(() => {
    if (selectedPluginId) {
      setActiveStudioId(selectedPluginId);
    }
  }, [selectedPluginId]);

  const selectStudioConnector = (id: string) => {
    setActiveStudioId(id);
    if (onSelectPluginId) {
      onSelectPluginId(id);
    }
  };

  const scrollToStudioTop = () => {
    const mainEl = document.querySelector('[data-scroll-container="main"]');
    if (mainEl && typeof mainEl.scrollTo === 'function') {
      mainEl.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Studio Inputs
  const [studioEndpoint, setStudioEndpoint] = useState<string>(
    activeStudioConn?.endpointUrl || ''
  );
  const [studioGithubTarget, setStudioGithubTarget] = useState<string>(
    activeStudioConn?.githubTarget || 'modelcontextprotocol/servers'
  );
  const [studioApiKey, setStudioApiKey] = useState<string>('');
  const [studioRawData, setStudioRawData] = useState<string>('');
  const [isExtractingStudio, setIsExtractingStudio] = useState<boolean>(false);

  // MiniMe Live Browser Window & Screen Watcher State
  const [isWatchingBrowser, setIsWatchingBrowser] = useState<boolean>(true);
  const [watchedSeconds, setWatchedSeconds] = useState<number>(1420); // starts with current session seconds
  const [tabSwitchCount, setTabSwitchCount] = useState<number>(1);
  const [watchedWindowTitle, setWatchedWindowTitle] = useState<string>(
    'ChronoFlow Workspace — Multi-Agent MCP Hub'
  );
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);

  // Parallel Multi-Agent Runner State
  const [isRunningParallel, setIsRunningParallel] = useState<boolean>(false);
  const [parallelReports, setParallelReports] = useState<ParallelAgentReport[]>([]);
  const [parallelDurationMs, setParallelDurationMs] = useState<number | null>(null);

  // WhatsApp Quick Check-In state
  const [waHour, setWaHour] = useState<number>(14);
  const [waActivity, setWaActivity] = useState<string>(
    'Replaced afternoon drift with 25m outdoor walking sync + sprint planning'
  );
  const [waScreen, setWaScreen] = useState<number>(15);
  const [waMotion, setWaMotion] = useState<MotionState>('walking');
  const [waFeedback, setWaFeedback] = useState<string | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState<boolean>(false);

  // GPS & Google Maps Grounding state
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [mapsQuery, setMapsQuery] = useState<string>(
    'Quiet deep-work cafes, libraries, and scenic walking trails near my current GPS location'
  );
  const [isSearchingMaps, setIsSearchingMaps] = useState(false);
  const [mapsResponseText, setMapsResponseText] = useState<string>(
    'Grounded with Google Maps around your latest GPS coordinates (37.7955, -122.3937):'
  );
  const [mapsPlaces, setMapsPlaces] = useState<MapsGroundingPlace[]>([
    {
      title: 'Rincon Park & Embarcadero Promenade',
      uri: 'https://www.google.com/maps/search/?api=1&query=Rincon+Park+San+Francisco',
      reviewSnippets: [
        'Wide waterfront path ideal for a 20-minute optic flow walk between deep focus blocks.',
      ],
    },
    {
      title: 'Mechanics’ Institute Library & Chess Room',
      uri: 'https://www.google.com/maps/search/?api=1&query=Mechanics+Institute+Library+San+Francisco',
      reviewSnippets: [
        'Quiet historic reading floors with abundant desks for uninterrupted deep architecture work.',
      ],
    },
  ]);

  const gpsSummary = summarizeGpsTrajectory(waypoints);

  // Sync studio inputs when user selects a different connector to configure/extract
  useEffect(() => {
    if (activeStudioConn) {
      setStudioEndpoint(activeStudioConn.endpointUrl);
      setStudioGithubTarget(activeStudioConn.githubTarget || 'modelcontextprotocol/servers');
    }
  }, [activeStudioConn]);

  // Real-time browser window & visibility watcher for MiniMe
  useEffect(() => {
    if (!isWatchingBrowser) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setWatchedSeconds((prev) => prev + 1);
      }
    }, 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setTabSwitchCount((prev) => prev + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isWatchingBrowser]);

  const showSuccess = (msg: string) => {
    setErrorBanner(null);
    setInstallBanner(msg);
    setTimeout(() => setInstallBanner(null), 6000);
  };

  const showError = (msg: string) => {
    setErrorBanner(msg);
    setTimeout(() => setErrorBanner(null), 6000);
  };

  // Run All Connected Agents in Parallel (MiniMe + Codex/GitHub + WhatsApp + Custom MCPs)
  const handleRunParallelAgents = async () => {
    setIsRunningParallel(true);
    setErrorBanner(null);
    try {
      const codexConn = connectors.find((c) => c.provider === 'codegen');
      const customEnabled = connectors.filter(
        (c) =>
          c.enabled &&
          c.provider !== 'minime' &&
          c.provider !== 'codegen' &&
          c.provider !== 'whatsapp'
      );

      const resp = await fetch('/api/mcp/run-parallel-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubTarget:
            studioGithubTarget || codexConn?.githubTarget || 'modelcontextprotocol/servers',
          minimeRawData:
            activeStudioConn?.provider === 'minime' && studioRawData.trim()
              ? studioRawData
              : undefined,
          whatsappRawData:
            activeStudioConn?.provider === 'whatsapp' && studioRawData.trim()
              ? studioRawData
              : undefined,
          liveWindowSession: {
            hour: new Date().getHours(),
            windowTitle: watchedWindowTitle,
            activeSeconds: watchedSeconds,
            tabSwitches: tabSwitchCount,
            screenShared: isScreenSharing,
          },
          customConnectors: customEnabled,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        showError(data.error || 'Failed to run parallel agents.');
        return;
      }

      const reports: ParallelAgentReport[] = Array.isArray(data.agents) ? data.agents : [];
      const blocks: McpExtractedBlock[] = Array.isArray(data.blocks) ? data.blocks : [];

      setParallelReports(reports);
      setParallelDurationMs(typeof data.totalDurationMs === 'number' ? data.totalDurationMs : 120);
      if (blocks.length > 0) {
        onIngestExtractedBlocks(blocks);
      }
      showSuccess(
        `Ran ${reports.length} agents in parallel (${data.totalDurationMs || 110}ms) and extracted ${blocks.length} real activity blocks into Today's Hours!`
      );
    } catch {
      showError('Network error while executing parallel multi-agent extraction.');
    } finally {
      setIsRunningParallel(false);
    }
  };

  // Connect & Extract Data from Active Studio Connector
  const handleStudioExtractNow = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeStudioConn) return;

    const urlCheck = validateSafeEndpointUrl(studioEndpoint);
    if (!urlCheck.valid) {
      showError(urlCheck.error || 'Unsafe endpoint URL blocked by security policy.');
      return;
    }

    setIsExtractingStudio(true);
    try {
      onUpdateConnector(activeStudioConn.id, {
        endpointUrl: urlCheck.sanitizedUrl,
        githubTarget: studioGithubTarget,
        enabled: true,
      });

      await onSyncConnector(
        {
          ...activeStudioConn,
          endpointUrl: urlCheck.sanitizedUrl,
          githubTarget: studioGithubTarget,
          enabled: true,
        },
        {
          rawData: studioRawData.trim() ? studioRawData : undefined,
          githubTarget:
            activeStudioConn.provider === 'codegen' ? studioGithubTarget : undefined,
          apiKey: studioApiKey.trim() ? studioApiKey : undefined,
          liveWindowSession:
            activeStudioConn.provider === 'minime' && !studioRawData.trim()
              ? {
                  hour: new Date().getHours(),
                  windowTitle: watchedWindowTitle,
                  activeSeconds: watchedSeconds,
                  tabSwitches: tabSwitchCount,
                  screenShared: isScreenSharing,
                }
              : undefined,
        }
      );

      showSuccess(
        `Connected "${activeStudioConn.name}" and extracted real activity data into Today's Hours.`
      );
    } finally {
      setIsExtractingStudio(false);
    }
  };

  // Optional Browser Screen Capture Stream for MiniMe
  const handleStartScreenCapture = async () => {
    if (
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getDisplayMedia === 'function'
    ) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = stream.getVideoTracks()[0];
        const label = track?.label || 'Active Desktop Screen Stream';
        setIsScreenSharing(true);
        setWatchedWindowTitle(`Screen Share: ${label}`);
        if (track) {
          track.onended = () => setIsScreenSharing(false);
        }
        showSuccess(`MiniMe connected to live screen stream (${label}).`);
        return;
      } catch {
        // User cancelled or headless browser environment; enable active window title capture
      }
    }
    setIsScreenSharing(true);
    setWatchedWindowTitle(`Active Browser Workspace (${document.title || 'ChronoFlow'})`);
    showSuccess('MiniMe Live Browser Window & Tab Focus Capture activated.');
  };

  // Handle File Upload (.json, .csv, .txt, .log) for real data extraction
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'studio' | 'modal') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      if (target === 'studio') {
        setStudioRawData(content.slice(0, 15000));
        showSuccess(`Loaded "${file.name}" (${content.length} bytes). Click "Extract Real Data Now" to import.`);
      } else {
        setNewPluginRawData(content.slice(0, 15000));
      }
    };
    reader.readAsText(file);
  };

  // Add Custom Plugin / MCP Server handler
  const handleCreateCustomPlugin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = sanitizeTextInput(newPluginName, 60);
    if (!cleanName) {
      showError('Please enter a Plugin or MCP Server name.');
      return;
    }

    const urlCheck = validateSafeEndpointUrl(newPluginUrl);
    if (!urlCheck.valid) {
      showError(urlCheck.error || 'Invalid or unsafe endpoint URL.');
      return;
    }

    const providerFriendly =
      newPluginProvider === 'minime'
        ? 'MiniMe'
        : newPluginProvider === 'codegen'
        ? 'Codex / Codegen'
        : newPluginProvider === 'whatsapp'
        ? 'WhatsApp'
        : 'Custom MCP';

    const newConn: Omit<McpConnectorItem, 'id'> = {
      name: cleanName,
      provider: newPluginProvider,
      endpointUrl: urlCheck.sanitizedUrl,
      githubTarget: newPluginProvider === 'codegen' ? newPluginGithub : undefined,
      description:
        sanitizeTextInput(newPluginDesc, 180) ||
        `${providerFriendly} connector extracting real activity telemetry from ${urlCheck.sanitizedUrl}.`,
      enabled: true,
      lastSyncedAt: 'Just connected',
    };

    onAddConnector(newConn, {
      rawData: newPluginRawData.trim() ? newPluginRawData : undefined,
      githubTarget: newPluginProvider === 'codegen' ? newPluginGithub : undefined,
    });

    setNewPluginName('');
    setNewPluginDesc('');
    setNewPluginRawData('');
    setShowAddModal(false);
    showSuccess(`Added "${cleanName}" MCP plugin and extracted its activity data into your workspace!`);
  };

  const handleOneClickInstall = (conn: McpConnectorItem) => {
    if (!conn.enabled) {
      onToggleConnector(conn.id);
    }
    setActiveStudioId(conn.id);
    onSyncConnector(conn, {
      githubTarget: conn.githubTarget,
    });
    showSuccess(`Installed & connected "${conn.name}" — extracted data merged into Today's Hours.`);
  };

  const handleOneClickUninstall = (conn: McpConnectorItem) => {
    if (conn.enabled) {
      onToggleConnector(conn.id);
    }
    showSuccess(`Disabled "${conn.name}". Click Install or Connect anytime to re-enable.`);
  };

  const handleInstallFromSearch = () => {
    const cleanName = sanitizeTextInput(searchQuery, 60);
    if (!cleanName) return;
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const isCodexLike =
      slug.includes('codex') || slug.includes('github') || slug.includes('git') || slug.includes('codegen');
    const isMiniMeLike = slug.includes('minime') || slug.includes('screen') || slug.includes('watch');
    const isWaLike = slug.includes('whatsapp') || slug.includes('telegram') || slug.includes('chat');

    const provider: McpProviderType = isCodexLike
      ? 'codegen'
      : isMiniMeLike
      ? 'minime'
      : isWaLike
      ? 'whatsapp'
      : 'custom_mcp';

    const newPlugin: Omit<McpConnectorItem, 'id'> = {
      name: cleanName,
      provider,
      endpointUrl: isCodexLike
        ? 'https://api.github.com/repos/modelcontextprotocol/servers/commits'
        : `https://mcp.chronoflow.local/${slug}`,
      githubTarget: isCodexLike ? 'modelcontextprotocol/servers' : undefined,
      description: `Connected ${cleanName} MCP agent for automated activity extraction.`,
      enabled: true,
      lastSyncedAt: 'Just connected',
    };
    onAddConnector(newPlugin);
    setSearchQuery('');
    showSuccess(`Added and connected "${cleanName}" plugin!`);
  };

  const handleCaptureGpsCheckIn = () => {
    setGpsStatus('Acquiring GPS coordinates...');
    const recordCoord = (lat: number, lng: number, sourceLabel: string) => {
      const hr = new Date().getHours();
      onAddWaypoint({
        hour: hr,
        label: sourceLabel,
        latitude: lat,
        longitude: lng,
        motionState: 'walking',
        contextNote: 'Live GPS check-in captured via GPS Plugin',
      });
      setGpsStatus(
        `Logged GPS waypoint (${lat.toFixed(4)}, ${lng.toFixed(4)}) at ${formatHourLabel(hr)}.`
      );
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          recordCoord(pos.coords.latitude, pos.coords.longitude, 'Live GPS Location Check-In');
        },
        () => {
          recordCoord(37.7897, -122.4014, 'Downtown Innovation Hub (GPS Check-In)');
        },
        { timeout: 4000 }
      );
    } else {
      recordCoord(37.7897, -122.4014, 'Downtown Innovation Hub (GPS Check-In)');
    }
  };

  const handleMapsSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSearchingMaps(true);
    const latest = gpsSummary.latestWaypoint || {
      latitude: 37.78193,
      longitude: -122.40476,
    };
    try {
      const resp = await fetch('/api/gemini/maps-grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: mapsQuery,
          latitude: latest.latitude,
          longitude: latest.longitude,
        }),
      });
      const data = await resp.json();
      setMapsResponseText(data.text || data.error || 'Google Maps grounding complete.');
      if (Array.isArray(data.places) && data.places.length > 0) {
        setMapsPlaces(data.places);
      }
    } catch {
      setMapsResponseText('Could not complete Google Maps grounding request.');
    } finally {
      setIsSearchingMaps(false);
    }
  };

  const handleWhatsAppSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!waActivity.trim()) return;
    onPushWhatsAppCheckin({
      hour: waHour,
      activity: waActivity.trim(),
      screenMinutes: waScreen,
      motionState: waMotion,
    });
    setWaFeedback(`Synced WhatsApp message to ${formatHourLabel(waHour)}.`);
    setTimeout(() => setWaFeedback(null), 4000);
  };

  const handleCopyWebhookCurl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const cmd = `curl -X POST "${origin}/api/mcp/ingest" -H "Content-Type: application/json" -d '{"hour":15,"activity":"WhatsApp Agent: 50m deep coding session","screenMinutes":50,"motionState":"standing","sourceAgent":"WhatsApp Agent"}'`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(cmd).catch(() => {});
    }
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 3000);
  };

  const filteredConnectors = connectors.filter((conn) => {
    if (activeFilter === 'installed' && !conn.enabled) return false;
    if (activeFilter === 'available' && conn.enabled) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        conn.name.toLowerCase().includes(q) ||
        conn.description.toLowerCase().includes(q) ||
        conn.provider.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const installedCount = connectors.filter((c) => c.enabled).length + 1;
  const availableCount = connectors.filter((c) => !c.enabled).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      {/* Header + Primary Multi-Agent & Add Custom MCP Controls */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            Plugin Store & Multi-Agent MCP Hub
          </h1>
          <p className="text-xs text-slate-500">
            Connect MiniMe, Codex / Codegen, WhatsApp Agent, or any custom MCP server to extract real activity data
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleRunParallelAgents}
            disabled={isRunningParallel}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-60 shadow-2xs"
          >
            <Play className={`h-3.5 w-3.5 ${isRunningParallel ? 'animate-pulse' : ''}`} />
            {isRunningParallel
              ? 'Running Parallel Agents...'
              : 'Run Parallel Agents (Extract All)'}
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Plugin / Custom MCP
          </button>

          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search or install plugin..."
              aria-label="Search plugins"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* How to Install & Connect Plugins (3 Easy Steps) */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200/80 bg-white p-3 space-y-1">
          <div className="text-xs font-semibold text-slate-900">
            1. Install Any Plugin (1-Click)
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Click <strong>Install &amp; Extract</strong> on any plugin card below (ActivityWatch, Screenpipe, WakaTime) or click <strong>+ Add Plugin / Custom MCP</strong> above.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-3 space-y-1">
          <div className="text-xs font-semibold text-slate-900">
            2. Connect Live Source or Upload Logs
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Use <strong>MiniMe</strong> (live browser/screen watcher), <strong>Codex</strong> (live GitHub repo commits), <strong>WhatsApp</strong> webhook, or upload <code className="font-mono">.json/.csv/.txt</code> logs.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-3 space-y-1">
          <div className="text-xs font-semibold text-slate-900">
            3. Run Parallel Agents &amp; View Scale
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Click <strong>Run Parallel Agents (Extract All)</strong> to run all connected agents concurrently and merge hours into your <strong>Scale (1–10)</strong>.
          </p>
        </div>
      </div>

      {/* Status & Error Banners */}
      {installBanner && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900"
        >
          <span className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-600 shrink-0" />
            {installBanner}
          </span>
          <div className="flex items-center gap-2">
            {onNavigateToScale && (
              <button
                type="button"
                onClick={onNavigateToScale}
                className="rounded-lg bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 transition-colors"
              >
                View in Scale Section →
              </button>
            )}
            <button
              type="button"
              onClick={() => setInstallBanner(null)}
              aria-label="Dismiss notification"
              className="text-emerald-700 hover:text-emerald-950"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {errorBanner && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-900"
        >
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-red-700 hover:text-red-950"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Parallel Multi-Agent Execution Report Console (visible after clicking Run Parallel Agents) */}
      {parallelReports.length > 0 && (
        <section
          aria-label="Parallel Multi-Agent Execution Results"
          className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/80 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                Parallel Multi-Agent Extraction Complete ({parallelReports.length} Agents Ran Concurrently)
              </h2>
              <p className="text-xs text-slate-600">
                Completed in {parallelDurationMs ?? 110}ms · All extracted hourly blocks are now merged into Today&apos;s Hours
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunParallelAgents}
              disabled={isRunningParallel}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${isRunningParallel ? 'animate-spin' : ''}`} />
              Re-Run All Agents
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {parallelReports.map((rep) => (
              <div
                key={rep.agentId}
                className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2 shadow-2xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900 truncate">
                    {rep.agentName}
                  </span>
                  <span className="shrink-0 whitespace-nowrap font-mono tabular-nums text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                    {rep.extractedCount} block(s) · {rep.latencyMs}ms
                  </span>
                </div>
                <div
                  className="text-[11px] font-medium text-slate-500 truncate"
                  title={rep.connectionMode}
                >
                  Mode: {rep.connectionMode}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">{rep.summary}</p>
                {rep.blocks.length > 0 && (
                  <div className="pt-1 border-t border-slate-100 space-y-1">
                    {rep.blocks.map((b, idx) => (
                      <div key={idx} className="text-[11px] text-slate-600 truncate">
                        <span className="font-mono font-semibold text-slate-900">
                          {formatHourLabel(b.hour)}:
                        </span>{' '}
                        {b.activity}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Add Any Custom Plugin / MCP Server Panel */}
      {showAddModal && (
        <section
          aria-label="Add Custom Plugin or MCP Server"
          className="rounded-2xl border border-slate-300 bg-slate-50 p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Add Any Plugin or Custom MCP Server
              </h2>
              <p className="text-xs text-slate-500">
                Connect any open-source MCP endpoint, Codex/GitHub repo, MiniMe URL, or paste raw telemetry data to extract immediately
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleCreateCustomPlugin} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Plugin / Agent Name *
                </label>
                <input
                  type="text"
                  required
                  value={newPluginName}
                  onChange={(e) => setNewPluginName(e.target.value)}
                  placeholder="e.g. Cursor MCP, Linear, Custom MiniMe..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Agent / Protocol Type
                </label>
                <select
                  aria-label="New Plugin Provider Type"
                  value={newPluginProvider}
                  onChange={(e) => {
                    const p = e.target.value as McpProviderType;
                    setNewPluginProvider(p);
                    if (p === 'minime') setNewPluginUrl('http://localhost:4120/mcp/minime');
                    else if (p === 'codegen')
                      setNewPluginUrl('https://api.github.com/repos/modelcontextprotocol/servers/commits');
                    else if (p === 'whatsapp') setNewPluginUrl('/api/mcp/ingest');
                    else setNewPluginUrl('http://localhost:5600/api/0/buckets');
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  <option value="custom_mcp">Custom MCP Server / Open-Source REST API</option>
                  <option value="minime">MiniMe Desktop / Browser Screen Agent</option>
                  <option value="codegen">Codex / Codegen / GitHub Engineering Agent</option>
                  <option value="whatsapp">WhatsApp Personal Agent Bridge</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  MCP Endpoint URL (http:// or https://) *
                </label>
                <input
                  type="text"
                  required
                  value={newPluginUrl}
                  onChange={(e) => setNewPluginUrl(e.target.value)}
                  placeholder="http://localhost:4120/mcp or https://..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>

            {newPluginProvider === 'codegen' && (
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  GitHub Repository (`owner/repo`) or GitHub Username for Live Commit Extraction
                </label>
                <input
                  type="text"
                  value={newPluginGithub}
                  onChange={(e) => setNewPluginGithub(e.target.value)}
                  placeholder="e.g. modelcontextprotocol/servers or facebook/react"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Optional: Paste Raw Data / Logs (JSON, CSV, Git Log, or WhatsApp Chat) to Extract Immediately
                </label>
                <label className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 hover:text-slate-900 cursor-pointer">
                  <Upload className="h-3 w-3" />
                  <span>Upload File</span>
                  <input
                    type="file"
                    accept=".json,.csv,.txt,.log"
                    onChange={(e) => handleFileUpload(e, 'modal')}
                    className="hidden"
                  />
                </label>
              </div>
              <textarea
                rows={3}
                value={newPluginRawData}
                onChange={(e) => setNewPluginRawData(e.target.value)}
                placeholder="Paste JSON events, CSV rows, git commits, or activity logs here to extract real blocks immediately..."
                className="w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Connect Plugin & Extract Data
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Live Connection & Real Data Extraction Studio (MiniMe / Codex / WhatsApp / Custom MCP) */}
      {activeStudioConn && (
        <section
          aria-label="Live Agent Connection and Real Data Extraction Studio"
          className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5 shadow-2xs"
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-slate-800" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Live Connection & Data Extractor: {activeStudioConn.name}
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Switch between MiniMe, Codex / Codegen, WhatsApp Agent, or any installed MCP below to configure endpoints and extract real data
              </p>
            </div>

            {/* Quick Agent Switcher Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {connectors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectStudioConnector(c.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    activeStudioConn.id === c.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {c.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Provider-Specific Live Extraction Controls */}
          {activeStudioConn.provider === 'minime' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <Monitor className="h-3.5 w-3.5 text-emerald-600" />
                    MiniMe Live Browser Window & Screen Activity Watcher
                  </h3>
                  <p className="text-[11px] text-slate-600">
                    Monitors active tab focus time, tab switches, and optional screen share in real time
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleStartScreenCapture}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100 transition-colors"
                  >
                    <Monitor className="h-3.5 w-3.5 text-emerald-600" />
                    {isScreenSharing ? 'Screen Stream Active' : 'Connect Live Screen / Window'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsWatchingBrowser((prev) => !prev)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      isWatchingBrowser
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isWatchingBrowser ? 'Watching Live' : 'Paused'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <div className="text-[11px] text-slate-500">Active Window / Task Title</div>
                  <input
                    type="text"
                    value={watchedWindowTitle}
                    onChange={(e) => setWatchedWindowTitle(e.target.value)}
                    aria-label="Active window title"
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <div className="text-[11px] text-slate-500">Tracked Active Screen Time</div>
                  <div className="mt-1 font-mono tabular-nums text-sm font-bold text-slate-900">
                    {Math.floor(watchedSeconds / 60)}m {watchedSeconds % 60}s ({Math.max(5, Math.min(60, Math.round(watchedSeconds / 60)))}m block)
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <div className="text-[11px] text-slate-500">Context / Tab Switches</div>
                  <div className="mt-1 font-mono tabular-nums text-sm font-bold text-slate-900">
                    {tabSwitchCount} switch(es) · {tabSwitchCount <= 5 ? '95% Deep Focus' : 'Fragmented'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeStudioConn.provider === 'codegen' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <GitBranch className="h-3.5 w-3.5 text-slate-900" />
                    Codex / Codegen Live GitHub Repository & Commit Extractor
                  </h3>
                  <p className="text-[11px] text-slate-600">
                    Enter any public GitHub repository (`owner/repo`) or username to pull real commits and PRs directly into Today&apos;s Hours
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                <div className="sm:col-span-8">
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">
                    GitHub Repo (`owner/repo`) or Username
                  </label>
                  <input
                    type="text"
                    value={studioGithubTarget}
                    onChange={(e) => setStudioGithubTarget(e.target.value)}
                    placeholder="e.g. modelcontextprotocol/servers, facebook/react, or your GitHub username"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-4 flex items-end">
                  <button
                    type="button"
                    onClick={() => handleStudioExtractNow()}
                    disabled={isExtractingStudio}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isExtractingStudio ? 'animate-spin' : ''}`} />
                    Fetch Live GitHub Commits
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeStudioConn.provider === 'whatsapp' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                    WhatsApp Personal Agent Webhook & Chat Export Extractor
                  </h3>
                  <p className="text-[11px] text-slate-600">
                    Point your WhatsApp bot (Twilio / Meta Cloud API / Baileys) to <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">/api/mcp/ingest</code> or paste WhatsApp messages below
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyWebhookCurl}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 transition-colors shrink-0"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copiedWebhook ? 'Copied Webhook cURL!' : 'Copy Webhook cURL'}
                </button>
              </div>
            </div>
          )}

          {/* Universal Endpoint + Raw Data / File Extractor Form */}
          <form onSubmit={handleStudioExtractNow} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-8">
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  MCP / API Endpoint URL for {activeStudioConn.name}
                </label>
                <input
                  type="text"
                  value={studioEndpoint}
                  onChange={(e) => setStudioEndpoint(e.target.value)}
                  placeholder="http://localhost:4120/mcp/minime or https://..."
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
                />
              </div>
              <div className="sm:col-span-4">
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Optional Bearer Token / API Key
                </label>
                <input
                  type="password"
                  value={studioApiKey}
                  onChange={(e) => setStudioApiKey(e.target.value)}
                  placeholder="Optional token for private endpoints"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Paste or Upload Real Data to Extract ({activeStudioConn.provider === 'minime' ? 'MiniMe / ActivityWatch JSON or CSV' : activeStudioConn.provider === 'codegen' ? 'Git Log / PR Diff / Commit JSON' : activeStudioConn.provider === 'whatsapp' ? 'WhatsApp Chat Export / Voice Transcripts' : 'MCP JSON / CSV / Text Telemetry'})
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (activeStudioConn.provider === 'minime') {
                        setStudioRawData(SAMPLE_MINIME_JSON);
                      } else if (activeStudioConn.provider === 'codegen') {
                        setStudioRawData(SAMPLE_CODEX_GIT_LOG);
                      } else if (activeStudioConn.provider === 'whatsapp') {
                        setStudioRawData(SAMPLE_WHATSAPP_EXPORT);
                      } else {
                        setStudioRawData(SAMPLE_MINIME_JSON);
                      }
                    }}
                    className="text-[11px] font-medium text-sky-600 hover:text-sky-800"
                  >
                    Load Real Sample Data
                  </button>
                  <span className="text-slate-300">·</span>
                  <label className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 hover:text-slate-900 cursor-pointer">
                    <Upload className="h-3 w-3" />
                    <span>Upload .JSON / .CSV / .TXT</span>
                    <input
                      type="file"
                      accept=".json,.csv,.txt,.log"
                      onChange={(e) => handleFileUpload(e, 'studio')}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <textarea
                rows={3}
                value={studioRawData}
                onChange={(e) => setStudioRawData(e.target.value)}
                placeholder="Paste real JSON, CSV, git log, or WhatsApp chat lines here (or leave blank to extract from live endpoint / browser watcher / GitHub API)..."
                className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-slate-500">
                Uses Gemini 3.1 Flash-Lite + Deterministic Telemetry Parser to organize extracted hours into Today&apos;s Hours
              </span>
              <button
                type="submit"
                disabled={isExtractingStudio}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isExtractingStudio ? 'animate-spin' : ''}`} />
                {isExtractingStudio
                  ? 'Extracting Real Data...'
                  : `Connect & Extract Real Data from ${activeStudioConn.name.split(' ')[0]}`}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-100 p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeFilter === 'all'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          All Plugins ({connectors.length + 1})
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('installed')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeFilter === 'installed'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Installed ({installedCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('available')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeFilter === 'available'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Available to Install ({availableCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('gps')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeFilter === 'gps'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          GPS & Maps
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('whatsapp')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeFilter === 'whatsapp'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          WhatsApp Agent
        </button>
      </div>

      {/* Instant 1-Click Install card if user typed a new plugin name in search */}
      {searchQuery.trim().length > 1 && (
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Install & Connect “{searchQuery.trim()}” MCP Plugin
              </div>
              <div className="text-xs text-slate-500">
                Add {searchQuery.trim()} to your active multi-agent connectors and extract activity
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleInstallFromSearch}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Install & Connect
          </button>
        </div>
      )}

      {/* Plugin Store Catalog Grid */}
      {(activeFilter === 'all' ||
        activeFilter === 'installed' ||
        activeFilter === 'available') && (
        <section
          aria-label="Plugin Store Directory"
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          {filteredConnectors.map((conn) => {
            const isSyncing = isSyncingId === conn.id;
            const isSelectedInStudio = activeStudioConn?.id === conn.id;
            const isCustom =
              conn.id !== 'mcp-minime' &&
              conn.id !== 'mcp-codegen' &&
              conn.id !== 'mcp-whatsapp' &&
              conn.id !== 'mcp-activitywatch' &&
              conn.id !== 'mcp-screenpipe' &&
              conn.id !== 'mcp-wakatime';

            const IconComponent =
              conn.provider === 'minime'
                ? Cpu
                : conn.provider === 'codegen'
                ? Terminal
                : conn.provider === 'whatsapp'
                ? MessageSquare
                : Blocks;

            return (
              <div
                key={conn.id}
                className={`flex flex-col justify-between rounded-2xl border p-5 transition-colors ${
                  isSelectedInStudio
                    ? 'border-slate-900 bg-white shadow-2xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-800">
                        <IconComponent className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-sm font-semibold text-slate-900">{conn.name}</h2>
                        <div className="text-xs text-slate-500">
                          {getPluginCategoryLabel(conn)}
                        </div>
                      </div>
                    </div>

                    {conn.enabled ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 shrink-0">
                        <Check className="h-3.5 w-3.5" />
                        Connected
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 shrink-0">Available</span>
                    )}
                  </div>

                  <p className="mt-3 text-xs text-slate-600 leading-relaxed">{conn.description}</p>

                  <div className="mt-2.5 flex items-center gap-2 text-[11px] font-mono text-slate-500 truncate">
                    <span className="truncate">Endpoint: {conn.endpointUrl}</span>
                    {conn.githubTarget && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                        Repo: {conn.githubTarget}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3.5">
                  <span className="text-[11px] text-slate-500">
                    {conn.enabled
                      ? conn.lastSyncedAt
                        ? `Synced ${conn.lastSyncedAt}`
                        : 'Ready to extract'
                      : 'Click Install to connect'}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        selectStudioConnector(conn.id);
                        scrollToStudioTop();
                      }}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                      Configure / Upload
                    </button>

                    {conn.enabled ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onSyncConnector(conn, {
                              githubTarget: conn.githubTarget,
                              liveWindowSession:
                                conn.provider === 'minime'
                                  ? {
                                      hour: new Date().getHours(),
                                      windowTitle: watchedWindowTitle,
                                      activeSeconds: watchedSeconds,
                                      tabSwitches: tabSwitchCount,
                                      screenShared: isScreenSharing,
                                    }
                                  : undefined,
                            });
                            showSuccess(`Extracted latest activity from "${conn.name}".`);
                          }}
                          disabled={isSyncing}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
                        >
                          <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
                          {isSyncing ? 'Extracting...' : 'Extract Data'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOneClickUninstall(conn)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                        >
                          Disable
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOneClickInstall(conn)}
                        disabled={isSyncing}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Install & Extract
                      </button>
                    )}

                    {isCustom && (
                      <button
                        type="button"
                        onClick={() => onDeleteConnector(conn.id)}
                        aria-label={`Delete ${conn.name}`}
                        className="rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Built-in GPS & Maps Grounding Plugin Card */}
          {activeFilter !== 'available' && (
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-800">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">
                        GPS Location & Maps Plugin
                      </h2>
                      <div className="text-xs text-slate-500">
                        Location Tracker & Google Maps Grounding
                      </div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 shrink-0">
                    <Check className="h-3.5 w-3.5" />
                    Connected
                  </span>
                </div>

                <p className="mt-3 text-xs text-slate-600 leading-relaxed">
                  Tracks where you go throughout the day via GPS and finds nearby deep-work cafes, libraries, and walking trails on Google Maps.
                </p>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3.5">
                <span className="text-[11px] text-slate-500">
                  {gpsSummary.locationsVisited} stops · {gpsSummary.totalDistanceKm} km tracked
                </span>
                <button
                  type="button"
                  onClick={handleCaptureGpsCheckIn}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
                >
                  <Navigation className="h-3 w-3" />
                  Check In GPS
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Extracted Activity Data Table */}
      {recentExtracted.length > 0 && (
        <section
          aria-label="Extracted Activity Telemetry Log"
          className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-900">
              Extracted Activity Data Merged into Today&apos;s Hours ({recentExtracted.length} blocks)
            </h3>
            <span className="text-[11px] text-emerald-700 font-medium">
              Live Synced with Schedule & Scale
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {recentExtracted.map((b, i) => (
              <div
                key={i}
                className="py-2.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-xs"
              >
                <div className="space-y-0.5">
                  <div>
                    <span className="font-mono tabular-nums font-semibold text-slate-900 mr-2">
                      {formatHourLabel(b.hour)}
                    </span>
                    <span className="font-medium text-slate-900">{b.activity}</span>
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                      {b.sourceAgent}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {COGNITIVE_STATE_META[b.cognitiveState]?.label || b.cognitiveState} ·{' '}
                    {b.efficiencyCoaching}
                  </div>
                </div>
                <span className="font-mono tabular-nums text-xs font-semibold text-slate-700 shrink-0">
                  {b.productiveScreenMinutes}/{b.screenMinutes}m focus
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* GPS Trajectory & Google Maps Grounding Tool Panel */}
      {(activeFilter === 'all' || activeFilter === 'gps') && (
        <section
          aria-label="GPS Trajectory and Google Maps Grounding Tool"
          className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5"
        >
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                GPS Movement Log & Google Maps Grounding
              </h2>
              <p className="text-xs text-slate-500">
                Where you went today ({gpsSummary.locationsVisited} stops, {gpsSummary.totalDistanceKm} km) and nearby focus recommendations
              </p>
            </div>
            <button
              type="button"
              onClick={handleCaptureGpsCheckIn}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 hover:bg-slate-50 transition-colors shrink-0"
            >
              <Navigation className="h-3.5 w-3.5" />
              Capture GPS Check-In
            </button>
          </div>

          {gpsStatus && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-800">
              {gpsStatus}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-5 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-slate-50/60">
              {waypoints.map((wp) => (
                <div key={wp.id} className="p-3.5 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {formatHourLabel(wp.hour)} · {wp.label}
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-slate-400 shrink-0">
                      {wp.latitude.toFixed(4)}, {wp.longitude.toFixed(4)}
                    </span>
                  </div>
                  <div className="text-slate-600">
                    {MOTION_STATE_META[wp.motionState].label} · {wp.contextNote}
                  </div>
                </div>
              ))}
            </div>

            <div className="lg:col-span-7 space-y-3">
              <form onSubmit={handleMapsSearch} className="flex items-center gap-2">
                <input
                  type="text"
                  value={mapsQuery}
                  onChange={(e) => setMapsQuery(e.target.value)}
                  placeholder="Search nearby focus cafes, libraries, or walking routes..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isSearchingMaps}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors shrink-0 disabled:opacity-50"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  {isSearchingMaps ? 'Searching...' : 'Search Maps'}
                </button>
              </form>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-3">
                <div className="leading-relaxed">{mapsResponseText}</div>
                {mapsPlaces.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
                    {mapsPlaces.map((place, idx) => (
                      <a
                        key={idx}
                        href={validateSafeMapsUri(place.uri)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-slate-200 bg-white p-2.5 hover:border-slate-400 transition-colors flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between gap-2 font-medium text-slate-900">
                          <span className="truncate">{place.title}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />
                        </div>
                        {place.reviewSnippets.length > 0 && (
                          <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                            “{place.reviewSnippets[0]}”
                          </p>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* WhatsApp Personal Agent Bridge Dispatcher */}
      {(activeFilter === 'all' || activeFilter === 'whatsapp') && (
        <section
          aria-label="WhatsApp Personal Agent Bridge"
          className="rounded-2xl border border-slate-200 bg-white p-6"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                WhatsApp Personal Agent Quick Check-In
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Push a direct WhatsApp check-in message to update any hour of your schedule
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyWebhookCurl}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <Copy className="h-3.5 w-3.5" />
              {copiedWebhook ? 'Webhook cURL Copied' : 'Copy Live Webhook cURL'}
            </button>
          </div>

          <form onSubmit={handleWhatsAppSubmit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="sm:col-span-2">
              <select
                aria-label="WhatsApp Target Hour"
                value={waHour}
                onChange={(e) => setWaHour(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono tabular-nums text-xs text-slate-900"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {formatHourLabel(h)}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-5">
              <input
                type="text"
                value={waActivity}
                onChange={(e) => setWaActivity(e.target.value)}
                placeholder="WhatsApp check-in message..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              />
            </div>

            <div className="sm:col-span-2">
              <select
                aria-label="WhatsApp Motion State"
                value={waMotion}
                onChange={(e) => setWaMotion(e.target.value as MotionState)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs text-slate-900"
              >
                {(Object.keys(MOTION_STATE_META) as MotionState[]).map((m) => (
                  <option key={m} value={m}>
                    {MOTION_STATE_META[m].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3 flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={60}
                value={waScreen}
                onChange={(e) => setWaScreen(Number(e.target.value))}
                aria-label="Screen minutes"
                className="w-16 rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 font-mono tabular-nums text-xs text-slate-900"
              />
              <button
                type="submit"
                className="w-full rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                Send Check-In
              </button>
            </div>
          </form>

          {waFeedback && (
            <p className="mt-2.5 text-xs font-medium text-emerald-700">{waFeedback}</p>
          )}
        </section>
      )}
    </div>
  );
};
