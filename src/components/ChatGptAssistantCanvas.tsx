import React, { useState, useRef, useEffect } from 'react';
import {
  COGNITIVE_STATE_META,
  MOTION_STATE_META,
  computeTenPointEfficiencyScale,
  formatHourLabel,
  summarizeGpsTrajectory,
  validateSafeMapsUri,
  type CognitiveState,
  type DailyCognitiveAnalytics,
  type DailyGoalItem,
  type GpsWaypoint,
  type HourlyEntry,
  type MotionState,
} from '../utils/cognitiveEngine';
import {
  Mic,
  Square,
  Radio,
  MapPin,
  ArrowUp,
  Sparkles,
  Blocks,
  Gauge,
  Plus,
  ExternalLink,
  RefreshCw,
  CalendarCheck,
  RotateCcw,
} from 'lucide-react';

interface ChatMessageItem {
  id: string;
  role: 'user' | 'agent';
  text: string;
  timestamp: string;
  badge?: string;
  mapsPlaces?: Array<{ title: string; uri: string; reviewSnippets: string[] }>;
}

interface ChatGptAssistantCanvasProps {
  entries: HourlyEntry[];
  goals: DailyGoalItem[];
  analytics: DailyCognitiveAnalytics;
  waypoints: GpsWaypoint[];
  activePluginsCount: number;
  isSyncingMiniMe: boolean;
  externalPromptRequest?: { id: number; prompt: string } | null;
  onEditHour: (hour: number, existing?: HourlyEntry) => void;
  onScheduleHourFromAgent: (block: {
    hour: number;
    activity: string;
    cognitiveState: CognitiveState;
    motionState: MotionState;
    screenMinutes: number;
  }) => void;
  onAddWaypoint: (wp: Omit<GpsWaypoint, 'id'>) => void;
  onQuickSyncMiniMe: () => void;
  onNavigateSection: (section: 'assistant' | 'scale' | 'plugins') => void;
}

function floatTo16BitPCMBase64(float32Array: Float32Array): string {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function renderInlineBold(line: string): React.ReactNode[] {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function renderFormattedMarkdownText(text: string, isUser: boolean): React.ReactNode {
  if (isUser) {
    return <div className="whitespace-pre-line">{text}</div>;
  }
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) return <div key={idx} className="h-1" />;
        if (line.startsWith('### ') || line.startsWith('## ')) {
          const cleanHeading = line.replace(/^#{2,3}\s+/, '').replace(/\*\*/g, '');
          return (
            <div key={idx} className="pt-1 text-xs font-bold text-slate-900">
              {cleanHeading}
            </div>
          );
        }
        if (line.startsWith('* ') || line.startsWith('- ') || line.startsWith('• ')) {
          const bulletBody = line.replace(/^([*-•])\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
              <div className="flex-1">{renderInlineBold(bulletBody)}</div>
            </div>
          );
        }
        return <div key={idx}>{renderInlineBold(line)}</div>;
      })}
    </div>
  );
}

export const ChatGptAssistantCanvas: React.FC<ChatGptAssistantCanvasProps> = ({
  entries,
  goals,
  analytics,
  waypoints,
  activePluginsCount,
  isSyncingMiniMe,
  externalPromptRequest,
  onEditHour,
  onScheduleHourFromAgent,
  onAddWaypoint,
  onQuickSyncMiniMe,
  onNavigateSection,
}) => {
  const gpsSummary = summarizeGpsTrajectory(waypoints);
  const scaleMetrics = computeTenPointEfficiencyScale(
    analytics,
    goals,
    gpsSummary.locationsVisited
  );
  const sortedEntries = [...entries].sort((a, b) => a.hour - b.hour);

  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [promptInput, setPromptInput] = useState<string>('');
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const lastHandledPromptIdRef = useRef<number | null>(null);

  // Live Voice WebSocket State
  const [liveConnected, setLiveConnected] = useState<boolean>(false);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  // Audio Note Recording State
  const [isRecordingNote, setIsRecordingNote] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      stopLiveVoiceSession();
    };
  }, []);

  const buildDayContextString = () => {
    const entryLines = sortedEntries
      .map((e) => {
        const sc = analytics.hourlyScores[e.hour];
        return `${formatHourLabel(e.hour)}: ${e.activity} [Mode: ${
          COGNITIVE_STATE_META[e.cognitiveState].label
        }, Score: ${sc?.score ?? 0}pt (${sc?.classification ?? 'Tracked'}), Screen: ${
          e.productiveScreenMinutes
        }m productive / ${e.screenMinutes}m total, Motion: ${
          MOTION_STATE_META[e.motionState].label
        } (${e.stepsCount} steps), Energy: ${e.energyLevel}/5]`;
      })
      .join('\n');
    const goalLines = goals
      .map((g) => `${g.title}: ${g.currentValue}/${g.targetValue} ${g.unit} (${g.completed ? 'Done' : 'In Progress'})`)
      .join('; ');
    return `Overall 1-10 Efficiency Scale: ${scaleMetrics.overallScale.toFixed(1)}/10 (${
      scaleMetrics.verdictLabel
    }), Focus Index: ${analytics.overallCognitiveIndex}/100, Productive Hours: ${
      analytics.productiveHoursCount
    }h, Distracted/Drain Hours: ${analytics.unproductiveHoursCount}h, Screen Focus Efficiency: ${
      analytics.screenEfficiencyPct
    }%, Total Steps: ${analytics.totalSteps}, GPS Distance: ${gpsSummary.totalDistanceKm}km.\nGoals: ${goalLines}\nToday's Hours (${
      sortedEntries.length
    } logged hours):\n${entryLines}`;
  };

  const appendMessage = (msg: Omit<ChatMessageItem, 'id' | 'timestamp'>) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [
      ...prev,
      {
        ...msg,
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: timeStr,
      },
    ]);
  };

  const playPcm24kChunk = (base64Pcm: string) => {
    try {
      if (!outputAudioCtxRef.current) {
        outputAudioCtxRef.current = new AudioContext({ sampleRate: 24000 });
      }
      const ctx = outputAudioCtxRef.current;
      const binary = window.atob(base64Pcm);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768;
      }
      const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      const startAt = Math.max(ctx.currentTime, nextStartTimeRef.current);
      source.start(startAt);
      nextStartTimeRef.current = startAt + audioBuffer.duration;
    } catch {
      // ignore
    }
  };

  const startLiveVoiceSession = async () => {
    try {
      setLiveStatus('Connecting Live Voice...');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/live`);
      wsRef.current = ws;

      ws.onopen = async () => {
        setLiveConnected(true);
        setLiveStatus('Live Voice Active — Speak anytime to plan or adjust your day');
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaStreamRef.current = stream;
          const inputCtx = new AudioContext({ sampleRate: 16000 });
          inputAudioCtxRef.current = inputCtx;
          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          source.connect(processor);
          processor.connect(inputCtx.destination);

          processor.onaudioprocess = (e) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              const base64Audio = floatTo16BitPCMBase64(e.inputBuffer.getChannelData(0));
              wsRef.current.send(JSON.stringify({ audio: base64Audio }));
            }
          };
        } catch {
          setLiveStatus('Live Voice connected (type below if microphone is restricted)');
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'audio' && msg.audio) {
            playPcm24kChunk(msg.audio);
          } else if (msg.type === 'output_transcript' && msg.text) {
            appendMessage({ role: 'agent', text: msg.text, badge: 'Live Voice' });
          } else if (msg.type === 'input_transcript' && msg.text) {
            appendMessage({ role: 'user', text: msg.text, badge: 'Voice Input' });
          } else if (msg.type === 'tool_schedule_block' && msg.block) {
            const b = msg.block;
            onScheduleHourFromAgent({
              hour: Number(b.hour ?? 9),
              activity: String(b.activity ?? 'Voice Planned Block'),
              cognitiveState: (b.cognitiveState as CognitiveState) || 'deep_focus',
              motionState: (b.motionState as MotionState) || 'standing',
              screenMinutes: Number(b.screenMinutes ?? 45),
            });
            appendMessage({
              role: 'agent',
              badge: 'Timeline Updated',
              text: `Scheduled "${b.activity}" at ${formatHourLabel(Number(b.hour ?? 9))} into your timeline.`,
            });
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setLiveConnected(false);
        setLiveStatus(null);
      };
    } catch {
      setLiveStatus(null);
    }
  };

  const stopLiveVoiceSession = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }
    setLiveConnected(false);
    setLiveStatus(null);
  };

  const handleToggleAudioDictation = async () => {
    if (isRecordingNote && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecordingNote(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64data = String(reader.result || '').split(',')[1];
          if (!base64data) return;
          setIsBusy(true);
          try {
            const resp = await fetch('/api/gemini/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64data,
                mimeType: 'audio/webm',
                currentDayContext: buildDayContextString(),
              }),
            });
            const data = await resp.json();
            if (data.transcript) {
              appendMessage({
                role: 'user',
                badge: 'Audio Transcript',
                text: data.transcript,
              });
            }
            if (data.agentSynthesis) {
              appendMessage({
                role: 'agent',
                badge: 'Transcription Synthesis',
                text: data.agentSynthesis,
              });
            }
          } catch {
            appendMessage({
              role: 'agent',
              text: 'Audio transcription finished.',
            });
          } finally {
            setIsBusy(false);
          }
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingNote(true);
    } catch {
      await handleActionSummarizeDay();
    }
  };

  const handleActionSummarizeDay = async () => {
    appendMessage({
      role: 'user',
      text: 'Summarize my day by transcription and show my productive vs. drain hours.',
    });
    setIsBusy(true);
    try {
      const goalsText = goals
        .map((g) => `${g.title}: ${g.currentValue}/${g.targetValue} ${g.unit}`)
        .join('; ');
      const gpsText = waypoints
        .map((w) => `${formatHourLabel(w.hour)} ${w.label}`)
        .join('; ');

      const resp = await fetch('/api/gemini/daily-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entriesSummary: buildDayContextString(),
          goalsSummary: goalsText,
          gpsSummary: `${gpsSummary.locationsVisited} stops (${gpsSummary.totalDistanceKm} km): ${gpsText}`,
        }),
      });
      const data = await resp.json();
      appendMessage({
        role: 'agent',
        badge: 'Daily Transcription Summary',
        text:
          data.digest ||
          `Today's Efficiency Scale: ${scaleMetrics.overallScale.toFixed(1)}/10. You logged ${
            analytics.totalTrackedHours
          } hours (${analytics.productiveHoursCount}h productive, ${
            analytics.unproductiveHoursCount
          }h drain) with ${analytics.screenEfficiencyPct}% screen focus efficiency and ${analytics.totalSteps.toLocaleString()} steps.`,
      });
    } catch {
      appendMessage({
        role: 'agent',
        badge: 'Daily Transcription Summary',
        text: `Daily Summary: ${scaleMetrics.overallScale.toFixed(1)}/10 Efficiency Scale across ${
          analytics.totalTrackedHours
        } logged hours and ${analytics.totalSteps.toLocaleString()} steps.`,
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleActionGpsAndMaps = async () => {
    appendMessage({
      role: 'user',
      text: 'Track my current GPS location and find nearby focus spots and walking routes on Google Maps.',
    });
    setIsBusy(true);

    const hr = new Date().getHours();
    const lat = 37.7897;
    const lng = -122.4014;
    onAddWaypoint({
      hour: hr,
      label: 'Live GPS Check-In',
      latitude: lat,
      longitude: lng,
      motionState: 'walking',
      contextNote: 'Captured from Chat Composer',
    });

    try {
      const resp = await fetch('/api/gemini/maps-grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query:
            'Find quiet deep-work cafes, libraries, and scenic walking trails near my current GPS location',
          latitude: lat,
          longitude: lng,
        }),
      });
      const data = await resp.json();
      appendMessage({
        role: 'agent',
        badge: 'GPS & Google Maps',
        text:
          data.text ||
          `Logged GPS Check-In at (${lat.toFixed(4)}, ${lng.toFixed(
            4
          )}). Grounded nearby focus workspaces and walking trails.`,
        mapsPlaces: Array.isArray(data.places) ? data.places : [],
      });
    } catch {
      appendMessage({
        role: 'agent',
        badge: 'GPS & Google Maps',
        text: `Logged GPS Check-In at (${lat.toFixed(4)}, ${lng.toFixed(
          4
        )}) for hour ${formatHourLabel(hr)}.`,
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleActionPlanTomorrow = async () => {
    const planPrompt =
      'Schedule 09:00 for Deep Architecture Work (50m screen, standing) and 12:00 for a 30m Outdoor Recovery Walk';
    appendMessage({ role: 'user', text: planPrompt });
    setIsBusy(true);
    try {
      const response = await fetch('/api/gemini/plan-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: planPrompt,
          currentDayContext: buildDayContextString(),
        }),
      });
      const data = await response.json();
      if (Array.isArray(data.plannedBlocks) && data.plannedBlocks.length > 0) {
        for (const b of data.plannedBlocks) {
          onScheduleHourFromAgent({
            hour: Number(b.hour ?? 9),
            activity: String(b.activity ?? 'Scheduled Block'),
            cognitiveState: (b.cognitiveState as CognitiveState) || 'deep_focus',
            motionState: (b.motionState as MotionState) || 'standing',
            screenMinutes: Number(b.screenMinutes ?? 45),
          });
        }
      }
      appendMessage({
        role: 'agent',
        badge: 'Schedule Updated',
        text: data.reply || 'Scheduled your requested blocks into the timeline.',
      });
    } catch {
      appendMessage({
        role: 'agent',
        text: 'Scheduled your requested blocks into the timeline.',
      });
    } finally {
      setIsBusy(false);
    }
  };

  const sendQueryToGemini = async (rawText: string) => {
    const text = rawText.trim();
    if (!text) return;
    appendMessage({ role: 'user', text });
    setIsBusy(true);

    if (liveConnected && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ text }));
    }

    const lower = text.toLowerCase();
    if (
      (lower.includes('gps') || lower.includes('nearby') || lower.includes('google maps')) &&
      !lower.includes('today')
    ) {
      const latest = gpsSummary.latestWaypoint || { latitude: 37.7858, longitude: -122.4065 };
      try {
        const resp = await fetch('/api/gemini/maps-grounding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: text,
            latitude: latest.latitude,
            longitude: latest.longitude,
          }),
        });
        const data = await resp.json();
        appendMessage({
          role: 'agent',
          badge: 'Gemini + Google Maps Grounding',
          text: data.text || 'Grounded your location query with Google Maps.',
          mapsPlaces: Array.isArray(data.places) ? data.places : [],
        });
      } catch {
        appendMessage({
          role: 'agent',
          text: 'Completed GPS & Google Maps lookup.',
        });
      } finally {
        setIsBusy(false);
      }
      return;
    }

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          currentDayContext: buildDayContextString(),
          history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await response.json();
      if (Array.isArray(data.plannedBlocks) && data.plannedBlocks.length > 0) {
        for (const b of data.plannedBlocks) {
          onScheduleHourFromAgent({
            hour: Number(b.hour ?? 9),
            activity: String(b.activity ?? 'Scheduled Block'),
            cognitiveState: (b.cognitiveState as CognitiveState) || 'deep_focus',
            motionState: (b.motionState as MotionState) || 'standing',
            screenMinutes: Number(b.screenMinutes ?? 45),
          });
        }
      }
      appendMessage({
        role: 'agent',
        badge:
          Array.isArray(data.plannedBlocks) && data.plannedBlocks.length > 0
            ? `Gemini · Scheduled ${data.plannedBlocks.length} Block(s)`
            : 'ChronoFlow Gemini AI',
        text: data.reply || 'Here is your cognitive telemetry analysis.',
      });
    } catch {
      appendMessage({
        role: 'agent',
        badge: 'ChronoFlow Gemini AI',
        text: 'Processed your request against Today’s Hours.',
      });
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    if (
      externalPromptRequest &&
      externalPromptRequest.id !== lastHandledPromptIdRef.current &&
      externalPromptRequest.prompt.trim()
    ) {
      lastHandledPromptIdRef.current = externalPromptRequest.id;
      sendQueryToGemini(externalPromptRequest.prompt);
    }
  }, [externalPromptRequest]);

  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim()) return;
    const text = promptInput.trim();
    setPromptInput('');
    await sendQueryToGemini(text);
  };

  const renderComposerForm = () => (
    <form
      onSubmit={handleSendPrompt}
      className="w-full rounded-3xl border border-slate-300 bg-white p-3.5 shadow-sm focus-within:border-slate-900 transition-colors"
    >
      <input
        type="text"
        value={promptInput}
        onChange={(e) => setPromptInput(e.target.value)}
        placeholder="Ask ChronoFlow anything — log an hour, summarize your day, sync MiniMe, or plan tomorrow..."
        aria-label="Message ChronoFlow Assistant"
        className="w-full bg-transparent px-1.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
        {/* Left Quick Tool Buttons inside Composer */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onEditHour(new Date().getHours())}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Plus className="h-3.5 w-3.5 text-slate-500" />
            Log Hour
          </button>

          <button
            type="button"
            onClick={() => onNavigateSection('scale')}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono tabular-nums text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Gauge className="h-3.5 w-3.5 text-emerald-600" />
            Scale {scaleMetrics.overallScale.toFixed(1)}/10
          </button>

          <button
            type="button"
            onClick={() => onNavigateSection('plugins')}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Blocks className="h-3.5 w-3.5 text-sky-600" />
            Plugins ({activePluginsCount})
          </button>
        </div>

        {/* Right Voice, Transcribe & Send Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleToggleAudioDictation}
            title="Record voice note & transcribe"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              isRecordingNote
                ? 'bg-red-600 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {isRecordingNote ? (
              <>
                <Square className="h-3.5 w-3.5" />
                Stop
              </>
            ) : (
              <>
                <Mic className="h-3.5 w-3.5" />
                Transcribe
              </>
            )}
          </button>

          <button
            type="button"
            onClick={liveConnected ? stopLiveVoiceSession : startLiveVoiceSession}
            title="Start real-time voice conversation"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              liveConnected
                ? 'bg-emerald-600 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            {liveConnected ? 'Voice Live' : 'Live Voice'}
          </button>

          <button
            type="submit"
            disabled={isBusy || !promptInput.trim()}
            aria-label="Send message"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-800 transition-colors disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </form>
  );

  // Empty State: Centered ChatGPT Home Experience
  if (messages.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center py-8">
        <div className="w-full space-y-6 text-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              What did you work on, or how should we plan your day?
            </h1>
            <p className="text-xs font-mono tabular-nums text-slate-500">
              Efficiency Scale: <strong className="text-slate-900">{scaleMetrics.overallScale.toFixed(1)}/10</strong> ·{' '}
              {analytics.productiveHoursCount}h Productive · {analytics.screenEfficiencyPct}% Screen Focus ·{' '}
              {analytics.totalSteps.toLocaleString()} Steps · {gpsSummary.totalDistanceKm} km GPS
            </p>
          </div>

          {liveStatus && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800 flex items-center justify-between">
              <span>{liveStatus}</span>
              <button
                type="button"
                onClick={stopLiveVoiceSession}
                className="underline font-semibold"
              >
                Stop Voice
              </button>
            </div>
          )}

          {/* Big Centered ChatGPT Composer */}
          <div className="text-left">{renderComposerForm()}</div>

          {/* 4 Simple ChatGPT Starter Action Cards */}
          <div className="grid grid-cols-1 gap-2.5 text-left sm:grid-cols-2">
            <button
              type="button"
              onClick={handleActionSummarizeDay}
              disabled={isBusy}
              className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left hover:border-slate-300 hover:bg-slate-50/70 transition-colors"
            >
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 group-hover:text-slate-900" />
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  Summarize my day by transcription
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Full breakdown of productive hours, screen time & GPS movement
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                onQuickSyncMiniMe();
                appendMessage({
                  role: 'user',
                  text: 'Sync my MiniMe screen watcher plugin and organize my active hours.',
                });
                appendMessage({
                  role: 'agent',
                  badge: 'MiniMe Plugin',
                  text: 'Synced MiniMe Screen & Efficiency Agent into your timeline:\n• 09:00 — VS Code (46m) + Terminal (11m): 95% single-window focus\n• 11:00 — Figma UI Simplification (38m): High creative flow\n• 14:00 — Passive screen drift flagged (38m): Recommended off-screen walk tomorrow.',
                });
              }}
              disabled={isSyncingMiniMe}
              className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left hover:border-slate-300 hover:bg-slate-50/70 transition-colors"
            >
              <RefreshCw
                className={`mt-0.5 h-4 w-4 shrink-0 text-slate-500 group-hover:text-slate-900 ${
                  isSyncingMiniMe ? 'animate-spin' : ''
                }`}
              />
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  Sync MiniMe screen watcher
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Pull screen activity & efficiency coaching from MiniMe MCP
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={handleActionGpsAndMaps}
              disabled={isBusy}
              className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left hover:border-slate-300 hover:bg-slate-50/70 transition-colors"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 group-hover:text-slate-900" />
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  Track my GPS & nearby focus spots
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Log GPS coordinates and ground cafes & trails on Google Maps
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={handleActionPlanTomorrow}
              disabled={isBusy}
              className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left hover:border-slate-300 hover:bg-slate-50/70 transition-colors"
            >
              <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 group-hover:text-slate-900" />
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  Plan my schedule for tomorrow
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Auto-schedule deep focus and outdoor recovery blocks
                </div>
              </div>
            </button>
          </div>

          {/* Today's Hours — Clear Gemini Explainer & Interactive Timeline */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-left">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/80">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-semibold text-slate-900">
                    Today’s Hours ({sortedEntries.length} Tracked Hours)
                  </h2>
                  <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 font-mono tabular-nums text-[10px] font-medium text-emerald-700">
                    {analytics.productiveHoursCount}h Productive
                  </span>
                  <span className="rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 font-mono tabular-nums text-[10px] font-medium text-amber-700">
                    {analytics.unproductiveHoursCount}h Distracted
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Each hour logs what you did, focus mode, screen time & steps. Click{' '}
                  <strong className="font-medium text-slate-700">Ask Gemini</strong> on any hour for an AI breakdown.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  sendQueryToGemini(
                    'Explain my Today’s Hours in simple terms: what did I do each hour, which hours were productive vs distracted, and what does the pt score mean?'
                  )
                }
                disabled={isBusy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors shrink-0"
              >
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                Ask Gemini to Explain Today’s Hours
              </button>
            </div>

            <div className="mt-2.5 max-h-52 divide-y divide-slate-200/70 overflow-y-auto pr-1">
              {sortedEntries.map((entry) => {
                const sc = analytics.hourlyScores[entry.hour];
                const isDrain =
                  entry.cognitiveState === 'distracted' ||
                  sc?.classification === 'Cognitive Drain';
                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-2 py-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono tabular-nums font-semibold text-slate-900 shrink-0">
                          {formatHourLabel(entry.hour)}
                        </span>
                        <span
                          className={`whitespace-nowrap shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            isDrain
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {COGNITIVE_STATE_META[entry.cognitiveState].label} · {sc?.score ?? 0}pt
                        </span>
                        <span className="truncate font-medium text-slate-800">
                          {entry.activity}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 font-mono tabular-nums">
                        Screen: {entry.productiveScreenMinutes}m/{entry.screenMinutes}m · Motion:{' '}
                        {MOTION_STATE_META[entry.motionState].label} ({entry.stepsCount} steps)
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          sendQueryToGemini(
                            `Explain my ${formatHourLabel(entry.hour)} hour ("${
                              entry.activity
                            }") — why did it score ${
                              sc?.score ?? 0
                            }pt and how can I make this hour even better?`
                          )
                        }
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        Ask Gemini
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditHour(entry.hour, entry)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
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
      </div>
    );
  }

  // Active Conversation View: Clean ChatGPT Thread + Bottom Composer
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-between gap-6 py-2">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <span className="text-xs font-medium text-slate-500">
            Active Session · Scale {scaleMetrics.overallScale.toFixed(1)}/10
          </span>
          <button
            type="button"
            onClick={() => setMessages([])}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw className="h-3 w-3" />
            Reset Chat
          </button>
        </div>

        {/* Message Bubbles */}
        <section aria-label="Assistant Conversation Stream" className="space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-800'
                }`}
              >
                {msg.badge && (
                  <div
                    className={`mb-1 flex items-center justify-between gap-3 font-mono text-[10px] ${
                      msg.role === 'user' ? 'text-slate-300' : 'text-slate-400'
                    }`}
                  >
                    <span>{msg.badge}</span>
                    <span>{msg.timestamp}</span>
                  </div>
                )}
                {renderFormattedMarkdownText(msg.text, msg.role === 'user')}

                {msg.mapsPlaces && msg.mapsPlaces.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-2.5 sm:grid-cols-2">
                    {msg.mapsPlaces.map((place, idx) => (
                      <a
                        key={idx}
                        href={validateSafeMapsUri(place.uri)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-800 hover:border-slate-400 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 font-medium text-slate-900">
                          <span className="truncate">{place.title}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />
                        </div>
                        {place.reviewSnippets.length > 0 && (
                          <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                            “{place.reviewSnippets[0]}”
                          </p>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isBusy && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 font-mono text-xs text-slate-500">
                Thinking...
              </div>
            </div>
          )}

          {liveStatus && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-800 flex items-center justify-between">
              <span>{liveStatus}</span>
              <button
                type="button"
                onClick={stopLiveVoiceSession}
                className="underline font-semibold"
              >
                Stop Voice
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Bottom Docked Composer */}
      <div className="pt-2">{renderComposerForm()}</div>
    </div>
  );
};
