import React from 'react';
import {
  computeHourlyHeatmapCells,
  type HourlyEntry,
  type HourlyHeatmapCell,
} from '../utils/cognitiveEngine';

interface HourlyEnergyMotionHeatmapProps {
  entries: HourlyEntry[];
  showFull24Hours?: boolean;
  onSelectHour: (hour: number, existing?: HourlyEntry) => void;
}

function getEnergyColorClasses(level: number): string {
  switch (level) {
    case 5:
      return 'bg-emerald-700 text-white border-emerald-800';
    case 4:
      return 'bg-emerald-500 text-white border-emerald-600';
    case 3:
      return 'bg-emerald-200 text-emerald-950 border-emerald-300';
    case 2:
      return 'bg-amber-200 text-amber-950 border-amber-300';
    case 1:
      return 'bg-rose-200 text-rose-950 border-rose-300';
    default:
      return 'bg-slate-100 text-slate-400 border-slate-200';
  }
}

function getMotionColorClasses(intensity: number): string {
  switch (intensity) {
    case 4:
      return 'bg-indigo-700 text-white border-indigo-800';
    case 3:
      return 'bg-sky-600 text-white border-sky-700';
    case 2:
      return 'bg-sky-200 text-sky-950 border-sky-300';
    case 1:
      return 'bg-slate-200 text-slate-800 border-slate-300';
    default:
      return 'bg-slate-100 text-slate-400 border-slate-200';
  }
}

export const HourlyEnergyMotionHeatmap: React.FC<HourlyEnergyMotionHeatmapProps> = ({
  entries,
  showFull24Hours = false,
  onSelectHour,
}) => {
  const allCells = computeHourlyHeatmapCells(entries);
  const visibleCells: HourlyHeatmapCell[] = showFull24Hours
    ? allCells
    : allCells.slice(7, 23); // 07:00 to 22:00 waking telemetry window

  const entryByHour = new Map<number, HourlyEntry>();
  for (const item of entries) {
    entryByHour.set(item.hour, item);
  }

  const peakSynergyCount = allCells.filter((c) => c.couplingStatus === 'Peak Synergy').length;
  const avgEnergy =
    entries.length > 0
      ? (entries.reduce((acc, e) => acc + e.energyLevel, 0) / entries.length).toFixed(1)
      : '0.0';

  return (
    <section
      aria-label="Daily Energy and Motion State Intensity Heatmap"
      data-testid="energy-motion-heatmap"
      className="rounded-xl border border-slate-200 bg-white p-6"
    >
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Daily Energy & Motion State Intensity Heatmap
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Dual-track hourly matrix pairing subjective cognitive energy (E1–E5) with physical motion intensity (Sedentary to Workout)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 font-mono tabular-nums">
          <span>Mean Energy: {avgEnergy}/5.0</span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="text-emerald-700 font-medium">
            Peak Synergy Hours: {peakSynergyCount}
          </span>
        </div>
      </div>

      {/* Dual-Track Heatmap Grid */}
      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[680px]">
          {/* Hour Header Row */}
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: `130px repeat(${visibleCells.length}, minmax(34px, 1fr))`,
            }}
          >
            <div className="text-xs font-medium text-slate-500 self-end pb-1">
              Telemetry Track
            </div>
            {visibleCells.map((cell) => (
              <div
                key={`hdr-${cell.hour}`}
                className="text-center text-[11px] font-mono tabular-nums font-medium text-slate-600 pb-1"
              >
                {String(cell.hour).padStart(2, '0')}h
              </div>
            ))}
          </div>

          {/* Track 1: Daily Energy Level (1-5) */}
          <div
            className="mt-1.5 grid items-center gap-1.5"
            style={{
              gridTemplateColumns: `130px repeat(${visibleCells.length}, minmax(34px, 1fr))`,
            }}
          >
            <div className="pr-2">
              <div className="text-xs font-semibold text-slate-900">Energy Level</div>
              <div className="text-[11px] text-slate-500">Scale E1–E5</div>
            </div>
            {visibleCells.map((cell) => {
              const colorCls = getEnergyColorClasses(cell.energyLevel);
              return (
                <button
                  key={`energy-${cell.hour}`}
                  type="button"
                  onClick={() => onSelectHour(cell.hour, entryByHour.get(cell.hour))}
                  title={`${cell.hourLabel} · ${cell.energyLabel}`}
                  aria-label={`Hour ${cell.hourLabel} Energy ${cell.energyLabel}`}
                  className={`flex h-9 w-full items-center justify-center rounded-md border text-xs font-mono tabular-nums font-semibold transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-slate-900 ${colorCls}`}
                >
                  {cell.energyCode}
                </button>
              );
            })}
          </div>

          {/* Track 2: Motion State Intensity (L1-L4) */}
          <div
            className="mt-2 grid items-center gap-1.5"
            style={{
              gridTemplateColumns: `130px repeat(${visibleCells.length}, minmax(34px, 1fr))`,
            }}
          >
            <div className="pr-2">
              <div className="text-xs font-semibold text-slate-900">Motion Intensity</div>
              <div className="text-[11px] text-slate-500">Posture & Steps</div>
            </div>
            {visibleCells.map((cell) => {
              const colorCls = getMotionColorClasses(cell.motionIntensity);
              return (
                <button
                  key={`motion-${cell.hour}`}
                  type="button"
                  onClick={() => onSelectHour(cell.hour, entryByHour.get(cell.hour))}
                  title={`${cell.hourLabel} · ${cell.motionLabel}${
                    cell.logged ? ` (${cell.stepsCount} steps)` : ''
                  }`}
                  aria-label={`Hour ${cell.hourLabel} Motion ${cell.motionLabel}`}
                  className={`flex h-9 w-full items-center justify-center rounded-md border text-[11px] font-mono tabular-nums font-semibold transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-slate-900 ${colorCls}`}
                >
                  {cell.motionCode}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Accessible Legend with Explicit Text + Color Swatches */}
      <div className="mt-5 flex flex-col justify-between gap-3 border-t border-slate-200 pt-4 text-xs text-slate-600 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-slate-800">Energy Scale:</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-xs border border-rose-300 bg-rose-200" />
            <span>E1 Depleted</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-xs border border-amber-300 bg-amber-200" />
            <span>E2 Low</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-xs border border-emerald-300 bg-emerald-200" />
            <span>E3 Baseline</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-xs border border-emerald-600 bg-emerald-500" />
            <span>E4 High</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-xs border border-emerald-800 bg-emerald-700" />
            <span>E5 Peak</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-slate-800">Motion Scale:</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-xs border border-slate-300 bg-slate-200" />
            <span>Sed (Sedentary)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-xs border border-sky-300 bg-sky-200" />
            <span>Std (Standing)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-xs border border-sky-700 bg-sky-600" />
            <span>Wlk (Walking)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-xs border border-indigo-800 bg-indigo-700" />
            <span>Wrk (Workout)</span>
          </span>
        </div>
      </div>
    </section>
  );
};
