import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  buildWeeklyCognitiveTrend,
  type HourlyEntry,
} from '../utils/cognitiveEngine';
import { TrendingUp, BarChart3, Activity } from 'lucide-react';

interface WeeklyCognitiveTrendChartProps {
  allEntries: HourlyEntry[];
  referenceDateKey: string;
  onSelectDate?: (dateKey: string) => void;
}

export const WeeklyCognitiveTrendChart: React.FC<WeeklyCognitiveTrendChartProps> = ({
  allEntries,
  referenceDateKey,
  onSelectDate,
}) => {
  const [chartType, setChartType] = useState<'area' | 'bar'>('area');

  const trendSummary = useMemo(
    () => buildWeeklyCognitiveTrend(allEntries, referenceDateKey, true),
    [allEntries, referenceDateKey]
  );

  return (
    <section
      aria-label="Weekly Cognitive Trend"
      className="rounded-2xl border border-slate-200 bg-white p-6"
    >
      {/* Header & Controls */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-900">
              Weekly Cognitive Trend (Last 7 Days)
            </h2>
            <span
              className={`rounded-md px-2 py-0.5 font-mono tabular-nums text-[11px] font-medium ${
                trendSummary.trendDirection === 'improving'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : trendSummary.trendDirection === 'declining'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {trendSummary.progressionDeltaHours >= 0 ? '+' : ''}
              {trendSummary.progressionDeltaHours}h net focus progression
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Progression of <code className="font-mono text-emerald-700">deep_focus</code> vs.{' '}
            <code className="font-mono text-amber-700">distracted</code> hours across the 7-day window ending{' '}
            <span className="font-mono tabular-nums text-slate-700">{referenceDateKey}</span>
          </p>
        </div>

        {/* Chart Mode Toggle */}
        <div className="inline-flex items-center rounded-xl bg-slate-100 p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setChartType('area')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              chartType === 'area'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            Progression Curve
          </button>
          <button
            type="button"
            onClick={() => setChartType('bar')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              chartType === 'bar'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Grouped Bars
          </button>
        </div>
      </div>

      {/* 4 KPI Strip */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500">7d Deep Focus</div>
          <div className="mt-0.5 font-mono tabular-nums text-lg font-bold text-emerald-700">
            {trendSummary.totalDeepFocusHours}h
            <span className="ml-1.5 text-xs font-normal text-slate-500">
              ({trendSummary.avgDeepFocusPerDay}h/day)
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500">7d Distracted</div>
          <div className="mt-0.5 font-mono tabular-nums text-lg font-bold text-amber-700">
            {trendSummary.totalDistractedHours}h
            <span className="ml-1.5 text-xs font-normal text-slate-500">
              ({trendSummary.avgDistractedPerDay}h/day)
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500">Focus vs. Drift Ratio</div>
          <div className="mt-0.5 font-mono tabular-nums text-lg font-bold text-slate-900">
            {trendSummary.focusVsDistractedRatio}x
            <span className="ml-1.5 text-xs font-normal text-slate-500">deep : distracted</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500">Today ({referenceDateKey.slice(5)})</div>
          <div className="mt-0.5 font-mono tabular-nums text-lg font-bold text-slate-900">
            {trendSummary.days[6]?.deep_focus ?? 0}h
            <span className="mx-1 text-xs font-normal text-slate-400">vs</span>
            <span className="text-amber-700">{trendSummary.days[6]?.distracted ?? 0}h</span>
          </div>
        </div>
      </div>

      {/* Recharts Visualization */}
      <div className="mt-5 h-64 w-full" data-testid="weekly-cognitive-trend-chart">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'area' ? (
            <AreaChart
              data={trendSummary.days}
              margin={{ top: 10, right: 16, left: -16, bottom: 0 }}
            >
              <defs>
                <linearGradient id="deepFocusGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="distractedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#d97706" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="#d97706" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="dayLabel"
                tick={{ fontSize: 11, fill: '#475569' }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                unit="h"
                tick={{ fontSize: 11, fill: '#475569' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderColor: '#e2e8f0',
                  borderRadius: '12px',
                  fontSize: '12px',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                }}
                formatter={(value: unknown, name: unknown) => [
                  `${Number(value ?? 0)}h`,
                  name === 'deep_focus' ? 'Deep Focus (deep_focus)' : 'Distracted (distracted)',
                ]}
              />
              <Legend
                verticalAlign="top"
                height={30}
                formatter={(value) =>
                  value === 'deep_focus'
                    ? 'Deep Focus Hours (deep_focus)'
                    : 'Distracted Hours (distracted)'
                }
                wrapperStyle={{ fontSize: '12px' }}
              />
              <Area
                type="monotone"
                dataKey="deep_focus"
                name="deep_focus"
                stroke="#059669"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#deepFocusGrad)"
                activeDot={{ r: 5, strokeWidth: 0, fill: '#047857' }}
              />
              <Area
                type="monotone"
                dataKey="distracted"
                name="distracted"
                stroke="#d97706"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#distractedGrad)"
                activeDot={{ r: 5, strokeWidth: 0, fill: '#b45309' }}
              />
            </AreaChart>
          ) : (
            <BarChart
              data={trendSummary.days}
              margin={{ top: 10, right: 16, left: -16, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="dayLabel"
                tick={{ fontSize: 11, fill: '#475569' }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                unit="h"
                tick={{ fontSize: 11, fill: '#475569' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderColor: '#e2e8f0',
                  borderRadius: '12px',
                  fontSize: '12px',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                }}
                formatter={(value: unknown, name: unknown) => [
                  `${Number(value ?? 0)}h`,
                  name === 'deep_focus' ? 'Deep Focus (deep_focus)' : 'Distracted (distracted)',
                ]}
              />
              <Legend
                verticalAlign="top"
                height={30}
                formatter={(value) =>
                  value === 'deep_focus'
                    ? 'Deep Focus Hours (deep_focus)'
                    : 'Distracted Hours (distracted)'
                }
                wrapperStyle={{ fontSize: '12px' }}
              />
              <Bar
                dataKey="deep_focus"
                name="deep_focus"
                fill="#059669"
                radius={[6, 6, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                dataKey="distracted"
                name="distracted"
                fill="#d97706"
                radius={[6, 6, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* 7-Day Interactive Day Strip */}
      <div className="mt-4 grid grid-cols-7 gap-1.5 border-t border-slate-100 pt-3">
        {trendSummary.days.map((day) => (
          <button
            key={day.dateKey}
            type="button"
            onClick={() => onSelectDate?.(day.dateKey)}
            className={`rounded-xl border px-2 py-1.5 text-center transition-colors ${
              day.isReferenceDay
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-slate-50/60 text-slate-700 hover:bg-slate-100'
            }`}
            title={`Inspect ${day.dateKey}: ${day.deep_focus}h deep_focus vs ${day.distracted}h distracted`}
          >
            <div className="text-[10px] font-medium opacity-80">{day.dayLabel}</div>
            <div className="mt-0.5 font-mono tabular-nums text-xs font-semibold">
              <span className={day.isReferenceDay ? 'text-emerald-300' : 'text-emerald-700'}>
                {day.deep_focus}h
              </span>
              <span className="mx-0.5 opacity-50">/</span>
              <span className={day.isReferenceDay ? 'text-amber-300' : 'text-amber-700'}>
                {day.distracted}h
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};
