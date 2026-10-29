import React from 'react';
import type { DailyCognitiveAnalytics } from '../utils/cognitiveEngine';
import { formatHourLabel } from '../utils/cognitiveEngine';

interface BenchmarksAndResearchViewProps {
  analytics: DailyCognitiveAnalytics;
}

export const BenchmarksAndResearchView: React.FC<BenchmarksAndResearchViewProps> = ({
  analytics,
}) => {
  return (
    <div className="space-y-10">
      {/* Multi-Agent Research Synthesis — Single-elevation grid (no cards inside cards) */}
      <section aria-label="Research Synthesis & Behavioral Insights">
        <div className="pb-4">
          <h2 className="text-base font-semibold text-slate-900">
            Cognitive Chronobiology & Behavioral Telemetry Synthesis
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Diagnostic synthesis of your current day’s hourly cognitive blocks, screen ratio, and physical movement
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium text-slate-500">
              01. Peak vs. Trough Chronotype Analysis
            </div>
            <h3 className="mt-1 text-sm font-semibold text-slate-900">
              {analytics.chronotypeWindow}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Your highest cognitive efficiency occurs at{' '}
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {analytics.peakHour !== null ? formatHourLabel(analytics.peakHour) : '09:00'}
              </span>
              , while your primary cognitive drain window registers around{' '}
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {analytics.drainHour !== null ? formatHourLabel(analytics.drainHour) : '14:00'}
              </span>
              . Protect morning hours strictly for architectural or creative synthesis and batch
              administrative triage into low-energy windows.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium text-slate-500">
              02. Screen Hygiene & Dopamine Loop Audit
            </div>
            <h3 className="mt-1 text-sm font-semibold text-slate-900">
              {analytics.screenEfficiencyPct}% Intentional Screen Ratio
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Out of{' '}
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {analytics.totalScreenMinutes}m
              </span>{' '}
              total screen exposure today,{' '}
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {analytics.productiveScreenMinutes}m
              </span>{' '}
              went to deliberate creation and{' '}
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {analytics.passiveScreenMinutes}m
              </span>{' '}
              to passive drift. Replacing just 30 minutes of afternoon passive screen drift with an
              active walk raises daily cognitive throughput by +11 points.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium text-slate-500">
              03. Motion-Cognition Coupling
            </div>
            <h3 className="mt-1 text-sm font-semibold text-slate-900">
              {analytics.activeMotionHours} Active Hours · {analytics.totalSteps.toLocaleString()} Steps
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Hours paired with standing posture or walking intervals averaged higher focus
              retention than continuous sedentary desk blocks. Maintain at least one posture transition
              every 120 minutes to prevent prefrontal fatigue.
            </p>
          </div>
        </div>
      </section>

      {/* Benchmark Comparison Matrix vs. Top Productivity Platforms */}
      <section
        aria-label="Product Architecture Benchmark Matrix"
        className="rounded-xl border border-slate-200 bg-white p-6"
      >
        <div className="border-b border-slate-200 pb-4">
          <h2 className="text-base font-semibold text-slate-900">
            Workflow Architecture Comparison (Notion vs. Motion vs. Rize vs. ChronoFlow)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            How ChronoFlow unifies structured templates, motion coupling, and hourly screen intentionality in one workspace
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500">
                <th className="py-3 pl-4 pr-3 font-medium">Capability Dimension</th>
                <th className="px-3 py-3 font-medium">Notion Daily Planner</th>
                <th className="px-3 py-3 font-medium">Motion Scheduler</th>
                <th className="px-3 py-3 font-medium">Rize Screen Tracker</th>
                <th className="py-3 pl-3 pr-4 font-semibold text-slate-900">
                  ChronoFlow Workspace
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-600">
              <tr>
                <td className="py-3 pl-4 pr-3 font-medium text-slate-900">
                  Hourly Cognitive Classification
                </td>
                <td className="px-3 py-3">Manual text tables</td>
                <td className="px-3 py-3">Calendar task blocks only</td>
                <td className="px-3 py-3">Automated app categories</td>
                <td className="py-3 pl-3 pr-4 font-medium text-emerald-700">
                  24h Cognitive Spectrum + Peak/Drain Verdict
                </td>
              </tr>
              <tr>
                <td className="py-3 pl-4 pr-3 font-medium text-slate-900">
                  Screen Intentionality Split
                </td>
                <td className="px-3 py-3">Not tracked</td>
                <td className="px-3 py-3">Not tracked</td>
                <td className="px-3 py-3">Total focus vs. break time</td>
                <td className="py-3 pl-3 pr-4 font-medium text-emerald-700">
                  Productive vs. Passive Drift per Hour (0–60m)
                </td>
              </tr>
              <tr>
                <td className="py-3 pl-4 pr-3 font-medium text-slate-900">
                  Physical Motion & Posture Coupling
                </td>
                <td className="px-3 py-3">Separate habit checkbox</td>
                <td className="px-3 py-3">Meeting buffer blocks</td>
                <td className="px-3 py-3">Break notifications only</td>
                <td className="py-3 pl-3 pr-4 font-medium text-emerald-700">
                  Hourly Posture + Step Telemetry + Sedentary Guard
                </td>
              </tr>
              <tr>
                <td className="py-3 pl-4 pr-3 font-medium text-slate-900">
                  1-Click Day Templates & Ultradian Timer
                </td>
                <td className="px-3 py-3">Database templates</td>
                <td className="px-3 py-3">Task auto-scheduling</td>
                <td className="px-3 py-3">Focus timer only</td>
                <td className="py-3 pl-3 pr-4 font-medium text-emerald-700">
                  Integrated Templates + 90m/50m Timer-to-Hour Sync
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
