/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  query,
  where,
  onSnapshot,
  setDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  auth,
  db,
  signInWithGoogle,
  signOutUser,
  testFirestoreConnection,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  CURATED_DAY_TEMPLATES,
  DEFAULT_GPS_WAYPOINTS,
  DEFAULT_MCP_CONNECTORS,
  MOTION_STATE_META,
  analyzeDailyCognitiveTelemetry,
  computeTenPointEfficiencyScale,
  formatHourLabel,
  mergeMcpBlocksIntoEntries,
  type CognitiveState,
  type DailyGoalItem,
  type DayTemplate,
  type GpsWaypoint,
  type HourlyEntry,
  type McpConnectorItem,
  type McpExtractedBlock,
  type MotionState,
} from './utils/cognitiveEngine';
import { ChatGptAssistantCanvas } from './components/ChatGptAssistantCanvas';
import { ScaleSectionView } from './components/ScaleSectionView';
import { PluginStoreSectionView } from './components/PluginStoreSectionView';
import { HourlyLogModal } from './components/HourlyLogModal';
import {
  Plus,
  Cloud,
  LogIn,
  LogOut,
  Calendar,
  MessageSquare,
  Gauge,
  Blocks,
  PanelLeft,
  Sparkles,
} from 'lucide-react';

type ActiveSection = 'assistant' | 'scale' | 'plugins';

const STORAGE_ENTRIES_KEY = 'chronoflow_entries_v1';
const STORAGE_GOALS_KEY = 'chronoflow_goals_v1';
const STORAGE_MCP_KEY = 'chronoflow_mcp_v1';
const STORAGE_GPS_KEY = 'chronoflow_gps_v1';

function getTodayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('assistant');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateKey);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>('ultradian-maker');

  // Auth & Cloud State
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [externalPromptRequest, setExternalPromptRequest] = useState<{
    id: number;
    prompt: string;
  } | null>(null);

  // Local / Seeded State
  const [localEntries, setLocalEntries] = useState<HourlyEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_ENTRIES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: HourlyEntry) =>
            item.hour === 9 && typeof item.activity === 'string' && item.activity.trim().endsWith('?')
              ? {
                  ...item,
                  activity: 'Core architecture & system implementation (Ultradian Block 1)',
                }
              : item
          );
        }
      }
    } catch {
      // ignore
    }
    const today = getTodayDateKey();
    return CURATED_DAY_TEMPLATES[0].entries.map((e) => ({
      ...e,
      id: `${today}_h${e.hour}`,
      dateKey: today,
    }));
  });

  const [localGoals, setLocalGoals] = useState<DailyGoalItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_GOALS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return CURATED_DAY_TEMPLATES[0].goals.map((g, idx) => ({
      ...g,
      id: `goal_seed_${idx + 1}`,
    }));
  });

  const [mcpConnectors, setMcpConnectors] = useState<McpConnectorItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_MCP_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_MCP_CONNECTORS;
  });

  const [gpsWaypoints, setGpsWaypoints] = useState<GpsWaypoint[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_GPS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_GPS_WAYPOINTS;
  });

  const [recentExtracted, setRecentExtracted] = useState<McpExtractedBlock[]>([]);
  const [isSyncingId, setIsSyncingId] = useState<string | null>(null);

  const [cloudEntries, setCloudEntries] = useState<HourlyEntry[] | null>(null);
  const [cloudGoals, setCloudGoals] = useState<DailyGoalItem[] | null>(null);

  // Modal state
  const [isLogModalOpen, setIsLogModalOpen] = useState<boolean>(false);
  const [modalHour, setModalHour] = useState<number>(9);
  const [editingEntry, setEditingEntry] = useState<HourlyEntry | undefined>(undefined);

  useEffect(() => {
    testFirestoreConnection();
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ENTRIES_KEY, JSON.stringify(localEntries));
    } catch {
      // ignore
    }
  }, [localEntries]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_GOALS_KEY, JSON.stringify(localGoals));
    } catch {
      // ignore
    }
  }, [localGoals]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_MCP_KEY, JSON.stringify(mcpConnectors));
    } catch {
      // ignore
    }
  }, [mcpConnectors]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_GPS_KEY, JSON.stringify(gpsWaypoints));
    } catch {
      // ignore
    }
  }, [gpsWaypoints]);

  // Firestore Real-Time Listeners when authenticated
  useEffect(() => {
    if (!authReady || !user) {
      setCloudEntries(null);
      setCloudGoals(null);
      return;
    }

    const logsQuery = query(collection(db, 'hourly_logs'), where('userId', '==', user.uid));
    const unsubLogs = onSnapshot(
      logsQuery,
      (snap) => {
        const items: HourlyEntry[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          items.push({
            id: docSnap.id,
            dateKey: data.dateKey,
            hour: data.hour,
            activity: data.activity,
            cognitiveState: data.cognitiveState,
            screenMinutes: data.screenMinutes,
            productiveScreenMinutes: data.productiveScreenMinutes,
            motionState: data.motionState,
            stepsCount: data.stepsCount,
            energyLevel: data.energyLevel,
            notes: data.notes,
          });
        });
        setCloudEntries(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'hourly_logs');
      }
    );

    const goalsQuery = query(collection(db, 'daily_goals'), where('userId', '==', user.uid));
    const unsubGoals = onSnapshot(
      goalsQuery,
      (snap) => {
        const items: DailyGoalItem[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          items.push({
            id: docSnap.id,
            title: data.title,
            category: data.category,
            targetValue: data.targetValue,
            currentValue: data.currentValue,
            unit: data.unit,
            completed: data.completed,
            priority: data.priority,
          });
        });
        setCloudGoals(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'daily_goals');
      }
    );

    return () => {
      unsubLogs();
      unsubGoals();
    };
  }, [authReady, user]);

  const allEntries = user && cloudEntries && cloudEntries.length > 0 ? cloudEntries : localEntries;
  const activeGoals = user && cloudGoals && cloudGoals.length > 0 ? cloudGoals : localGoals;

  const entriesForSelectedDate = useMemo(() => {
    return allEntries.filter((e) => e.dateKey === selectedDate);
  }, [allEntries, selectedDate]);

  const analytics = useMemo(
    () => analyzeDailyCognitiveTelemetry(entriesForSelectedDate),
    [entriesForSelectedDate]
  );

  const scaleMetrics = useMemo(
    () => computeTenPointEfficiencyScale(analytics, activeGoals, gpsWaypoints.length),
    [analytics, activeGoals, gpsWaypoints.length]
  );

  const activePluginsCount = useMemo(
    () => mcpConnectors.filter((c) => c.enabled).length + 1,
    [mcpConnectors]
  );

  const handleOpenLogModal = (hour: number, existing?: HourlyEntry) => {
    setModalHour(hour);
    setEditingEntry(existing);
    setIsLogModalOpen(true);
  };

  const handleSaveHourlyEntry = async (entryInput: Omit<HourlyEntry, 'id'>) => {
    const docId = user
      ? `${user.uid}_${entryInput.dateKey}_h${entryInput.hour}`
      : `${entryInput.dateKey}_h${entryInput.hour}`;

    const newEntry: HourlyEntry = {
      ...entryInput,
      id: docId,
    };

    setLocalEntries((prev) => {
      const filtered = prev.filter(
        (item) => !(item.dateKey === entryInput.dateKey && item.hour === entryInput.hour)
      );
      return [...filtered, newEntry];
    });

    if (user) {
      try {
        const payload: Record<string, unknown> = {
          userId: user.uid,
          dateKey: entryInput.dateKey,
          hour: entryInput.hour,
          activity: entryInput.activity.slice(0, 160),
          cognitiveState: entryInput.cognitiveState,
          screenMinutes: entryInput.screenMinutes,
          productiveScreenMinutes: entryInput.productiveScreenMinutes,
          motionState: entryInput.motionState,
          stepsCount: entryInput.stepsCount,
          energyLevel: entryInput.energyLevel,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (entryInput.notes) {
          payload.notes = entryInput.notes.slice(0, 400);
        }
        await setDoc(doc(db, 'hourly_logs', docId), payload);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `hourly_logs/${docId}`);
      }
    }
  };

  const handleDeleteHourlyEntry = async (id: string) => {
    setLocalEntries((prev) => prev.filter((item) => item.id !== id));
    if (user) {
      try {
        await deleteDoc(doc(db, 'hourly_logs', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `hourly_logs/${id}`);
      }
    }
  };

  const handleSyncMcpConnector = async (connector: McpConnectorItem) => {
    setIsSyncingId(connector.id);
    try {
      const response = await fetch('/api/mcp/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: connector.provider,
          name: connector.name,
          endpointUrl: connector.endpointUrl,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        const blocks: McpExtractedBlock[] = Array.isArray(data.blocks) ? data.blocks : [];
        setRecentExtracted((prev) => [...blocks, ...prev].slice(0, 12));
        setLocalEntries((prev) => mergeMcpBlocksIntoEntries(prev, blocks, selectedDate));
        setMcpConnectors((prev) =>
          prev.map((c) =>
            c.id === connector.id
              ? {
                  ...c,
                  lastSyncedAt: new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                }
              : c
          )
        );
      }
    } catch {
      // ignore
    } finally {
      setIsSyncingId(null);
    }
  };

  const handleToggleMcpConnector = (id: string) => {
    setMcpConnectors((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
    );
  };

  const handleAddMcpConnector = async (connInput: Omit<McpConnectorItem, 'id'>) => {
    const connId = `mcp_${Date.now()}`;
    const newConn: McpConnectorItem = { ...connInput, id: connId };
    setMcpConnectors((prev) => [...prev, newConn]);

    if (user) {
      try {
        await setDoc(doc(db, 'mcp_connectors', `${user.uid}_${connId}`), {
          userId: user.uid,
          name: connInput.name.slice(0, 80),
          provider: connInput.provider,
          endpointUrl: connInput.endpointUrl.slice(0, 256),
          enabled: connInput.enabled,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `mcp_connectors/${user.uid}_${connId}`);
      }
    }
  };

  const handleDeleteMcpConnector = (id: string) => {
    setMcpConnectors((prev) => prev.filter((c) => c.id !== id));
  };

  const handlePushWhatsAppCheckin = async (payload: {
    hour: number;
    activity: string;
    screenMinutes: number;
    motionState: MotionState;
  }) => {
    try {
      const response = await fetch('/api/mcp/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          productiveScreenMinutes: payload.screenMinutes,
          cognitiveState:
            payload.motionState === 'walking' || payload.motionState === 'workout'
              ? 'recovery'
              : 'deep_focus',
          stepsCount: MOTION_STATE_META[payload.motionState].defaultSteps,
          energyLevel: 4,
          sourceAgent: 'WhatsApp Agent',
          efficiencyCoaching: 'Synced directly from WhatsApp Personal Agent Bridge.',
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.block) {
          setRecentExtracted((prev) => [data.block, ...prev].slice(0, 12));
          setLocalEntries((prev) => mergeMcpBlocksIntoEntries(prev, [data.block], selectedDate));
        }
      }
    } catch {
      // ignore
    }
  };

  const handleAddGoal = async (goalInput: Omit<DailyGoalItem, 'id'>) => {
    const goalId = `goal_${Date.now()}`;
    const newGoal: DailyGoalItem = { ...goalInput, id: goalId };
    setLocalGoals((prev) => [newGoal, ...prev]);

    if (user) {
      try {
        await setDoc(doc(db, 'daily_goals', `${user.uid}_${goalId}`), {
          userId: user.uid,
          title: goalInput.title.slice(0, 140),
          category: goalInput.category,
          targetValue: goalInput.targetValue,
          currentValue: goalInput.currentValue,
          unit: goalInput.unit.slice(0, 24),
          completed: goalInput.completed,
          priority: goalInput.priority,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `daily_goals/${user.uid}_${goalId}`);
      }
    }
  };

  const handleToggleGoal = async (id: string) => {
    setLocalGoals((prev) =>
      prev.map((g) =>
        g.id === id
          ? {
              ...g,
              completed: !g.completed,
              currentValue: !g.completed ? g.targetValue : g.currentValue,
            }
          : g
      )
    );
  };

  const handleIncrementGoal = async (id: string, delta: number) => {
    setLocalGoals((prev) =>
      prev.map((g) => {
        if (g.id !== id) return g;
        const nextVal = g.currentValue + delta;
        return {
          ...g,
          currentValue: nextVal,
          completed: nextVal >= g.targetValue ? true : g.completed,
        };
      })
    );
  };

  const handleDeleteGoal = async (id: string) => {
    setLocalGoals((prev) => prev.filter((g) => g.id !== id));
    if (user) {
      try {
        await deleteDoc(doc(db, 'daily_goals', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `daily_goals/${id}`);
      }
    }
  };

  const handleApplyTemplate = (template: DayTemplate) => {
    setActiveTemplateId(template.id);
    const mappedEntries: HourlyEntry[] = template.entries.map((e) => ({
      ...e,
      id: `${selectedDate}_h${e.hour}`,
      dateKey: selectedDate,
    }));
    setLocalEntries((prev) => {
      const otherDates = prev.filter((item) => item.dateKey !== selectedDate);
      return [...otherDates, ...mappedEntries];
    });
    setLocalGoals(
      template.goals.map((g, idx) => ({
        ...g,
        id: `tpl_${template.id}_${idx}`,
      }))
    );
  };

  const handleGoogleAuth = async () => {
    setAuthError(null);
    try {
      if (user) {
        await signOutUser();
      } else {
        await signInWithGoogle();
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication request failed');
    }
  };

  return (
    <div className="flex min-h-screen md:h-screen md:overflow-hidden bg-slate-50 text-slate-900">
      {/* Left ChatGPT-Style Tool Sidebar */}
      {sidebarOpen && (
        <aside
          aria-label="Workspace Tool Sidebar"
          className="hidden md:flex w-64 shrink-0 flex-col justify-between border-r border-slate-200 bg-slate-900 text-slate-100 p-3.5"
        >
          <div className="space-y-6">
            {/* Top Brand & New Log Action */}
            <div className="flex items-center justify-between px-1.5 pt-1">
              <button
                type="button"
                onClick={() => setActiveSection('assistant')}
                className="text-sm font-bold tracking-tight text-white"
              >
                ChronoFlow
              </button>
              <button
                type="button"
                onClick={() => handleOpenLogModal(new Date().getHours())}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Log Hour
              </button>
            </div>

            {/* Primary Tool Navigation (Assistant, Scale Section, Plugin Section) */}
            <div className="space-y-1">
              <div className="px-2 pb-1 text-[11px] font-medium text-slate-400">
                Workspace Tools
              </div>
              <button
                type="button"
                onClick={() => setActiveSection('assistant')}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-medium transition-colors ${
                  activeSection === 'assistant'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <MessageSquare className="h-4 w-4 text-slate-400" />
                  Chat & Daily Stream
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('scale')}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-medium transition-colors ${
                  activeSection === 'scale'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Gauge className="h-4 w-4 text-emerald-400" />
                  Scale Section
                </span>
                <span className="font-mono tabular-nums text-[11px] text-emerald-400">
                  {scaleMetrics.overallScale.toFixed(1)}/10
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('plugins')}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-medium transition-colors ${
                  activeSection === 'plugins'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Blocks className="h-4 w-4 text-sky-400" />
                  Plugin Section (MCP)
                </span>
                <span className="font-mono tabular-nums text-[11px] text-slate-400">
                  {activePluginsCount} active
                </span>
              </button>
            </div>

            {/* Today's Logged Hours in Sidebar (with Gemini AI Explanation) */}
            <div className="space-y-1.5">
              <div className="px-2 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold text-slate-300">
                    Today’s Hours ({entriesForSelectedDate.length})
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Click any hour to ask Gemini AI
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSection('assistant');
                      setExternalPromptRequest({
                        id: Date.now(),
                        prompt:
                          'Explain my Today’s Hours in simple terms: what did I do each hour, which hours were productive vs distracted, and what does the pt score mean?',
                      });
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                    title="Ask Gemini AI to explain all of Today's Hours"
                  >
                    <Sparkles className="h-2.5 w-2.5" />
                    Explain
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenLogModal(new Date().getHours())}
                    className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 hover:text-white"
                  >
                    + Add
                  </button>
                </div>
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {[...entriesForSelectedDate]
                  .sort((a, b) => a.hour - b.hour)
                  .map((entry) => {
                    const sc = analytics.hourlyScores[entry.hour];
                    const isDrain =
                      entry.cognitiveState === 'distracted' ||
                      sc?.classification === 'Cognitive Drain';
                    return (
                      <div
                        key={entry.id}
                        className="group flex w-full items-center justify-between gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSection('assistant');
                            setExternalPromptRequest({
                              id: Date.now(),
                              prompt: `Explain my ${formatHourLabel(entry.hour)} hour ("${
                                entry.activity
                              }") — why did it score ${
                                sc?.score ?? 0
                              }pt and how can I optimize this hour?`,
                            });
                          }}
                          className="min-w-0 flex-1 text-left"
                          title={`Click to ask Gemini AI about ${formatHourLabel(entry.hour)}`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                isDrain ? 'bg-amber-400' : 'bg-emerald-400'
                              }`}
                            />
                            <span className="font-mono tabular-nums text-slate-400">
                              {formatHourLabel(entry.hour)}
                            </span>
                            <span className="truncate">{entry.activity}</span>
                          </div>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <span
                            className={`font-mono tabular-nums text-[10px] ${
                              isDrain ? 'text-amber-400' : 'text-emerald-400'
                            }`}
                          >
                            {sc?.score ?? 0}pt
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenLogModal(entry.hour, entry)}
                            className="rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-slate-700 hover:text-white"
                            title="Edit this hour"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Bottom Sidebar Date & Cloud Account */}
          <div className="space-y-2.5 border-t border-slate-800 pt-3 text-xs">
            <label
              htmlFor="sidebar-date-picker"
              className="flex items-center justify-between rounded-xl bg-slate-800/80 px-3 py-2 text-slate-300"
            >
              <span className="inline-flex items-center gap-1.5 text-[11px]">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                Date
              </span>
              <input
                id="sidebar-date-picker"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent font-mono tabular-nums text-xs text-white focus:outline-none"
              />
            </label>

            <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1.5 truncate">
                <Cloud className="h-3.5 w-3.5 shrink-0" />
                {user ? user.email : 'Local Workspace'}
              </span>
            </div>

            {authError && <div className="px-1 text-[11px] text-red-400">{authError}</div>}

            <button
              type="button"
              onClick={handleGoogleAuth}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 transition-colors"
            >
              {user ? (
                <>
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </>
              ) : (
                <>
                  <LogIn className="h-3.5 w-3.5" />
                  Sync with Google
                </>
              )}
            </button>
          </div>
        </aside>
      )}

      {/* Main Right ChatGPT Tool Column */}
      <div className="flex flex-1 flex-col min-w-0 md:overflow-y-auto bg-white">
        {/* Clean 3-Zone Top Header Bar */}
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-100 bg-white/95 backdrop-blur-xs px-4 py-3 sm:px-6">
          {/* Zone 1: Sidebar Toggle + Brand Selector */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label="Toggle sidebar"
              className="hidden md:inline-flex rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <a
              href="#assistant"
              onClick={(e) => {
                e.preventDefault();
                setActiveSection('assistant');
              }}
              className="text-sm font-bold tracking-tight text-slate-900 whitespace-nowrap"
            >
              ChronoFlow
            </a>
          </div>

          {/* Zone 2: Concise 3-Section Switcher (Chat | Scale | Plugins) */}
          <nav
            aria-label="Primary Workspace Navigation"
            className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-medium"
          >
            <button
              type="button"
              onClick={() => setActiveSection('assistant')}
              className={`rounded-lg px-3.5 py-1.5 transition-colors whitespace-nowrap ${
                activeSection === 'assistant'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('scale')}
              className={`rounded-lg px-3.5 py-1.5 transition-colors whitespace-nowrap ${
                activeSection === 'scale'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Scale ({scaleMetrics.overallScale.toFixed(1)}/10)
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('plugins')}
              className={`rounded-lg px-3.5 py-1.5 transition-colors whitespace-nowrap ${
                activeSection === 'plugins'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Plugins ({activePluginsCount})
            </button>
          </nav>

          {/* Zone 3: Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenLogModal(new Date().getHours())}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              Log Hour
            </button>
          </div>
        </header>

        {/* Main Workspace Canvas */}
        <main className="flex-1 px-4 py-6 sm:px-6 flex flex-col">
          {activeSection === 'assistant' && (
            <ChatGptAssistantCanvas
              entries={entriesForSelectedDate}
              goals={activeGoals}
              analytics={analytics}
              waypoints={gpsWaypoints}
              activePluginsCount={activePluginsCount}
              isSyncingMiniMe={isSyncingId === 'mcp-minime'}
              externalPromptRequest={externalPromptRequest}
              onEditHour={(hr, existing) => handleOpenLogModal(hr, existing)}
              onScheduleHourFromAgent={(block) => {
                const validCognitive: CognitiveState = [
                  'deep_focus',
                  'shallow_work',
                  'creative',
                  'learning',
                  'recovery',
                  'distracted',
                ].includes(block.cognitiveState)
                  ? block.cognitiveState
                  : 'deep_focus';
                const validMotion: MotionState = [
                  'sedentary',
                  'standing',
                  'walking',
                  'workout',
                ].includes(block.motionState)
                  ? block.motionState
                  : 'standing';
                const scr = Math.max(0, Math.min(60, Math.round(block.screenMinutes)));

                handleSaveHourlyEntry({
                  dateKey: selectedDate,
                  hour: Math.max(0, Math.min(23, Math.floor(block.hour))),
                  activity: block.activity,
                  cognitiveState: validCognitive,
                  screenMinutes: scr,
                  productiveScreenMinutes: scr,
                  motionState: validMotion,
                  stepsCount: MOTION_STATE_META[validMotion].defaultSteps,
                  energyLevel: 5,
                  notes: 'Scheduled via ChronoFlow Assistant',
                });
              }}
              onAddWaypoint={(wp) => {
                setGpsWaypoints((prev) => [...prev, { ...wp, id: `gps_${Date.now()}` }]);
              }}
              onQuickSyncMiniMe={() => {
                const miniMeConn =
                  mcpConnectors.find((c) => c.provider === 'minime') || DEFAULT_MCP_CONNECTORS[0];
                handleSyncMcpConnector(miniMeConn);
              }}
              onNavigateSection={(sec) => setActiveSection(sec)}
            />
          )}

          {activeSection === 'scale' && (
            <ScaleSectionView
              entries={entriesForSelectedDate}
              allEntries={allEntries}
              goals={activeGoals}
              analytics={analytics}
              gpsLocationsCount={gpsWaypoints.length}
              selectedDate={selectedDate}
              activeTemplateId={activeTemplateId}
              onSelectDate={(d) => setSelectedDate(d)}
              onEditHour={(hr, existing) => handleOpenLogModal(hr, existing)}
              onQuickUpdateEnergy={(entry, newEnergy) => {
                handleSaveHourlyEntry({
                  dateKey: entry.dateKey,
                  hour: entry.hour,
                  activity: entry.activity,
                  cognitiveState: entry.cognitiveState,
                  screenMinutes: entry.screenMinutes,
                  productiveScreenMinutes: entry.productiveScreenMinutes,
                  motionState: entry.motionState,
                  stepsCount: entry.stepsCount,
                  energyLevel: newEnergy,
                  notes: entry.notes,
                });
              }}
              onQuickAddEntry={({ hour, activity, cognitiveState, screenMinutes, motionState }) => {
                handleSaveHourlyEntry({
                  dateKey: selectedDate,
                  hour,
                  activity,
                  cognitiveState,
                  screenMinutes,
                  productiveScreenMinutes:
                    cognitiveState === 'distracted'
                      ? Math.round(screenMinutes * 0.25)
                      : screenMinutes,
                  motionState,
                  stepsCount: MOTION_STATE_META[motionState].defaultSteps,
                  energyLevel: cognitiveState === 'deep_focus' ? 5 : 4,
                });
              }}
              onSaveTimerSession={(entry) => {
                handleSaveHourlyEntry(entry);
              }}
              onAddGoal={handleAddGoal}
              onToggleGoal={handleToggleGoal}
              onIncrementGoal={handleIncrementGoal}
              onDeleteGoal={handleDeleteGoal}
              onApplyTemplate={handleApplyTemplate}
            />
          )}

          {activeSection === 'plugins' && (
            <PluginStoreSectionView
              connectors={mcpConnectors}
              recentExtracted={recentExtracted}
              isSyncingId={isSyncingId}
              waypoints={gpsWaypoints}
              onSyncConnector={handleSyncMcpConnector}
              onToggleConnector={handleToggleMcpConnector}
              onAddConnector={handleAddMcpConnector}
              onDeleteConnector={handleDeleteMcpConnector}
              onPushWhatsAppCheckin={handlePushWhatsAppCheckin}
              onAddWaypoint={(wp) => {
                setGpsWaypoints((prev) => [...prev, { ...wp, id: `gps_${Date.now()}` }]);
              }}
            />
          )}
        </main>
      </div>

      {/* Log / Edit Hour Modal */}
      <HourlyLogModal
        isOpen={isLogModalOpen}
        initialHour={modalHour}
        existingEntry={editingEntry}
        dateKey={selectedDate}
        onClose={() => setIsLogModalOpen(false)}
        onSave={handleSaveHourlyEntry}
        onDelete={handleDeleteHourlyEntry}
      />
    </div>
  );
}
