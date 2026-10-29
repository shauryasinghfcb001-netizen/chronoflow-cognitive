import React, { useState, useEffect } from 'react';
import {
  MOTION_STATE_META,
  formatHourLabel,
  type CognitiveState,
  type HourlyEntry,
  type MotionState,
} from '../utils/cognitiveEngine';
import { Play, Pause, RotateCcw, CheckCircle2 } from 'lucide-react';

interface FocusTimerViewProps {
  dateKey: string;
  onLogCompletedSession: (entry: Omit<HourlyEntry, 'id'>) => void;
}

interface TimerPreset {
  id: string;
  label: string;
  minutes: number;
  cognitiveState: CognitiveState;
  motionState: MotionState;
  description: string;
}

const TIMER_PRESETS: TimerPreset[] = [
  {
    id: 'ultradian-90',
    label: '90m Ultradian Peak',
    minutes: 90,
    cognitiveState: 'deep_focus',
    motionState: 'standing',
    description: 'Full biological ultradian cycle for maximum neural plasticity and deep work',
  },
  {
    id: 'deep-50',
    label: '50m Deep Block',
    minutes: 50,
    cognitiveState: 'deep_focus',
    motionState: 'sedentary',
    description: 'Focused single-task execution followed by 10m off-screen posture reset',
  },
  {
    id: 'pomodoro-25',
    label: '25m Sprint',
    minutes: 25,
    cognitiveState: 'creative',
    motionState: 'standing',
    description: 'High-urgency ideation or rapid implementation sprint',
  },
  {
    id: 'motion-15',
    label: '15m Metabolic Walk',
    minutes: 15,
    cognitiveState: 'recovery',
    motionState: 'walking',
    description: 'Zero-screen outdoor or pacing walk to clear adenosine and visual fatigue',
  },
];

export const FocusTimerView: React.FC<FocusTimerViewProps> = ({
  dateKey,
  onLogCompletedSession,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<TimerPreset>(TIMER_PRESETS[1]);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(TIMER_PRESETS[1].minutes * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [sessionTask, setSessionTask] = useState<string>(
    'Deep architecture & cognitive telemetry verification'
  );
  const [sessionMotion, setSessionMotion] = useState<MotionState>(TIMER_PRESETS[1].motionState);
  const [targetHour, setTargetHour] = useState<number>(() => {
    const h = new Date().getHours();
    return h >= 8 && h <= 19 ? h : 9;
  });
  const [loggedConfirmation, setLoggedConfirmation] = useState<string | null>(null);

  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isRunning]);

  const handleSelectPreset = (preset: TimerPreset) => {
    setIsRunning(false);
    setSelectedPreset(preset);
    setSecondsRemaining(preset.minutes * 60);
    setSessionMotion(preset.motionState);
    setLoggedConfirmation(null);
  };

  const handleReset = () => {
    setIsRunning(false);
    setSecondsRemaining(selectedPreset.minutes * 60);
    setLoggedConfirmation(null);
  };

  const handleLogToMatrix = () => {
    const elapsedMinutes = Math.max(
      5,
      Math.min(
        60,
        Math.round((selectedPreset.minutes * 60 - secondsRemaining) / 60) || selectedPreset.minutes
      )
    );
    const isRecovery = selectedPreset.cognitiveState === 'recovery';

    onLogCompletedSession({
      dateKey,
      hour: targetHour,
      activity: sessionTask.trim() || selectedPreset.label,
      cognitiveState: selectedPreset.cognitiveState,
      screenMinutes: isRecovery ? 0 : Math.min(60, elapsedMinutes),
      productiveScreenMinutes: isRecovery ? 0 : Math.min(60, elapsedMinutes),
      motionState: sessionMotion,
      stepsCount: MOTION_STATE_META[sessionMotion].defaultSteps,
      energyLevel: 5,
      notes: `Logged from ${selectedPreset.label} timer session`,
    });

    setLoggedConfirmation(
      `Logged "${sessionTask.trim() || selectedPreset.label}" (${Math.min(
        60,
        elapsedMinutes
      )}m) into Hour ${formatHourLabel(targetHour)}.`
    );
  };

  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const formattedClock = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      {/* Left Column: Precision Hardware-Style Cognitive Timer */}
      <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6">
        <div className="border-b border-slate-200 pb-4">
          <h2 className="text-base font-semibold text-slate-900">
            Ultradian Focus & Motion Interval Timer
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Synchronize deep screen work with physical posture shifts and log directly to your hourly matrix
          </p>
        </div>

        {/* Preset Selector */}
        <div
          role="group"
          aria-label="Timer interval presets"
          className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {TIMER_PRESETS.map((preset) => {
            const active = selectedPreset.id === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  active
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                }`}
              >
                <div className="text-xs font-semibold whitespace-nowrap">{preset.label}</div>
                <div
                  className={`mt-0.5 text-[11px] font-mono tabular-nums ${
                    active ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  {preset.minutes}:00 · {preset.motionState}
                </div>
              </button>
            );
          })}
        </div>

        {/* High-Contrast Instrument Readout — Clean sentence-case subtitle, no all-caps shouting */}
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-8 text-center text-white">
          <div className="text-xs text-slate-300 tracking-wide">
            {selectedPreset.label} · {selectedPreset.description}
          </div>
          <div
            data-testid="timer-display"
            className="mt-4 text-6xl font-bold font-mono tabular-nums tracking-tight sm:text-7xl"
          >
            {formattedClock}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setIsRunning((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              {isRunning ? (
                <>
                  <Pause className="h-4 w-4" />
                  Pause Interval
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Start Interval
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>

        {/* Session Telemetry Binding */}
        <div className="mt-6 space-y-4 border-t border-slate-200 pt-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <div className="sm:col-span-6">
              <label htmlFor="timer-task-input" className="block text-xs font-medium text-slate-700">
                Active Session Intention
              </label>
              <input
                id="timer-task-input"
                type="text"
                value={sessionTask}
                onChange={(e) => setSessionTask(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="timer-motion-select" className="block text-xs font-medium text-slate-700">
                Physical Posture
              </label>
              <select
                id="timer-motion-select"
                value={sessionMotion}
                onChange={(e) => setSessionMotion(e.target.value as MotionState)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                {(Object.keys(MOTION_STATE_META) as MotionState[]).map((mKey) => (
                  <option key={mKey} value={mKey}>
                    {MOTION_STATE_META[mKey].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="timer-hour-select" className="block text-xs font-medium text-slate-700">
                Target Hour Slot
              </label>
              <select
                id="timer-hour-select"
                value={targetHour}
                onChange={(e) => setTargetHour(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                {Array.from({ length: 24 }, (_, idx) => (
                  <option key={idx} value={idx}>
                    {formatHourLabel(idx)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              Posture mode:{' '}
              <span className="font-medium text-slate-800">
                {MOTION_STATE_META[sessionMotion].label}
              </span>{' '}
              · Estimated steps:{' '}
              <span className="font-mono tabular-nums font-medium text-slate-800">
                {MOTION_STATE_META[sessionMotion].defaultSteps}
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogToMatrix}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Log Session to Hour {formatHourLabel(targetHour)}
            </button>
          </div>

          {loggedConfirmation && (
            <div
              role="status"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800"
            >
              {loggedConfirmation}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Cognitive & Motion Coupling Protocol */}
      <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6">
        <div className="border-b border-slate-200 pb-4">
          <h2 className="text-base font-semibold text-slate-900">
            Chronobiology & Motion Coupling Protocol
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Evidence-based rules linking physical movement with hourly cognitive throughput
          </p>
        </div>

        <div className="mt-5 space-y-5 text-xs leading-relaxed text-slate-600">
          <div>
            <h3 className="font-semibold text-slate-900">
              01. The 90-Minute Ultradian Focus Wave
            </h3>
            <p className="mt-1">
              Human alertness oscillates in 90-to-110-minute ultradian cycles. Attempting to force
              continuous screen concentration beyond 90 minutes without a 10–15 minute non-screen
              motor reset drops prefrontal efficiency by 34%.
            </p>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h3 className="font-semibold text-slate-900">
              02. Posture Alternation & Optic Flow
            </h3>
            <p className="mt-1">
              Alternating between seated precision work, standing synthesis, and outdoor walking
              generates lateral optic flow—quieting amygdala reactivity and preventing the
              post-lunch 14:00 circadian trough.
            </p>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h3 className="font-semibold text-slate-900">
              03. Screen Intentionality Ratio
            </h3>
            <p className="mt-1">
              Total screen time alone is a noisy metric. ChronoFlow separates{' '}
              <span className="font-medium text-slate-900">Productive Screen Creation</span> from{' '}
              <span className="font-medium text-slate-900">Passive Dopamine Drift</span>, penalizing
              fragmented context-switching hours while rewarding intentional off-screen recovery.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
