import React, { useState } from 'react';
import {
  COGNITIVE_STATE_META,
  MOTION_STATE_META,
  formatHourLabel,
  type CognitiveState,
  type DailyCognitiveAnalytics,
  type HourlyEntry,
  type MotionState,
} from '../utils/cognitiveEngine';
import { Plus, RefreshCw } from 'lucide-react';
import { HourlyEnergyMotionHeatmap } from './HourlyEnergyMotionHeatmap';

interface HourlyMatrixViewProps {
  entries: HourlyEntry[];
  analytics: DailyCognitiveAnalytics;
  onEditHour: (hour: number, existing?: HourlyEntry) => void;
  onQuickAddEntry: (entry: {
    hour: number;
    activity: string;
    cognitiveState: CognitiveState;
    screenMinutes: number;
    motionState: MotionState;
  }) => void;
  onQuickSyncMiniMe: () => void;
  isSyncingMiniMe: boolean;
}

export const HourlyMatrixView: React.FC<HourlyMatrixViewProps> = ({
  entries,
  analytics,
  onEditHour,
  onQuickAddEntry,
  onQuickSyncMiniMe,
  isSyncingMiniMe,
}) => {
  const [displayMode, setDisplayMode] = useState<'stream' | 'grid24'>('stream');
  const [filterState, setFilterState] = useState<'all' | 'productive' | 'drain'>('all');

  // Calm 1-Line Quick Log Bar State
  const [quickHour, setQuickHour] = useState<number>(18);
  const [quickActivity, setQuickActivity] = useState<string>('');
  const [quickCognitive, setQuickCognitive] = useState<CognitiveState>('deep_focus');
  const [quickMotion, setQuickMotion] = useState<MotionState>('standing');
  const [quickScreen, setQuickScreen] = useState<number>(45);

  const entryByHour = new Map<number, HourlyEntry>();
  for (const item of entries) {
    entryByHour.set(item.hour, item);
  }

  const filteredEntries = entries
    .filter((entry) => {
      const scoreObj = analytics.hourlyScores[entry.hour];
      if (filterState === 'productive') {
        return (
          scoreObj?.classification === 'Productive Peak' ||
          scoreObj?.classification === 'Effective Flow'
        );
      }
      if (filterState === 'drain') {
        return scoreObj?.classification === 'Cognitive Drain';
      }
      return true;
    })
    .sort((a, b) => a.hour - b.hour);

  const handleQuickLogSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickActivity.trim()) return;
    onQuickAddEntry({
      hour: quickHour,
      activity: quickActivity.trim(),
      cognitiveState: quickCognitive,
      screenMinutes: quickScreen,
      motionState: quickMotion,
    });
    setQuickActivity('');
  };

  return (
    <div className="space-y-8">
      {/* Calm, Minimal 3-Metric Summary Bar */}
      <section aria-label="Daily Cognitive & Screen Telemetry Summary">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium text-slate-500">
              Daily Focus Score · {analytics.totalTrackedHours} hrs tracked
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold font-mono tabular-nums text-slate-900">
                {analytics.overallCognitiveIndex}
                <span className="text-base font-normal text-slate-400">/100</span>
              </span>
              <span className="text-xs font-mono tabular-nums text-emerald-700 font-medium">
                {analytics.productiveHoursCount}h productive · {analytics.unproductiveHoursCount}h drain
              </span>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Peak hour:{' '}
              <span className="font-mono tabular-nums font-medium text-slate-800">
                {analytics.peakHour !== null ? formatHourLabel(analytics.peakHour) : '—'}
              </span>{' '}
              · {analytics.chronotypeWindow}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium text-slate-500">
              Screen Intentionality (MiniMe Monitored)
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold font-mono tabular-nums text-slate-900">
                {analytics.screenEfficiencyPct}%
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-600">
                {analytics.productiveScreenMinutes}m productive / {analytics.totalScreenMinutes}m
              </span>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Passive screen drift:{' '}
              <span
                className={`font-mono tabular-nums font-medium ${
                  analytics.passiveScreenMinutes > 45 ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {analytics.passiveScreenMinutes} mins
              </span>{' '}
              today
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium text-slate-500">
              Physical Motion & Steps
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold font-mono tabular-nums text-slate-900">
                {analytics.totalSteps.toLocaleString()}
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-600">
                {analytics.activeMotionHours} active hrs
              </span>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {analytics.sedentaryStreakWarning
                ? '3+ hrs continuous sitting — take a 10m walk'
                : 'Healthy posture alternation maintained'}
            </p>
          </div>
        </div>
      </section>

      {/* Notion-Style Simple Quick Capture Bar */}
      <section
        aria-label="Quick Hourly Capture"
        className="rounded-xl border border-slate-200 bg-white p-4"
      >
        <form
          onSubmit={handleQuickLogSubmit}
          className="flex flex-col gap-3 lg:flex-row lg:items-center"
        >
          <select
            aria-label="Quick log hour"
            value={quickHour}
            onChange={(e) => setQuickHour(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono tabular-nums font-medium text-slate-900 focus:border-slate-900 focus:outline-none shrink-0"
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>
                {formatHourLabel(i)}
              </option>
            ))}
          </select>

          <input
            type="text"
            aria-label="What did you focus on this hour?"
            value={quickActivity}
            onChange={(e) => setQuickActivity(e.target.value)}
            placeholder="Quick log: What did you do this hour? (or click Sync MiniMe to auto-fill)"
            className="w-full flex-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
          />

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              aria-label="Quick cognitive state"
              value={quickCognitive}
              onChange={(e) => setQuickCognitive(e.target.value as CognitiveState)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-800 focus:border-slate-900 focus:outline-none"
            >
              {(Object.keys(COGNITIVE_STATE_META) as CognitiveState[]).map((k) => (
                <option key={k} value={k}>
                  {COGNITIVE_STATE_META[k].label}
                </option>
              ))}
            </select>

            <select
              aria-label="Quick motion posture"
              value={quickMotion}
              onChange={(e) => setQuickMotion(e.target.value as MotionState)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-800 focus:border-slate-900 focus:outline-none"
            >
              {(Object.keys(MOTION_STATE_META) as MotionState[]).map((k) => (
                <option key={k} value={k}>
                  {MOTION_STATE_META[k].label}
                </option>
              ))}
            </select>

            <input
              type="number"
              aria-label="Screen minutes"
              min={0}
              max={60}
              value={quickScreen}
              onChange={(e) => setQuickScreen(Number(e.target.value))}
              className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
              title="Screen minutes (0-60)"
            />

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Save Hour
            </button>

            <button
              type="button"
              onClick={onQuickSyncMiniMe}
              disabled={isSyncingMiniMe}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncingMiniMe ? 'animate-spin' : ''}`} />
              {isSyncingMiniMe ? 'Syncing...' : 'Sync MiniMe'}
            </button>
          </div>
        </form>
      </section>

      {/* Visual Energy & Motion State Intensity Heatmap */}
      <HourlyEnergyMotionHeatmap
        entries={entries}
        showFull24Hours={displayMode === 'grid24'}
        onSelectHour={onEditHour}
      />

      {/* Clean Unified Daily Timeline (Toggleable between Clean Stream and 24-Hour Slot Grid so it never feels cluttered) */}
      <section
        aria-label="Daily Cognitive Timeline"
        className="rounded-xl border border-slate-200 bg-white"
      >
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Daily Cognitive & Screen Timeline
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Organized hourly breakdown of what you did, screen efficiency, and MiniMe coaching
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Filter hours"
              className="flex items-center gap-1 rounded-lg bg-slate-100 p-1"
            >
              <button
                type="button"
                onClick={() => setFilterState('all')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  filterState === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({entries.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterState('productive')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  filterState === 'productive'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Productive ({analytics.productiveHoursCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterState('drain')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  filterState === 'drain'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Drain ({analytics.unproductiveHoursCount})
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                setDisplayMode((prev) => (prev === 'stream' ? 'grid24' : 'stream'))
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              {displayMode === 'stream' ? 'Show All 24h Slots' : 'Show Clean Stream'}
            </button>
          </div>
        </div>

        {displayMode === 'grid24' ? (
          <div className="p-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 24 }, (_, hr) => {
              const entry = entryByHour.get(hr);
              const scoreData = analytics.hourlyScores[hr];
              const score = scoreData?.score ?? null;
              return (
                <button
                  key={hr}
                  type="button"
                  onClick={() => onEditHour(hr, entry)}
                  className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-3.5 text-left hover:border-slate-400 transition-colors"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-mono tabular-nums font-semibold text-slate-900">
                      {formatHourLabel(hr)}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-slate-600">
                      {score !== null ? `${score}pt · ${scoreData?.classification}` : '+ Log'}
                    </span>
                  </div>
                  <div className="mt-2 truncate text-xs text-slate-700">
                    {entry ? entry.activity : 'Open hour slot'}
                  </div>
                </button>
              );
            })}
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No hours match this filter. Use the quick capture bar above or click Sync MiniMe.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredEntries.map((entry) => {
              const evaluation = analytics.hourlyScores[entry.hour];
              const verdictColor =
                evaluation?.classification === 'Productive Peak'
                  ? 'text-emerald-700 font-semibold'
                  : evaluation?.classification === 'Effective Flow'
                  ? 'text-sky-700 font-medium'
                  : evaluation?.classification === 'Cognitive Drain'
                  ? 'text-amber-700 font-semibold'
                  : 'text-slate-600';

              return (
                <div
                  key={entry.id}
                  className="flex flex-col justify-between gap-3 px-6 py-4 hover:bg-slate-50/70 transition-colors sm:flex-row sm:items-center"
                >
                  <div className="flex items-start gap-4">
                    <span className="mt-0.5 text-sm font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatHourLabel(entry.hour)}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-slate-900">{entry.activity}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">
                          {COGNITIVE_STATE_META[entry.cognitiveState].label}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Screen {entry.productiveScreenMinutes}m/{entry.screenMinutes}m
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {MOTION_STATE_META[entry.motionState].label} ({entry.stepsCount.toLocaleString()} steps)
                        </span>
                      </div>
                      {entry.notes && (
                        <div className="mt-1 text-xs text-slate-500">{entry.notes}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                    <div className="text-right text-xs">
                      <span className={verdictColor}>{evaluation?.classification}</span>
                      <span aria-hidden="true" className="mx-1.5 text-slate-300">
                        ·
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {evaluation?.score ?? 0}pt
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onEditHour(entry.hour, entry)}
                      aria-label={`Edit hour ${formatHourLabel(entry.hour)}`}
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
