import React, { useState } from 'react';
import {
  COGNITIVE_STATE_META,
  MOTION_STATE_META,
  computeTenPointEfficiencyScale,
  formatHourLabel,
  type CognitiveState,
  type DailyCognitiveAnalytics,
  type DailyGoalItem,
  type DayTemplate,
  type HourlyEntry,
  type MotionState,
} from '../utils/cognitiveEngine';
import { HourlyEnergyMotionHeatmap } from './HourlyEnergyMotionHeatmap';
import { WeeklyCognitiveTrendChart } from './WeeklyCognitiveTrendChart';
import { FocusTimerView } from './FocusTimerView';
import { GoalsAndTemplatesView } from './GoalsAndTemplatesView';
import { Gauge, Plus, Timer, Sliders, Sparkles } from 'lucide-react';

interface ScaleSectionViewProps {
  entries: HourlyEntry[];
  allEntries?: HourlyEntry[];
  goals: DailyGoalItem[];
  analytics: DailyCognitiveAnalytics;
  gpsLocationsCount: number;
  selectedDate: string;
  activeTemplateId: string | null;
  onSelectDate?: (dateKey: string) => void;
  onEditHour: (hour: number, existing?: HourlyEntry) => void;
  onQuickUpdateEnergy: (entry: HourlyEntry, newEnergy: number) => void;
  onQuickAddEntry: (entry: {
    hour: number;
    activity: string;
    cognitiveState: CognitiveState;
    screenMinutes: number;
    motionState: MotionState;
  }) => void;
  onSaveTimerSession: (entry: Omit<HourlyEntry, 'id'>) => void;
  onAddGoal: (goal: Omit<DailyGoalItem, 'id'>) => void;
  onToggleGoal: (id: string) => void;
  onIncrementGoal: (id: string, delta: number) => void;
  onDeleteGoal: (id: string) => void;
  onApplyTemplate: (template: DayTemplate) => void;
}

export const ScaleSectionView: React.FC<ScaleSectionViewProps> = ({
  entries,
  allEntries,
  goals,
  analytics,
  gpsLocationsCount,
  selectedDate,
  activeTemplateId,
  onSelectDate,
  onEditHour,
  onQuickUpdateEnergy,
  onQuickAddEntry,
  onSaveTimerSession,
  onAddGoal,
  onToggleGoal,
  onIncrementGoal,
  onDeleteGoal,
  onApplyTemplate,
}) => {
  const [subView, setSubView] = useState<'scale' | 'timer' | 'goals'>('scale');
  const [showFull24Hours, setShowFull24Hours] = useState<boolean>(false);
  const [quickHour, setQuickHour] = useState<number>(18);
  const [quickActivity, setQuickActivity] = useState<string>('');
  const [quickState, setQuickState] = useState<CognitiveState>('deep_focus');
  const [quickMotion, setQuickMotion] = useState<MotionState>('standing');
  const [quickScreen, setQuickScreen] = useState<number>(45);

  const scaleMetrics = computeTenPointEfficiencyScale(analytics, goals, gpsLocationsCount);
  const sortedEntries = [...entries].sort((a, b) => a.hour - b.hour);

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickActivity.trim()) return;
    onQuickAddEntry({
      hour: quickHour,
      activity: quickActivity.trim(),
      cognitiveState: quickState,
      screenMinutes: quickScreen,
      motionState: quickMotion,
    });
    setQuickActivity('');
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      {/* Sub-navigation bar inside Scale Section */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            Efficiency Scale & Hourly Heatmap
          </h1>
          <p className="text-xs text-slate-500">
            1–10 cognitive efficiency rating, dual-track energy & motion heatmap, and hourly calibration
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubView('scale')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              subView === 'scale'
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Gauge className="h-3.5 w-3.5" />
            1–10 Scale & Heatmap
          </button>
          <button
            type="button"
            onClick={() => setSubView('timer')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              subView === 'timer'
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Timer className="h-3.5 w-3.5" />
            Focus Timer
          </button>
          <button
            type="button"
            onClick={() => setSubView('goals')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              subView === 'goals'
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            Goals & Templates
          </button>
        </div>
      </div>

      {subView === 'timer' && (
        <FocusTimerView dateKey={selectedDate} onLogCompletedSession={onSaveTimerSession} />
      )}

      {subView === 'goals' && (
        <GoalsAndTemplatesView
          goals={goals}
          activeTemplateId={activeTemplateId}
          onAddGoal={onAddGoal}
          onToggleGoal={onToggleGoal}
          onIncrementGoal={onIncrementGoal}
          onDeleteGoal={onDeleteGoal}
          onApplyTemplate={onApplyTemplate}
        />
      )}

      {subView === 'scale' && (
        <>
          {/* 1-to-10 Efficiency Scale Card */}
          <section
            aria-label="1 to 10 Daily Efficiency Scale"
            className="rounded-2xl border border-slate-200 bg-white p-6"
          >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:items-center">
              <div className="md:col-span-5 border-b border-slate-100 pb-4 md:border-b-0 md:border-r md:pb-0 md:pr-6">
                <div className="text-xs font-medium text-slate-500">
                  Overall Daily Efficiency Scale
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-mono tabular-nums text-4xl font-bold text-slate-900">
                    {scaleMetrics.overallScale.toFixed(1)}
                  </span>
                  <span className="font-mono tabular-nums text-lg text-slate-400">/ 10.0</span>
                </div>
                <div className="mt-2 text-xs font-medium text-emerald-700">
                  {scaleMetrics.verdictLabel}
                </div>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                  Computed from {analytics.productiveHoursCount}h productive peak/flow vs.{' '}
                  {analytics.unproductiveHoursCount}h cognitive drain, {analytics.screenEfficiencyPct}% screen efficiency, and{' '}
                  {analytics.totalSteps.toLocaleString()} steps.
                </p>
              </div>

              {/* 4 Sub-Scale Bars (1.0 - 10.0) */}
              <div className="md:col-span-7 space-y-3.5">
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">
                      Cognitive Focus Scale ({analytics.overallCognitiveIndex}pt index)
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {scaleMetrics.focusScale.toFixed(1)} / 10
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-900 transition-all"
                      style={{ width: `${Math.min(100, scaleMetrics.focusScale * 10)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">
                      Screen Hygiene Scale ({analytics.productiveScreenMinutes}m productive / {analytics.totalScreenMinutes}m total)
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {scaleMetrics.screenHygieneScale.toFixed(1)} / 10
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all"
                      style={{ width: `${Math.min(100, scaleMetrics.screenHygieneScale * 10)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">
                      Motion & GPS Scale ({analytics.totalSteps.toLocaleString()} steps · {gpsLocationsCount} GPS stops)
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {scaleMetrics.motionScale.toFixed(1)} / 10
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-sky-600 transition-all"
                      style={{ width: `${Math.min(100, scaleMetrics.motionScale * 10)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">
                      Daily Goals Scale ({goals.filter((g) => g.completed).length}/{goals.length} completed)
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {scaleMetrics.goalScale.toFixed(1)} / 10
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all"
                      style={{ width: `${Math.min(100, scaleMetrics.goalScale * 10)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Weekly Cognitive Trend (Recharts 7-Day deep_focus vs distracted progression) */}
          <WeeklyCognitiveTrendChart
            allEntries={allEntries ?? entries}
            referenceDateKey={selectedDate}
            onSelectDate={onSelectDate}
          />

          {/* Dual-Track 24-Hour Energy & Motion Intensity Heatmap */}
          <div className="space-y-2">
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowFull24Hours((prev) => !prev)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {showFull24Hours ? 'Show 16h Waking Window (07:00–22:00)' : 'Show Full 24h Day (00:00–23:00)'}
              </button>
            </div>
            <HourlyEnergyMotionHeatmap
              entries={entries}
              showFull24Hours={showFull24Hours}
              onSelectHour={(hr) => {
                const found = entries.find((e) => e.hour === hr);
                onEditHour(hr, found);
              }}
            />
          </div>

          {/* Interactive Hourly Scale Calibration Table + Quick-Add Activity */}
          <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Daily Activity & Energy Calibration ({sortedEntries.length} sessions)
                </h2>
                <p className="text-xs text-slate-500">
                  Click any 1–5 energy rating to recalibrate your daily efficiency scale or add an hour below
                </p>
              </div>
              <button
                type="button"
                onClick={() => onEditHour(new Date().getHours())}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Log Hour Block
              </button>
            </div>

            {/* Quick-Add Inline Activity Form */}
            <form
              onSubmit={handleQuickSubmit}
              className="grid grid-cols-1 gap-2.5 border-b border-slate-100 bg-slate-50/70 px-5 py-3 sm:grid-cols-12"
            >
              <div className="sm:col-span-2">
                <select
                  aria-label="Quick add hour"
                  value={quickHour}
                  onChange={(e) => setQuickHour(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono tabular-nums text-xs text-slate-900"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {formatHourLabel(h)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-4">
                <input
                  type="text"
                  value={quickActivity}
                  onChange={(e) => setQuickActivity(e.target.value)}
                  placeholder="Quick-add activity for this hour..."
                  aria-label="Quick add activity description"
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400"
                />
              </div>
              <div className="sm:col-span-2">
                <select
                  aria-label="Quick add cognitive state"
                  value={quickState}
                  onChange={(e) => setQuickState(e.target.value as CognitiveState)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
                >
                  {(Object.keys(COGNITIVE_STATE_META) as CognitiveState[]).map((k) => (
                    <option key={k} value={k}>
                      {COGNITIVE_STATE_META[k].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <select
                  aria-label="Quick add motion state"
                  value={quickMotion}
                  onChange={(e) => setQuickMotion(e.target.value as MotionState)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
                >
                  {(Object.keys(MOTION_STATE_META) as MotionState[]).map((m) => (
                    <option key={m} value={m}>
                      {MOTION_STATE_META[m].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2 flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={quickScreen}
                  onChange={(e) => setQuickScreen(Number(e.target.value))}
                  aria-label="Quick add screen minutes"
                  className="w-14 rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-mono tabular-nums text-xs text-slate-900"
                />
                <button
                  type="submit"
                  className="w-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
                >
                  Add
                </button>
              </div>
            </form>

            <div className="divide-y divide-slate-200">
              {sortedEntries.map((entry) => {
                const hrScore = analytics.hourlyScores[entry.hour];
                return (
                  <div
                    key={entry.id}
                    className="flex flex-col justify-between gap-3 px-5 py-3.5 hover:bg-slate-50/70 transition-colors sm:flex-row sm:items-center"
                  >
                    <div className="flex items-start gap-3.5">
                      <span className="font-mono tabular-nums text-xs font-bold text-slate-900 pt-0.5">
                        {formatHourLabel(entry.hour)}
                      </span>
                      <div>
                        <div className="text-xs font-semibold text-slate-900">{entry.activity}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {COGNITIVE_STATE_META[entry.cognitiveState].label} · Screen{' '}
                          <span className="font-mono tabular-nums">
                            {entry.productiveScreenMinutes}m/{entry.screenMinutes}m
                          </span>{' '}
                          · {MOTION_STATE_META[entry.motionState].label} (
                          <span className="font-mono tabular-nums">
                            {entry.stepsCount.toLocaleString()}
                          </span>{' '}
                          steps)
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      {/* 1-5 Energy Scale Quick Selector */}
                      <div className="flex items-center gap-1" aria-label={`Energy scale for ${formatHourLabel(entry.hour)}`}>
                        <span className="mr-1 text-[11px] text-slate-400">Energy:</span>
                        {[1, 2, 3, 4, 5].map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => onQuickUpdateEnergy(entry, lvl)}
                            className={`h-6 w-6 rounded font-mono tabular-nums text-[11px] font-medium transition-colors ${
                              entry.energyLevel === lvl
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>

                      <div className="text-right min-w-[110px]">
                        <span
                          className={`font-mono tabular-nums text-xs font-semibold ${
                            hrScore?.classification === 'Productive Peak'
                              ? 'text-emerald-700'
                              : hrScore?.classification === 'Cognitive Drain'
                              ? 'text-amber-700'
                              : 'text-slate-700'
                          }`}
                        >
                          {hrScore?.score ?? 0}pt
                        </span>
                        <span className="ml-1.5 text-[11px] text-slate-500">
                          {hrScore?.classification}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onEditHour(entry.hour, entry)}
                        className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
};
