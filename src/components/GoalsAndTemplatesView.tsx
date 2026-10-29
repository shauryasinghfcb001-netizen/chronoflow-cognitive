import React, { useState } from 'react';
import {
  CURATED_DAY_TEMPLATES,
  type DailyGoalItem,
  type DayTemplate,
  type GoalCategory,
} from '../utils/cognitiveEngine';
import { Check, Plus, Trash2 } from 'lucide-react';

interface GoalsAndTemplatesViewProps {
  goals: DailyGoalItem[];
  activeTemplateId: string | null;
  onAddGoal: (goal: Omit<DailyGoalItem, 'id'>) => void;
  onToggleGoal: (id: string) => void;
  onIncrementGoal: (id: string, delta: number) => void;
  onDeleteGoal: (id: string) => void;
  onApplyTemplate: (template: DayTemplate) => void;
}

const CATEGORY_LABELS: Record<GoalCategory, string> = {
  deep_work: 'Deep Cognitive Output',
  screen_hygiene: 'Screen Hygiene Cap',
  motion: 'Physical Motion & Steps',
  habit: 'Circadian Ritual',
};

export const GoalsAndTemplatesView: React.FC<GoalsAndTemplatesViewProps> = ({
  goals,
  activeTemplateId,
  onAddGoal,
  onToggleGoal,
  onIncrementGoal,
  onDeleteGoal,
  onApplyTemplate,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<GoalCategory>('deep_work');
  const [targetValue, setTargetValue] = useState<number>(4);
  const [unit, setUnit] = useState<string>('hrs');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('high');
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('Please enter a specific goal title.');
      return;
    }
    if (targetValue <= 0) {
      setFormError('Target value must be greater than 0.');
      return;
    }
    setFormError(null);
    onAddGoal({
      title: title.trim(),
      category,
      targetValue,
      currentValue: 0,
      unit: unit.trim() || 'units',
      completed: false,
      priority,
    });
    setTitle('');
  };

  const completedCount = goals.filter((g) => g.completed).length;

  return (
    <div className="space-y-10">
      {/* Daily Goals & Targets Workspace */}
      <section
        aria-label="Daily Goals and Cognitive Targets"
        className="rounded-xl border border-slate-200 bg-white p-6"
      >
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Daily Cognitive, Screen & Motion Goals
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Track measurable daily commitments across deep work, screen limits, and physical activity
            </p>
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-700 font-medium">
            Achieved: {completedCount} / {goals.length} daily targets
          </div>
        </div>

        {/* Add New Goal Form */}
        <form onSubmit={handleCreateGoal} className="mt-5 border-b border-slate-200 pb-5">
          {formError && (
            <div
              role="alert"
              className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
            >
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <label htmlFor="goal-title-input" className="block text-xs font-medium text-slate-700">
                New Daily Goal
              </label>
              <input
                id="goal-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Complete 3 ultradian blocks before 14:00"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="goal-category-select" className="block text-xs font-medium text-slate-700">
                Domain
              </label>
              <select
                id="goal-category-select"
                value={category}
                onChange={(e) => setCategory(e.target.value as GoalCategory)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                {(Object.keys(CATEGORY_LABELS) as GoalCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="goal-target-input" className="block text-xs font-medium text-slate-700">
                Target & Unit
              </label>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  id="goal-target-input"
                  type="number"
                  min={1}
                  value={targetValue}
                  onChange={(e) => setTargetValue(Number(e.target.value))}
                  className="w-16 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                />
                <input
                  type="text"
                  aria-label="Goal unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="hrs"
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-end sm:col-span-2">
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Goal
              </button>
            </div>
          </div>
        </form>

        {/* Goals List */}
        <div className="mt-4 divide-y divide-slate-200">
          {goals.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              No daily goals configured yet. Add a target above or apply a day template below.
            </p>
          ) : (
            goals.map((goal) => {
              const isCapGoal = goal.category === 'screen_hygiene' && goal.unit.includes('max');
              const isOverCap = isCapGoal && goal.currentValue > goal.targetValue;
              const pct = Math.min(
                100,
                Math.round((goal.currentValue / Math.max(1, goal.targetValue)) * 100)
              );
              const statusNote = isCapGoal
                ? isOverCap
                  ? `${goal.currentValue - goal.targetValue}m over cap`
                  : 'Within cap'
                : goal.completed
                ? 'Target met'
                : `${pct}% complete`;

              return (
                <div
                  key={goal.id}
                  className="flex flex-col justify-between gap-3 py-3.5 sm:flex-row sm:items-center"
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => onToggleGoal(goal.id)}
                      aria-label={`Toggle completion for '${goal.title}'`}
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        goal.completed
                          ? 'border-emerald-700 bg-emerald-700 text-white'
                          : 'border-slate-300 bg-white hover:border-slate-500'
                      }`}
                    >
                      {goal.completed && <Check className="h-3.5 w-3.5" />}
                    </button>
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        {goal.title}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        <span>{CATEGORY_LABELS[goal.category]}</span>
                        <span aria-hidden="true" className="mx-1.5">
                          ·
                        </span>
                        <span>Priority: {goal.priority}</span>
                        <span aria-hidden="true" className="mx-1.5">
                          ·
                        </span>
                        <span className="font-mono tabular-nums text-slate-700">
                          {goal.currentValue} / {goal.targetValue} {goal.unit}
                        </span>
                        <span aria-hidden="true" className="mx-1.5">
                          ·
                        </span>
                        <span
                          className={`font-medium ${
                            isOverCap
                              ? 'text-amber-700'
                              : goal.completed
                              ? 'text-emerald-700'
                              : 'text-slate-600'
                          }`}
                        >
                          {statusNote}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() =>
                        onIncrementGoal(
                          goal.id,
                          goal.targetValue >= 1000 ? 1000 : goal.targetValue >= 30 ? 5 : 1
                        )
                      }
                      aria-label={`Increment progress for '${goal.title}'`}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-mono tabular-nums font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                    >
                      +{goal.targetValue >= 1000 ? '1k' : goal.targetValue >= 30 ? '5' : '1'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteGoal(goal.id)}
                      aria-label={`Delete '${goal.title}'`}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Notion / Motion Style Curated Day Templates (Single-elevation grid, no outer wrapper card) */}
      <section aria-label="Curated Cognitive Day Templates">
        <div className="pb-4">
          <h2 className="text-base font-semibold text-slate-900">
            Notion & Motion-Inspired Daily Architecture Templates
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Load a pre-calibrated schedule of hourly cognitive blocks, screen-time guardrails, and motion protocols
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {CURATED_DAY_TEMPLATES.map((tpl) => {
            const isSelected = activeTemplateId === tpl.id;
            return (
              <div
                key={tpl.id}
                className={`flex flex-col justify-between rounded-xl border bg-white p-5 transition-colors ${
                  isSelected
                    ? 'border-slate-900'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="text-xs font-medium text-slate-500">{tpl.targetAudience}</div>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900">{tpl.name}</h3>
                  <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">{tpl.subtitle}</p>

                  <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500 space-y-1">
                    <div>
                      <span className="font-mono tabular-nums font-medium text-slate-800">
                        {tpl.entries.length}
                      </span>{' '}
                      pre-mapped hourly blocks ·{' '}
                      <span className="font-mono tabular-nums font-medium text-slate-800">
                        {tpl.goals.length}
                      </span>{' '}
                      daily goals
                    </div>
                    <div className="text-[11px] text-slate-500">{tpl.benchmarkOrigin}</div>
                  </div>
                </div>

                <div className="mt-5 pt-2">
                  <button
                    type="button"
                    onClick={() => onApplyTemplate(tpl)}
                    className={`w-full rounded-lg px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      isSelected
                        ? 'bg-slate-900 text-white hover:bg-slate-800'
                        : 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    {isSelected ? 'Active Template · Reload Schedule' : `Apply ${tpl.name}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
