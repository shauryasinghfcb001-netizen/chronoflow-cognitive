import React, { useState } from 'react';
import {
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
  Plus,
  Trash2,
  MapPin,
  Navigation,
  ExternalLink,
  MessageSquare,
  Cpu,
  Terminal,
  Check,
} from 'lucide-react';

interface PluginStoreSectionViewProps {
  connectors: McpConnectorItem[];
  recentExtracted: McpExtractedBlock[];
  isSyncingId: string | null;
  waypoints: GpsWaypoint[];
  onSyncConnector: (connector: McpConnectorItem) => void;
  onToggleConnector: (id: string) => void;
  onAddConnector: (connector: Omit<McpConnectorItem, 'id'>) => void;
  onDeleteConnector: (id: string) => void;
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

export const PluginStoreSectionView: React.FC<PluginStoreSectionViewProps> = ({
  connectors,
  recentExtracted,
  isSyncingId,
  waypoints,
  onSyncConnector,
  onToggleConnector,
  onAddConnector,
  onDeleteConnector,
  onPushWhatsAppCheckin,
  onAddWaypoint,
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'gps' | 'whatsapp' | 'custom'>('all');

  // WhatsApp Quick Check-In state
  const [waHour, setWaHour] = useState<number>(14);
  const [waActivity, setWaActivity] = useState<string>(
    'Replaced afternoon drift with 25m outdoor walking sync + sprint planning'
  );
  const [waScreen, setWaScreen] = useState<number>(15);
  const [waMotion, setWaMotion] = useState<MotionState>('walking');
  const [waFeedback, setWaFeedback] = useState<string | null>(null);

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

  // Add Custom MCP state
  const [customName, setCustomName] = useState<string>('');
  const [customProvider, setCustomProvider] = useState<McpProviderType>('custom_mcp');
  const [customEndpoint, setCustomEndpoint] = useState<string>('http://localhost:8090/mcp');
  const [customError, setCustomError] = useState<string | null>(null);

  const gpsSummary = summarizeGpsTrajectory(waypoints);

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
    setWaFeedback(`Dispatched WhatsApp check-in to hour ${formatHourLabel(waHour)}.`);
    setTimeout(() => setWaFeedback(null), 4000);
  };

  const handleCustomMcpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);
    const cleanName = sanitizeTextInput(customName, 80);
    if (!cleanName) {
      setCustomError('Plugin name is required.');
      return;
    }
    const urlCheck = validateSafeEndpointUrl(customEndpoint);
    if (!urlCheck.valid) {
      setCustomError(urlCheck.error || 'Invalid MCP endpoint URL.');
      return;
    }
    onAddConnector({
      name: cleanName,
      provider: customProvider,
      endpointUrl: urlCheck.sanitizedUrl,
      description: 'Custom open-source MCP server extracting developer & screen telemetry.',
      enabled: true,
      lastSyncedAt: 'Ready to sync',
      monitoredMetrics: ['Custom MCP Stream', 'Hourly Activity'],
    });
    setCustomName('');
    setActiveFilter('all');
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      {/* Header & Filter Bar (ChatGPT Plugin Store Style) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            Plugin Store & MCP Integrations
          </h1>
          <p className="text-xs text-slate-500">
            Connect MiniMe, Codegen, WhatsApp Agent, GPS Maps Grounding, and custom open-source MCP servers
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            All Plugins ({connectors.length + 1})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('gps')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeFilter === 'gps'
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            GPS & Maps Plugin
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('whatsapp')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeFilter === 'whatsapp'
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            WhatsApp Bridge
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('custom')}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeFilter === 'custom'
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Custom MCP
          </button>
        </div>
      </div>

      {/* ChatGPT-Style Plugin Cards Grid */}
      {(activeFilter === 'all' || activeFilter === 'whatsapp') && (
        <section aria-label="Installed MCP Plugins" className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {connectors.map((conn) => {
            const isSyncing = isSyncingId === conn.id;
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
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-800">
                        <IconComponent className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-sm font-semibold text-slate-900">{conn.name}</h2>
                        <div className="font-mono text-[11px] text-slate-400">
                          {conn.endpointUrl}
                        </div>
                      </div>
                    </div>

                    {/* Plugin Toggle Button */}
                    <button
                      type="button"
                      onClick={() => onToggleConnector(conn.id)}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors shrink-0 ${
                        conn.enabled
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}
                    >
                      {conn.enabled && <Check className="h-3 w-3" />}
                      {conn.enabled ? 'Installed' : 'Paused'}
                    </button>
                  </div>

                  <p className="mt-3 text-xs text-slate-600 leading-relaxed">{conn.description}</p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="font-mono tabular-nums text-[11px] text-slate-500">
                    Status: {conn.lastSyncedAt || 'Ready to sync'}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSyncConnector(conn)}
                      disabled={isSyncing}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
                      {isSyncing ? 'Syncing...' : 'Pull Telemetry'}
                    </button>
                    {!['mcp-minime', 'mcp-codegen', 'mcp-whatsapp'].includes(conn.id) && (
                      <button
                        type="button"
                        onClick={() => onDeleteConnector(conn.id)}
                        aria-label={`Remove ${conn.name}`}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-red-600"
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
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-800">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      GPS Trajectory & Google Maps Grounding
                    </h2>
                    <div className="font-mono text-[11px] text-slate-400">
                      navigator.geolocation + Maps Grounding
                    </div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
                  <Check className="h-3 w-3" />
                  Installed
                </span>
              </div>

              <p className="mt-3 text-xs text-slate-600 leading-relaxed">
                Tracks where you go throughout the day via GPS coordinates and grounds nearby focus spots, libraries, and recovery walks with Google Maps.
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="font-mono tabular-nums text-[11px] text-slate-500">
                {gpsSummary.locationsVisited} stops · {gpsSummary.totalDistanceKm} km today
              </span>
              <div className="flex items-center gap-2">
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
                Where you went today ({gpsSummary.locationsVisited} stops, {gpsSummary.totalDistanceKm} km) and grounded nearby recommendations
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
          <h2 className="text-sm font-semibold text-slate-900">
            WhatsApp Personal Agent Bridge
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Send a message from your WhatsApp Agent or webhook (`POST /api/mcp/ingest`) to log an hour directly
          </p>

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
                Push WhatsApp
              </button>
            </div>
          </form>

          {waFeedback && (
            <p className="mt-2.5 text-xs font-medium text-emerald-700">{waFeedback}</p>
          )}
        </section>
      )}

      {/* Install Custom Open-Source MCP Server */}
      {(activeFilter === 'all' || activeFilter === 'custom') && (
        <section
          aria-label="Add Custom Open-Source MCP Plugin"
          className="rounded-2xl border border-slate-200 bg-white p-6"
        >
          <h2 className="text-sm font-semibold text-slate-900">
            Install Custom Open-Source MCP Plugin
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Connect any self-hosted MCP server (ActivityWatch, WakaTime, local MiniMe daemon, or custom webhook)
          </p>

          <form onSubmit={handleCustomMcpSubmit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="sm:col-span-4">
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Plugin name (e.g., ActivityWatch MCP)"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900"
              />
            </div>
            <div className="sm:col-span-3">
              <select
                value={customProvider}
                onChange={(e) => setCustomProvider(e.target.value as McpProviderType)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900"
              >
                <option value="custom_mcp">Open-Source MCP</option>
                <option value="minime">MiniMe Watcher</option>
                <option value="codegen">Codegen Agent</option>
                <option value="whatsapp">WhatsApp Agent</option>
              </select>
            </div>
            <div className="sm:col-span-3">
              <input
                type="text"
                value={customEndpoint}
                onChange={(e) => setCustomEndpoint(e.target.value)}
                placeholder="http://localhost:8090/mcp"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-mono text-xs text-slate-900"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="w-full rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
              >
                Install Plugin
              </button>
            </div>
          </form>
          {customError && (
            <p role="alert" className="mt-2.5 text-xs font-medium text-red-600">
              {customError}
            </p>
          )}
        </section>
      )}

      {/* Live Extracted Plugin Activity Log */}
      {recentExtracted.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <h3 className="text-xs font-semibold text-slate-900">
            Latest Telemetry Pulled from Plugins ({recentExtracted.length})
          </h3>
          <div className="divide-y divide-slate-100">
            {recentExtracted.map((b, i) => (
              <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono tabular-nums font-semibold text-slate-900 mr-2">
                    {formatHourLabel(b.hour)}
                  </span>
                  <span className="font-medium text-slate-800">{b.activity}</span>
                  <span className="ml-2 text-slate-400">({b.sourceAgent})</span>
                </div>
                <span className="font-mono tabular-nums text-slate-600">
                  {b.productiveScreenMinutes}m/{b.screenMinutes}m
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
