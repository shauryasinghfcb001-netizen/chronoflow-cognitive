import React, { useState, useEffect } from 'react';
import {
  COGNITIVE_STATE_META,
  MOTION_STATE_META,
  formatHourLabel,
  validateHourlyInput,
  type CognitiveState,
  type HourlyEntry,
  type MotionState,
} from '../utils/cognitiveEngine';
import { X } from 'lucide-react';

interface HourlyLogModalProps {
  isOpen: boolean;
  initialHour: number;
  existingEntry?: HourlyEntry;
  dateKey: string;
  onClose: () => void;
  onSave: (entry: Omit<HourlyEntry, 'id'>) => void;
  onDelete?: (id: string) => void;
}

export const HourlyLogModal: React.FC<HourlyLogModalProps> = ({
  isOpen,
  initialHour,
  existingEntry,
  dateKey,
  onClose,
  onSave,
  onDelete,
}) => {
  const [hour, setHour] = useState<number>(initialHour);
  const [activity, setActivity] = useState<string>('');
  const [cognitiveState, setCognitiveState] = useState<CognitiveState>('deep_focus');
  const [screenMinutes, setScreenMinutes] = useState<number>(45);
  const [productiveScreenMinutes, setProductiveScreenMinutes] = useState<number>(45);
  const [motionState, setMotionState] = useState<MotionState>('standing');
  const [stepsCount, setStepsCount] = useState<number>(250);
  const [energyLevel, setEnergyLevel] = useState<number>(4);
  const [notes, setNotes] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (existingEntry) {
      setHour(existingEntry.hour);
      setActivity(existingEntry.activity);
      setCognitiveState(existingEntry.cognitiveState);
      setScreenMinutes(existingEntry.screenMinutes);
      setProductiveScreenMinutes(existingEntry.productiveScreenMinutes);
      setMotionState(existingEntry.motionState);
      setStepsCount(existingEntry.stepsCount);
      setEnergyLevel(existingEntry.energyLevel);
      setNotes(existingEntry.notes || '');
    } else {
      setHour(initialHour);
      setActivity('');
      setCognitiveState('deep_focus');
      setScreenMinutes(45);
      setProductiveScreenMinutes(45);
      setMotionState('standing');
      setStepsCount(220);
      setEnergyLevel(4);
      setNotes('');
    }
    setErrorMessage(null);
  }, [existingEntry, initialHour, isOpen]);

  if (!isOpen) return null;

  const handleMotionChange = (nextMotion: MotionState) => {
    setMotionState(nextMotion);
    if (!existingEntry) {
      setStepsCount(MOTION_STATE_META[nextMotion].defaultSteps);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateHourlyInput({
      hour,
      activity,
      screenMinutes,
      productiveScreenMinutes,
      stepsCount,
      energyLevel,
    });

    if (!validation.valid) {
      setErrorMessage(validation.error || 'Please check your input values.');
      return;
    }

    onSave({
      dateKey,
      hour,
      activity: activity.trim(),
      cognitiveState,
      screenMinutes,
      productiveScreenMinutes,
      motionState,
      stepsCount,
      energyLevel,
      notes: notes.trim() ? notes.trim() : undefined,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-log-hour-title"
    >
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 id="modal-log-hour-title" className="text-lg font-semibold text-slate-900">
              {existingEntry ? `Edit Hour Block (${formatHourLabel(hour)})` : 'Log Cognitive Hour Block'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Record cognitive state, screen intentionality, and physical posture for {dateKey}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {errorMessage && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700"
            >
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="hour-select" className="block text-xs font-medium text-slate-700">
                Hour Slot (24h)
              </label>
              <select
                id="hour-select"
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                {Array.from({ length: 24 }, (_, idx) => (
                  <option key={idx} value={idx}>
                    {formatHourLabel(idx)} – {formatHourLabel((idx + 1) % 24)}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="activity-input" className="block text-xs font-medium text-slate-700">
                Primary Activity or Deliverable
              </label>
              <input
                id="activity-input"
                type="text"
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                placeholder="e.g., System architecture design & unit test suite"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cognitive-state-select" className="block text-xs font-medium text-slate-700">
                Cognitive Classification
              </label>
              <select
                id="cognitive-state-select"
                value={cognitiveState}
                onChange={(e) => setCognitiveState(e.target.value as CognitiveState)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                {(Object.keys(COGNITIVE_STATE_META) as CognitiveState[]).map((key) => (
                  <option key={key} value={key}>
                    {COGNITIVE_STATE_META[key].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="motion-state-select" className="block text-xs font-medium text-slate-700">
                Physical Posture & Motion
              </label>
              <select
                id="motion-state-select"
                value={motionState}
                onChange={(e) => handleMotionChange(e.target.value as MotionState)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                {(Object.keys(MOTION_STATE_META) as MotionState[]).map((key) => (
                  <option key={key} value={key}>
                    {MOTION_STATE_META[key].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor="screen-minutes-input" className="block text-xs font-medium text-slate-700">
                Total Screen (m)
              </label>
              <input
                id="screen-minutes-input"
                type="number"
                min={0}
                max={60}
                value={screenMinutes}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setScreenMinutes(val);
                  if (productiveScreenMinutes > val) {
                    setProductiveScreenMinutes(val);
                  }
                }}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="prod-screen-input" className="block text-xs font-medium text-slate-700">
                Productive Screen (m)
              </label>
              <input
                id="prod-screen-input"
                type="number"
                min={0}
                max={60}
                value={productiveScreenMinutes}
                onChange={(e) => setProductiveScreenMinutes(Number(e.target.value))}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="steps-input" className="block text-xs font-medium text-slate-700">
                Steps in Hour
              </label>
              <input
                id="steps-input"
                type="number"
                min={0}
                max={15000}
                value={stepsCount}
                onChange={(e) => setStepsCount(Number(e.target.value))}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="energy-select" className="block text-xs font-medium text-slate-700">
                Energy (1–5)
              </label>
              <select
                id="energy-select"
                value={energyLevel}
                onChange={(e) => setEnergyLevel(Number(e.target.value))}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                <option value={5}>5 / Peak Alertness</option>
                <option value={4}>4 / High Focus</option>
                <option value={3}>3 / Baseline</option>
                <option value={2}>2 / Low Energy</option>
                <option value={1}>1 / Depleted</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="notes-input" className="block text-xs font-medium text-slate-700">
              Context Notes (Optional)
            </label>
            <input
              id="notes-input"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Triggers, distractions avoided, or key takeaway..."
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            <div>
              {existingEntry && onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    onDelete(existingEntry.id);
                    onClose();
                  }}
                  className="rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap shrink-0"
                >
                  Delete Entry
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Save Hour Block
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
