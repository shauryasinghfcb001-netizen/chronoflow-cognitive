import React, { useState } from 'react';
import {
  formatHourLabel,
  type McpConnectorItem,
  type McpExtractedBlock,
  type McpProviderType,
} from '../utils/cognitiveEngine';
import { RefreshCw, Plus, Trash2, Send, CheckCircle2 } from 'lucide-react';

interface McpIntegrationsViewProps {
  connectors: McpConnectorItem[];
  recentExtracted: McpExtractedBlock[];
  isSyncingId: string | null;
  onSyncConnector: (connector: McpConnectorItem) => Promise<void>;
  onAddConnector: (connector: Omit<McpConnectorItem, 'id'>) => void;
  onDeleteConnector: (id: string) => void;
  onPushWhatsAppCheckin: (payload: {
    hour: number;
    activity: string;
    screenMinutes: number;
    motionState: 'sedentary' | 'standing' | 'walking' | 'workout';
  }) => Promise<void>;
}

const PROVIDER_LABELS: Record<McpProviderType, string> = {
  minime: 'MiniMe Screen & App Monitor',
  codegen: 'Codegen Autonomous Dev Agent',
  whatsapp: 'WhatsApp Agent Bridge',
  custom_mcp: 'Open-Source / Custom MCP Server',
};

export const McpIntegrationsView: React.FC<McpIntegrationsViewProps> = ({
  connectors,
  recentExtracted,
  isSyncingId,
  onSyncConnector,
  onAddConnector,
  onDeleteConnector,
  onPushWhatsAppCheckin,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState<McpProviderType>('custom_mcp');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Quick WhatsApp / Agent Simulator state
  const [waHour, setWaHour] = useState<number>(17);
  const [waActivity, setWaActivity] = useState<string>(
    'WhatsApp Agent Check-in: Completed 45m deep review + 15m evening walk'
  );
  const [waScreenMinutes, setWaScreenMinutes] = useState<number>(40);
  const [waMotion, setWaMotion] = useState<'sedentary' | 'standing' | 'walking' | 'workout'>(
    'walking'
  );
  const [waStatus, setWaStatus] = useState<string | null>(null);

  const handleCreateConnector = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !endpointUrl.trim()) {
      setFormError('Please provide both a server name and an MCP endpoint URL.');
      return;
    }
    setFormError(null);
    onAddConnector({
      name: name.trim(),
      provider,
      endpointUrl: endpointUrl.trim(),
      description:
        description.trim() ||
        'Custom Model Context Protocol server extracting activity & cognitive telemetry.',
      enabled: true,
    });
    setName('');
    setEndpointUrl('');
    setDescription('');
    setShowAddForm(false);
  };

  const handleSendWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waActivity.trim()) return;
    await onPushWhatsAppCheckin({
      hour: waHour,
      activity: waActivity.trim(),
      screenMinutes: waScreenMinutes,
      motionState: waMotion,
    });
    setWaStatus(
      `Ingested into Hour ${formatHourLabel(waHour)} and organized in your Today timeline.`
    );
  };

  return (
    <div className="space-y-8">
      {/* Header & 1-Click Add MCP Server */}
      <section
        aria-label="Connected MCP Servers and Agents"
        className="rounded-xl border border-slate-200 bg-white p-6"
      >
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              MCP & Autonomous Agent Hub (MiniMe · Codegen · WhatsApp)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Extract screen activity, IDE output, and efficiency coaching from MiniMe, Codegen, or any open-source MCP server
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            {showAddForm ? 'Close Form' : 'Add MCP Server'}
          </button>
        </div>

        {/* Add Custom MCP Server Form */}
        {showAddForm && (
          <form
            onSubmit={handleCreateConnector}
            className="mt-5 rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-4"
          >
            {formError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
              >
                {formError}
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="mcp-name-input" className="block text-xs font-medium text-slate-700">
                  Agent / MCP Name
                </label>
                <input
                  id="mcp-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., ActivityWatch Open-Source MCP"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="mcp-provider-select" className="block text-xs font-medium text-slate-700">
                  Protocol Adapter
                </label>
                <select
                  id="mcp-provider-select"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as McpProviderType)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  {(Object.keys(PROVIDER_LABELS) as McpProviderType[]).map((key) => (
                    <option key={key} value={key}>
                      {PROVIDER_LABELS[key]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="mcp-endpoint-input" className="block text-xs font-medium text-slate-700">
                  MCP Endpoint / Webhook URL
                </label>
                <input
                  id="mcp-endpoint-input"
                  type="text"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="http://localhost:5600/mcp"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                aria-label="Connector description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of what this MCP extracts..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Register MCP Connector
              </button>
            </div>
          </form>
        )}

        {/* Active Connectors List */}
        <div className="mt-4 divide-y divide-slate-200">
          {connectors.map((conn) => {
            const syncing = isSyncingId === conn.id;
            return (
              <div
                key={conn.id}
                className="flex flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{conn.name}</span>
                    <span aria-hidden="true" className="text-xs text-slate-300">
                      ·
                    </span>
                    <span className="text-xs text-emerald-700 font-medium">
                      {PROVIDER_LABELS[conn.provider]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{conn.description}</p>
                  <div className="text-[11px] font-mono tabular-nums text-slate-400">
                    Endpoint: {conn.endpointUrl}
                    {conn.lastSyncedAt ? ` · Last synced ${conn.lastSyncedAt}` : ''}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={() => onSyncConnector(conn)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Extracting...' : `Sync ${conn.name.split(' ')[0]}`}
                  </button>
                  {conn.provider === 'custom_mcp' && (
                    <button
                      type="button"
                      onClick={() => onDeleteConnector(conn.id)}
                      aria-label={`Remove ${conn.name}`}
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* MiniMe Screen Telemetry & Efficiency Coaching Feed */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <section
          aria-label="MiniMe Extracted Screen Activity and Efficiency Feed"
          className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6"
        >
          <div className="border-b border-slate-200 pb-4">
            <h2 className="text-base font-semibold text-slate-900">
              MiniMe & Codegen Extracted Activity Stream
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Automatically classifies what you did on screen, detects passive drift, and coaches you to higher efficiency
            </p>
          </div>

          {recentExtracted.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-xs text-slate-500">
                Click <strong>Sync MiniMe</strong> or <strong>Sync Codegen</strong> above to extract your latest window telemetry and efficiency coaching into your timeline.
              </p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-200">
              {recentExtracted.map((block, i) => (
                <div key={`${block.hour}-${i}`} className="py-3.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {formatHourLabel(block.hour)} · {block.sourceAgent}
                    </span>
                    <span className="font-mono tabular-nums text-slate-600">
                      Screen: {block.productiveScreenMinutes}m productive / {block.screenMinutes}m total
                    </span>
                  </div>
                  <div className="text-xs font-medium text-slate-900">{block.activity}</div>
                  <div className="text-[11px] font-mono text-slate-500">
                    Apps monitored: {block.appBreakdown.join(' · ')}
                  </div>
                  <div className="text-xs text-emerald-800 bg-emerald-50/70 rounded-md px-3 py-1.5">
                    {block.efficiencyCoaching}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* WhatsApp Agent Bridge & Webhook Integration */}
        <section
          aria-label="WhatsApp Personal Agent Bridge"
          className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6"
        >
          <div className="border-b border-slate-200 pb-4">
            <h2 className="text-base font-semibold text-slate-900">
              WhatsApp Agent Bridge
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Push hourly updates from your WhatsApp agent via webhook or test an instant agent dispatch below
            </p>
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="font-medium text-slate-800">Webhook Endpoint (POST JSON):</div>
            <div className="mt-1 font-mono text-[11px] text-slate-600 break-all">
              POST /api/mcp/ingest
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Fields: <span className="font-mono">hour, activity, screenMinutes, motionState, stepsCount</span>
            </div>
          </div>

          <form onSubmit={handleSendWhatsApp} className="mt-4 space-y-3">
            <div>
              <label htmlFor="wa-activity-input" className="block text-xs font-medium text-slate-700">
                Simulate / Dispatch WhatsApp Agent Message
              </label>
              <input
                id="wa-activity-input"
                type="text"
                value={waActivity}
                onChange={(e) => setWaActivity(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label htmlFor="wa-hour-select" className="block text-xs font-medium text-slate-700">
                  Hour
                </label>
                <select
                  id="wa-hour-select"
                  value={waHour}
                  onChange={(e) => setWaHour(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  {Array.from({ length: 24 }, (_, idx) => (
                    <option key={idx} value={idx}>
                      {formatHourLabel(idx)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="wa-screen-input" className="block text-xs font-medium text-slate-700">
                  Screen (m)
                </label>
                <input
                  id="wa-screen-input"
                  type="number"
                  min={0}
                  max={60}
                  value={waScreenMinutes}
                  onChange={(e) => setWaScreenMinutes(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="wa-motion-select" className="block text-xs font-medium text-slate-700">
                  Motion
                </label>
                <select
                  id="wa-motion-select"
                  value={waMotion}
                  onChange={(e) =>
                    setWaMotion(
                      e.target.value as 'sedentary' | 'standing' | 'walking' | 'workout'
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  <option value="walking">Walking</option>
                  <option value="standing">Standing</option>
                  <option value="workout">Workout</option>
                  <option value="sedentary">Sedentary</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              Dispatch via WhatsApp MCP Bridge
            </button>

            {waStatus && (
              <div
                role="status"
                className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>{waStatus}</span>
              </div>
            )}
          </form>
        </section>
      </div>
    </div>
  );
};
