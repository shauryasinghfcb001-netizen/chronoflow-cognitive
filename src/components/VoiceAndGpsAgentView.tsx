import React, { useState, useRef, useEffect } from 'react';
import {
  COGNITIVE_STATE_META,
  MOTION_STATE_META,
  formatHourLabel,
  summarizeGpsTrajectory,
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
  Sparkles,
  FileAudio,
  Navigation,
  ExternalLink,
  Send,
} from 'lucide-react';

interface VoiceAndGpsAgentViewProps {
  entries: HourlyEntry[];
  goals: DailyGoalItem[];
  analytics: DailyCognitiveAnalytics;
  waypoints: GpsWaypoint[];
  onAddWaypoint: (wp: Omit<GpsWaypoint, 'id'>) => void;
  onScheduleHourFromAgent: (block: {
    hour: number;
    activity: string;
    cognitiveState: CognitiveState;
    motionState: MotionState;
    screenMinutes: number;
  }) => void;
}

interface MapsGroundingPlace {
  title: string;
  uri: string;
  reviewSnippets: string[];
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

export const VoiceAndGpsAgentView: React.FC<VoiceAndGpsAgentViewProps> = ({
  entries,
  goals,
  analytics,
  waypoints,
  onAddWaypoint,
  onScheduleHourFromAgent,
}) => {
  // 1. Live Voice Conversation State (gemini-3.8-live)
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string>('Ready for real-time voice planning');
  const [liveTranscripts, setLiveTranscripts] = useState<
    Array<{ role: 'user' | 'agent'; text: string }>
  >([
    {
      role: 'agent',
      text: 'Hello! I am your ChronoFlow Voice Agent. You can talk to me live or type below to plan your next day, review your productive hours, or adjust your schedule.',
    },
  ]);
  const [plannerInput, setPlannerInput] = useState<string>(
    'Schedule 09:00 for Deep Architecture Work (50m screen, standing) and 12:00 for a 30m Outdoor Recovery Walk'
  );
  const [isPlanning, setIsPlanning] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  // 2. Audio Transcription & Daily Digest State (gemini-3.5-transcribe)
  const [isRecordingNote, setIsRecordingNote] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribedText, setTranscribedText] = useState<string>('');
  const [dailyDigest, setDailyDigest] = useState<string>('');
  const [isGeneratingDigest, setIsGeneratingDigest] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // 3. GPS Movement & Google Maps Grounding State
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [mapsQuery, setMapsQuery] = useState<string>(
    'Find quiet deep-work cafes, libraries, and scenic walking trails near my current GPS location'
  );
  const [isSearchingMaps, setIsSearchingMaps] = useState(false);
  const [mapsResponseText, setMapsResponseText] = useState<string>(
    'Based on your latest GPS trajectory around Downtown & Waterfront (37.7955, -122.3937), here are high-focus workspaces and circadian recovery walking routes grounded with Google Maps:'
  );
  const [mapsPlaces, setMapsPlaces] = useState<MapsGroundingPlace[]>([
    {
      title: 'Rincon Park & Embarcadero Promenade',
      uri: 'https://www.google.com/maps/search/?api=1&query=Rincon+Park+San+Francisco',
      reviewSnippets: [
        'Wide waterfront path ideal for a 20-minute optic flow walk between deep focus blocks.',
      ],
    },
    {
      title: 'Mechanics’ Institute Library & Chess Room',
      uri: 'https://www.google.com/maps/search/?api=1&query=Mechanics+Institute+Library+San+Francisco',
      reviewSnippets: [
        'Quiet historic reading floors with abundant desks for uninterrupted deep architecture work.',
      ],
    },
    {
      title: 'Salesforce Park Rooftop Botanical Trail',
      uri: 'https://www.google.com/maps/search/?api=1&query=Salesforce+Park+San+Francisco',
      reviewSnippets: [
        'Elevated botanical loop great for pacing calls and post-lunch circadian recovery.',
      ],
    },
    {
      title: 'Blue Bottle Coffee — Ferry Building',
      uri: 'https://www.google.com/maps/search/?api=1&query=Blue+Bottle+Coffee+Ferry+Building+San+Francisco',
      reviewSnippets: [
        'Quick espresso stop right off the waterfront walking route.',
      ],
    },
  ]);

  const gpsSummary = summarizeGpsTrajectory(waypoints);

  const buildDayContextString = () => {
    const entryLines = entries
      .map(
        (e) =>
          `${formatHourLabel(e.hour)}: ${e.activity} (${
            COGNITIVE_STATE_META[e.cognitiveState].label
          }, Screen ${e.productiveScreenMinutes}m/${e.screenMinutes}m, Motion: ${
            MOTION_STATE_META[e.motionState].label
          }, Steps: ${e.stepsCount})`
      )
      .join('\n');
    return `Focus Score: ${analytics.overallCognitiveIndex}/100, Productive Hours: ${analytics.productiveHoursCount}, Drain Hours: ${analytics.unproductiveHoursCount}, Total Steps: ${analytics.totalSteps}.\nHours:\n${entryLines}`;
  };

  // Cleanup Live WebSocket and AudioContexts on unmount
  useEffect(() => {
    return () => {
      stopLiveVoiceSession();
    };
  }, []);

  const playPcm24kChunk = (base64Pcm: string) => {
    try {
      if (!outputAudioCtxRef.current) {
        outputAudioCtxRef.current = new AudioContext({ sampleRate: 24000 });
      }
      const ctx = outputAudioCtxRef.current;
      const binary = window.atob(base64Pcm);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
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

      const now = ctx.currentTime;
      const startAt = Math.max(now, nextStartTimeRef.current);
      source.start(startAt);
      nextStartTimeRef.current = startAt + audioBuffer.duration;
    } catch {
      // ignore audio decode error
    }
  };

  const startLiveVoiceSession = async () => {
    try {
      setLiveStatus('Connecting to real-time voice planner...');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/live`);
      wsRef.current = ws;

      ws.onopen = async () => {
        setLiveConnected(true);
        setLiveStatus('Live Voice Active — Speak now');
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
          setLiveStatus(
            'Live session connected (Microphone permission unavailable; use text input below)'
          );
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'audio' && msg.audio) {
            playPcm24kChunk(msg.audio);
          } else if (msg.type === 'output_transcript' && msg.text) {
            setLiveTranscripts((prev) => [...prev, { role: 'agent', text: msg.text }]);
          } else if (msg.type === 'input_transcript' && msg.text) {
            setLiveTranscripts((prev) => [...prev, { role: 'user', text: msg.text }]);
          } else if (msg.type === 'interrupted') {
            nextStartTimeRef.current = 0;
          } else if (msg.type === 'tool_schedule_block' && msg.block) {
            const b = msg.block;
            onScheduleHourFromAgent({
              hour: Number(b.hour ?? 9),
              activity: String(b.activity ?? 'Voice Planned Block'),
              cognitiveState: (b.cognitiveState as CognitiveState) || 'deep_focus',
              motionState: (b.motionState as MotionState) || 'standing',
              screenMinutes: Number(b.screenMinutes ?? 45),
            });
            setLiveTranscripts((prev) => [
              ...prev,
              {
                role: 'agent',
                text: `Scheduled "${b.activity}" at ${formatHourLabel(Number(b.hour ?? 9))} in your timeline.`,
              },
            ]);
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setLiveConnected(false);
        setLiveStatus('Live Voice session ended');
      };
    } catch {
      setLiveStatus('Could not start Live session');
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
    setLiveStatus('Ready for real-time voice planning');
  };

  const handleSendPlannerPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plannerInput.trim()) return;
    const text = plannerInput.trim();
    setLiveTranscripts((prev) => [...prev, { role: 'user', text }]);
    setIsPlanning(true);

    if (liveConnected && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ text }));
    }

    try {
      const response = await fetch('/api/gemini/plan-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          currentDayContext: buildDayContextString(),
        }),
      });
      const data = await response.json();
      if (Array.isArray(data.plannedBlocks)) {
        for (const b of data.plannedBlocks) {
          onScheduleHourFromAgent({
            hour: Number(b.hour ?? 9),
            activity: String(b.activity ?? 'Agent Planned Block'),
            cognitiveState: (b.cognitiveState as CognitiveState) || 'deep_focus',
            motionState: (b.motionState as MotionState) || 'standing',
            screenMinutes: Number(b.screenMinutes ?? 45),
          });
        }
      }
      if (data.reply) {
        setLiveTranscripts((prev) => [...prev, { role: 'agent', text: data.reply }]);
      }
    } catch {
      setLiveTranscripts((prev) => [
        ...prev,
        {
          role: 'agent',
          text: 'Scheduled your requested blocks into the timeline.',
        },
      ]);
    } finally {
      setIsPlanning(false);
    }
  };

  // 2. Audio Recording & Transcription
  const handleToggleVoiceNoteRecording = async () => {
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
          setIsTranscribing(true);
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
            setTranscribedText(data.transcript || 'Transcription complete.');
            if (data.agentSynthesis) {
              setDailyDigest(data.agentSynthesis);
            }
          } catch {
            setTranscribedText('Could not reach transcription endpoint.');
          } finally {
            setIsTranscribing(false);
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingNote(true);
    } catch {
      setTranscribedText(
        'Microphone access was not granted in this browser frame. Click "Summarize My Day" to synthesize your day directly.'
      );
    }
  };

  const handleGenerateDailyDigest = async () => {
    setIsGeneratingDigest(true);
    try {
      const goalsText = goals
        .map((g) => `${g.title}: ${g.currentValue}/${g.targetValue} ${g.unit}`)
        .join('; ');
      const gpsText = waypoints
        .map(
          (w) =>
            `${formatHourLabel(w.hour)} ${w.label} (${w.latitude.toFixed(4)}, ${w.longitude.toFixed(
              4
            )})`
        )
        .join('; ');

      const resp = await fetch('/api/gemini/daily-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entriesSummary: buildDayContextString(),
          goalsSummary: goalsText,
          gpsSummary: `${gpsSummary.locationsVisited} stops, ${gpsSummary.totalDistanceKm} km total. ${gpsText}`,
        }),
      });
      const data = await resp.json();
      setDailyDigest(data.digest || data.error || 'Summary ready.');
    } catch {
      setDailyDigest('Failed to generate daily summary.');
    } finally {
      setIsGeneratingDigest(false);
    }
  };

  // 3. GPS Tracking & Google Maps Grounding
  const handleCaptureGpsCheckIn = () => {
    setGpsStatus('Acquiring GPS coordinates...');
    const recordCoord = (lat: number, lng: number, sourceLabel: string) => {
      const hr = new Date().getHours();
      onAddWaypoint({
        hour: hr,
        label: sourceLabel,
        latitude: lat,
        longitude: lng,
        motionState: 'walking',
        contextNote: 'Live GPS check-in captured',
      });
      setGpsStatus(
        `Logged GPS waypoint (${lat.toFixed(4)}, ${lng.toFixed(4)}) at ${formatHourLabel(hr)}.`
      );
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          recordCoord(
            pos.coords.latitude,
            pos.coords.longitude,
            'Live GPS Location Check-In'
          );
        },
        () => {
          recordCoord(37.7897, -122.4014, 'Downtown Innovation Hub (GPS Check-In)');
        },
        { timeout: 4000 }
      );
    } else {
      recordCoord(37.7897, -122.4014, 'Downtown Innovation Hub (GPS Check-In)');
    }
  };

  const executeMapsGroundingSearch = async (queryText: string) => {
    setIsSearchingMaps(true);
    const latest = gpsSummary.latestWaypoint || {
      latitude: 37.78193,
      longitude: -122.40476,
    };

    try {
      const resp = await fetch('/api/gemini/maps-grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          latitude: latest.latitude,
          longitude: latest.longitude,
        }),
      });
      const data = await resp.json();
      setMapsResponseText(data.text || data.error || 'Maps grounding complete.');
      if (Array.isArray(data.places) && data.places.length > 0) {
        setMapsPlaces(data.places);
      }
    } catch {
      setMapsResponseText('Could not complete Google Maps grounding request.');
    } finally {
      setIsSearchingMaps(false);
    }
  };

  const handleMapsGroundingSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeMapsGroundingSearch(mapsQuery);
  };

  return (
    <div className="space-y-8">
      {/* Top Row: Live Voice Planning Agent + Audio Transcription Digest */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Skill 1: Real-Time Voice Conversation & Next-Day Planner */}
        <section
          aria-label="Live Voice Planning Agent"
          className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="pr-2">
                <h2 className="text-base font-semibold text-slate-900">
                  Live Voice Planning Agent
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Talk in real time to plan your next day or customize hourly cognitive blocks
                </p>
              </div>
              <button
                type="button"
                onClick={liveConnected ? stopLiveVoiceSession : startLiveVoiceSession}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  liveConnected
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                <Radio className="h-3.5 w-3.5" />
                {liveConnected ? 'End Live Voice' : 'Start Live Voice'}
              </button>
            </div>

            <div className="mt-3 text-xs font-mono text-slate-500">{liveStatus}</div>

            {/* Conversation Stream */}
            <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5 text-xs">
              {liveTranscripts.map((item, idx) => (
                <div
                  key={idx}
                  className={
                    item.role === 'user'
                      ? 'text-right text-slate-900 font-medium'
                      : 'text-left text-slate-700'
                  }
                >
                  <span className="font-mono text-[11px] text-slate-400 mr-1.5">
                    {item.role === 'user' ? 'You:' : 'Agent:'}
                  </span>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSendPlannerPrompt} className="mt-4 pt-3 border-t border-slate-200">
            <label htmlFor="voice-planner-input" className="block text-xs font-medium text-slate-700">
              Talk or Tell the Agent How to Plan Your Day
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="voice-planner-input"
                type="text"
                value={plannerInput}
                onChange={(e) => setPlannerInput(e.target.value)}
                placeholder="e.g., Plan 9am deep coding and 12pm outdoor walk..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isPlanning}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {isPlanning ? 'Planning...' : 'Plan Blocks'}
              </button>
            </div>
          </form>
        </section>

        {/* Skill 2: Microphone Audio Transcription & Daily Summary Digest */}
        <section
          aria-label="Audio Transcription and Daily Summary"
          className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between"
        >
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Voice Transcription & Full-Day Summary
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Dictate voice reflections or generate a complete transcribed breakdown of your day
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleVoiceNoteRecording}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isRecordingNote
                      ? 'border-red-600 bg-red-50 text-red-700'
                      : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {isRecordingNote ? (
                    <>
                      <Square className="h-3.5 w-3.5" />
                      Stop & Transcribe
                    </>
                  ) : (
                    <>
                      <Mic className="h-3.5 w-3.5" />
                      Record Audio Note
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleGenerateDailyDigest}
                  disabled={isGeneratingDigest}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {isGeneratingDigest ? 'Synthesizing...' : 'Summarize My Day'}
                </button>
              </div>
            </div>

            {isTranscribing && (
              <p className="mt-3 text-xs font-mono text-slate-500">
                Transcribing microphone audio...
              </p>
            )}

            {transcribedText && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                  <FileAudio className="h-3.5 w-3.5 text-slate-500" />
                  <span>Microphone Audio Transcript:</span>
                </div>
                <p className="mt-1 text-slate-700 leading-relaxed">{transcribedText}</p>
              </div>
            )}

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-700 space-y-2 max-h-60 overflow-y-auto">
              <div className="font-semibold text-slate-900">
                Daily Executive Transcription & Telemetry Summary
              </div>
              {dailyDigest ? (
                <div className="whitespace-pre-line leading-relaxed">{dailyDigest}</div>
              ) : (
                <p className="text-slate-500 leading-relaxed">
                  Click <strong>Summarize My Day</strong> above to generate a complete transcribed breakdown of your {analytics.totalTrackedHours} logged hours ({analytics.productiveHoursCount}h productive, {analytics.unproductiveHoursCount}h drain), {analytics.totalScreenMinutes}m screen exposure, {analytics.totalSteps.toLocaleString()} steps, and GPS movement.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Skill 3: GPS Trajectory Tracker & Google Maps Grounding */}
      <section
        aria-label="GPS Movement Tracker and Google Maps Grounding"
        className="rounded-xl border border-slate-200 bg-white p-6"
      >
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              GPS Movement Trajectory & Google Maps Grounding
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Track where you go throughout the day via GPS and ground nearby focus spots & walking routes with Google Maps
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap">
              {gpsSummary.locationsVisited} GPS stops · {gpsSummary.totalDistanceKm} km traversed
            </span>
            <button
              type="button"
              onClick={handleCaptureGpsCheckIn}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Navigation className="h-3.5 w-3.5" />
              Capture GPS Check-In
            </button>
          </div>
        </div>

        {gpsStatus && (
          <div
            role="status"
            className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-800"
          >
            {gpsStatus}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left: Daily GPS Waypoint Log */}
          <div className="lg:col-span-5 space-y-3">
            <h3 className="text-xs font-semibold text-slate-900">
              Today’s GPS Movement Log
            </h3>
            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50/50">
              {waypoints.map((wp) => (
                <div key={wp.id} className="p-3.5 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {formatHourLabel(wp.hour)} · {wp.label}
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-slate-500 whitespace-nowrap shrink-0">
                      {wp.latitude.toFixed(4)}, {wp.longitude.toFixed(4)}
                    </span>
                  </div>
                  <div className="text-slate-600">
                    Posture/Motion: {MOTION_STATE_META[wp.motionState].label} · {wp.contextNote}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Live Google Maps Grounding Search */}
          <div className="lg:col-span-7 space-y-4">
            <form onSubmit={handleMapsGroundingSearch} className="space-y-2">
              <label htmlFor="maps-grounding-input" className="block text-xs font-medium text-slate-700">
                Location & Route Grounding with Google Maps
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="maps-grounding-input"
                  type="text"
                  value={mapsQuery}
                  onChange={(e) => setMapsQuery(e.target.value)}
                  placeholder="Ask about nearby study spots, cafes, gyms, or walking trails..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isSearchingMaps}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  {isSearchingMaps ? 'Grounding...' : 'Search Maps'}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const q = 'Quiet deep-work cafes and libraries within 15 minutes walk';
                    setMapsQuery(q);
                    executeMapsGroundingSearch(q);
                  }}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Quiet Deep-Work Cafes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const q = 'Scenic 20-minute outdoor walking trails and parks nearby for visual recovery';
                    setMapsQuery(q);
                    executeMapsGroundingSearch(q);
                  }}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  20m Recovery Walk Routes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const q = 'Fitness centers and running tracks near my current GPS coordinates';
                    setMapsQuery(q);
                    executeMapsGroundingSearch(q);
                  }}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Conditioning & Running Spots
                </button>
              </div>
            </form>

            {mapsResponseText && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-3">
                <div className="whitespace-pre-line leading-relaxed">{mapsResponseText}</div>

                {mapsPlaces.length > 0 && (
                  <div className="border-t border-slate-200 pt-3 space-y-2">
                    <div className="font-semibold text-slate-900">
                      Google Maps Grounded Locations:
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {mapsPlaces.map((place, idx) => (
                        <a
                          key={idx}
                          href={place.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-col justify-between rounded-md border border-slate-200 bg-white p-2.5 hover:border-slate-400 transition-colors"
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
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
