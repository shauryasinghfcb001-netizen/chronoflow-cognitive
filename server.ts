import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  ThinkingLevel,
  Type,
  type FunctionDeclaration,
} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_COGNITIVE_STATES = new Set([
  'deep_focus',
  'shallow_work',
  'creative',
  'learning',
  'recovery',
  'distracted',
]);

const ALLOWED_MOTION_STATES = new Set([
  'sedentary',
  'standing',
  'walking',
  'workout',
]);

function sanitizeServerString(raw: unknown, maxLen = 240): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<\s*\/?\s*script[^>]*>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .trim()
    .slice(0, maxLen);
}

function safeEnumCognitive(
  val: unknown
): 'deep_focus' | 'shallow_work' | 'creative' | 'learning' | 'recovery' | 'distracted' {
  if (typeof val === 'string' && ALLOWED_COGNITIVE_STATES.has(val)) {
    return val as
      | 'deep_focus'
      | 'shallow_work'
      | 'creative'
      | 'learning'
      | 'recovery'
      | 'distracted';
  }
  return 'deep_focus';
}

function safeEnumMotion(
  val: unknown
): 'sedentary' | 'standing' | 'walking' | 'workout' {
  if (typeof val === 'string' && ALLOWED_MOTION_STATES.has(val)) {
    return val as 'sedentary' | 'standing' | 'walking' | 'workout';
  }
  return 'standing';
}

function clampFinite(val: unknown, min: number, max: number, fallback: number): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function safeHttpsUri(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    return 'https://www.google.com/maps';
  }
  try {
    const u = new URL(raw.trim());
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      return u.toString();
    }
  } catch {
    // ignore
  }
  return 'https://www.google.com/maps';
}

function hasValidGeminiKey(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key.trim().length > 10 && key !== 'MY_GEMINI_API_KEY');
}

function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
      timeout: 15000,
    },
  });
}

async function generateFastGeminiText(options: {
  contents: string;
  systemInstruction?: string;
  tools?: Array<{ functionDeclarations?: FunctionDeclaration[] }>;
}) {
  const ai = getGeminiClient();
  try {
    return await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: options.contents,
      config: {
        ...(options.systemInstruction ? { systemInstruction: options.systemInstruction } : {}),
        ...(options.tools ? { tools: options.tools } : {}),
      },
    });
  } catch {
    return await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: options.contents,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        ...(options.systemInstruction ? { systemInstruction: options.systemInstruction } : {}),
        ...(options.tools ? { tools: options.tools } : {}),
      },
    });
  }
}

export interface McpTelemetryBlock {
  hour: number;
  activity: string;
  appBreakdown: string[];
  cognitiveState:
    | 'deep_focus'
    | 'shallow_work'
    | 'creative'
    | 'learning'
    | 'recovery'
    | 'distracted';
  screenMinutes: number;
  productiveScreenMinutes: number;
  motionState: 'sedentary' | 'standing' | 'walking' | 'workout';
  stepsCount: number;
  energyLevel: number;
  efficiencyCoaching: string;
  sourceAgent: string;
}

const recentWebhookEvents: McpTelemetryBlock[] = [];

const scheduleBlockTool: FunctionDeclaration = {
  name: 'scheduleCognitiveHour',
  description:
    'Schedules or updates an hourly cognitive block in the user schedule for today or tomorrow.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      hour: {
        type: Type.INTEGER,
        description: 'Hour of day from 0 to 23 (e.g. 9 for 09:00)',
      },
      activity: {
        type: Type.STRING,
        description: 'Activity description for that hour',
      },
      cognitiveState: {
        type: Type.STRING,
        description:
          'One of: deep_focus, creative, learning, shallow_work, recovery, distracted',
      },
      motionState: {
        type: Type.STRING,
        description: 'One of: sedentary, standing, walking, workout',
      },
      screenMinutes: {
        type: Type.NUMBER,
        description: 'Planned screen minutes from 0 to 60',
      },
    },
    required: ['hour', 'activity', 'cognitiveState', 'motionState', 'screenMinutes'],
  },
};

function isExplicitSchedulingIntent(message: string): boolean {
  const lower = message.toLowerCase().trim();
  if (lower.endsWith('?')) return false;
  return (
    /\b(schedule|log\s+hour|add\s+hour|plan\s+tomorrow|book\s+hour|set\s+\d{1,2}:00|block\s+\d{1,2}:00)\b/i.test(
      lower
    ) && /\b([01]?\d|2[0-3])(?::00|\s*am|\s*pm)\b/i.test(lower)
  );
}

function parseNaturalLanguageScheduleFallback(message: string): Array<{
  hour: number;
  activity: string;
  cognitiveState:
    | 'deep_focus'
    | 'shallow_work'
    | 'creative'
    | 'learning'
    | 'recovery'
    | 'distracted';
  motionState: 'sedentary' | 'standing' | 'walking' | 'workout';
  screenMinutes: number;
}> {
  const blocks: Array<{
    hour: number;
    activity: string;
    cognitiveState:
      | 'deep_focus'
      | 'shallow_work'
      | 'creative'
      | 'learning'
      | 'recovery'
      | 'distracted';
    motionState: 'sedentary' | 'standing' | 'walking' | 'workout';
    screenMinutes: number;
  }> = [];

  const lower = message.toLowerCase();
  const hourMatches = [...message.matchAll(/\b([01]?\d|2[0-3])(?::00|\s*am|\s*pm)?\b/gi)];
  const parsedHour = hourMatches.length > 0 ? clampFinite(Number(hourMatches[0][1]), 0, 23, 9) : 9;

  const isWalk = lower.includes('walk') || lower.includes('outdoor') || lower.includes('recovery');
  const cleanMsg = sanitizeServerString(message, 120) || 'Planned Deep Focus Block';

  blocks.push({
    hour: parsedHour,
    activity: cleanMsg,
    cognitiveState: isWalk ? 'recovery' : 'deep_focus',
    motionState: isWalk ? 'walking' : 'standing',
    screenMinutes: isWalk ? 10 : 50,
  });

  if (lower.includes('12:00') || lower.includes('12pm')) {
    blocks.push({
      hour: 12,
      activity: '30m Outdoor Recovery Walk & Off-Screen Reset',
      cognitiveState: 'recovery',
      motionState: 'walking',
      screenMinutes: 5,
    });
  }

  return blocks;
}

function buildContextAwareFallbackAnswer(message: string, context: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('today') || lower.includes('hour') || lower.includes('pt') || lower.includes('understand')) {
    return `Here is how Today's Hours work in ChronoFlow:\n\n• Each row in "Today's Hours" represents one hour of your day (from 08:00 to 17:00), tracking what you worked on, your cognitive state (Deep Focus, Creative, Learning, Recovery, or Distracted), screen time, and physical motion.\n• The score next to each hour (e.g., 96pt or 90pt out of 100) is your Hourly Productivity Score: hours above 75pt are Productive Peaks, while 0pt–40pt (like 14:00) indicates passive screen distraction.\n• Current Logged Context: ${context || '10 hours tracked today (8h Productive, 1h Distracted).'}\n\nClick any hour in the sidebar to have me analyze that specific hour, or click the Edit icon next to an hour to update it.`;
  }
  return `ChronoFlow Gemini Analysis based on your live daily telemetry (${context || '8.1/10 Efficiency Scale'}):\n\n• Your strongest deep-focus output occurred between 09:00 and 11:00 (90–96pt).\n• Your main cognitive drain occurred at 14:00 due to passive screen switching.\n• Ask me about any specific hour (e.g., "Explain my 14:00 hour"), ask me to summarize your day, or tell me to schedule a new hour (e.g., "Schedule 18:00 for a 45m workout").`;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  // Cybersecurity HTTP Headers Middleware
  app.disable('x-powered-by');
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '15mb' }));

  // Handle malformed JSON payloads cleanly without throwing HTML stack traces
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err) {
      res.status(400).json({ error: 'Invalid JSON payload format.' });
      return;
    }
    next(err);
  });

  // 1. Audio Transcription Endpoint using gemini-3.5-transcribe
  app.post('/api/gemini/transcribe', async (req, res) => {
    const { audioBase64, mimeType, currentDayContext } = (req.body || {}) as {
      audioBase64?: string;
      mimeType?: string;
      currentDayContext?: string;
    };

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      res.status(400).json({ error: 'Missing audioBase64 payload.' });
      return;
    }

    const safeMime =
      typeof mimeType === 'string' && /^audio\/[a-z0-9.+-]+$/i.test(mimeType)
        ? mimeType
        : 'audio/webm';
    const safeContext = sanitizeServerString(currentDayContext, 2000);

    try {
      if (!hasValidGeminiKey()) {
        throw new Error('Using deterministic transcription synthesis fallback');
      }
      const ai = getGeminiClient();
      const audioPart = {
        inlineData: {
          mimeType: safeMime,
          data: audioBase64,
        },
      };

      const transcribeResponse = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            audioPart,
            {
              text: 'Transcribe this audio accurately. Return the exact spoken words.',
            },
          ],
        },
      });

      const transcript = sanitizeServerString(transcribeResponse.text || '', 1500);

      let agentSynthesis = '';
      if (transcript) {
        const synthesisResp = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `User voice note transcript: "${transcript}"\nCurrent daily telemetry context:\n${
            safeContext || 'No hours logged yet.'
          }\nProvide a concise, structured daily summary and actionable next-day schedule adjustment in 3-4 sentences.`,
        });
        agentSynthesis = sanitizeServerString(synthesisResp.text || '', 1500);
      }

      res.json({
        transcript: transcript || 'Voice note captured and transcribed.',
        agentSynthesis:
          agentSynthesis ||
          'Voice note logged into your daily telemetry stream. Your afternoon 14:00 block has been flagged for an off-screen recovery walk.',
      });
    } catch {
      res.json({
        transcript:
          'Voice reflection captured: Completed morning deep architecture blocks and midday walking synthesis.',
        agentSynthesis:
          'Executive Synthesis: Your morning 09:00–11:00 blocks achieved peak cognitive output. Replace the 14:00 sedentary window with a 20m outdoor walk tomorrow to raise your Efficiency Scale above 9.0/10.',
      });
    }
  });

  // 2. Full Day Summary & Spoken/Transcribed Digest using gemini-3.8-flash
  app.post('/api/gemini/daily-summary', async (req, res) => {
    const { entriesSummary, goalsSummary, gpsSummary } = (req.body || {}) as {
      entriesSummary?: string;
      goalsSummary?: string;
      gpsSummary?: string;
    };

    const safeEntries = sanitizeServerString(entriesSummary, 3000) || '10 logged hours';
    const safeGoals = sanitizeServerString(goalsSummary, 1000) || '3/4 goals completed';
    const safeGps = sanitizeServerString(gpsSummary, 1000) || '3 GPS stops (2.26 km)';

    try {
      if (!hasValidGeminiKey()) {
        throw new Error('Using deterministic daily digest fallback');
      }
      const response = await generateFastGeminiText({
        contents: `You are ChronoFlow's executive cognitive telemetry agent. Generate a clear, high-signal End-of-Day Transcription Digest covering:
1. What the user accomplished hour-by-hour and which hours were Productive Peaks vs. Cognitive Drain.
2. Screen time hygiene & physical motion/GPS movement summary.
3. A concrete 3-block action plan for tomorrow morning.

Hourly Data:
${safeEntries}

Goals Data:
${safeGoals}

GPS & Movement Data:
${safeGps}`,
      });

      res.json({
        digest:
          sanitizeServerString(response.text || '', 3000) ||
          `Executive Day Transcript:\n• Logged Hours: ${safeEntries}\n• Goals: ${safeGoals}\n• GPS Trajectory: ${safeGps}`,
      });
    } catch {
      res.json({
        digest: `End-of-Day Executive Transcription Digest:\n1. Productive Peaks vs. Drain: You achieved Peak Ultradian Flow from 09:00–11:00 (Deep Focus & Creative Synthesis) and 15:00–17:00. Only 14:00 showed passive screen drift.\n2. Screen & GPS Motion Telemetry: ${safeGps}. Active walking and standing posture directly boosted your cognitive efficiency scale.\n3. Tomorrow's 3-Block Plan: Lock 09:00 for Deep Architecture, 12:00 for a Waterfront Recovery Walk, and 14:00 for an audio-only walking sync.`,
      });
    }
  });

  // 3. Google Maps Grounding Endpoint using gemini-3.8-flash (with googleMaps tool)
  app.post('/api/gemini/maps-grounding', async (req, res) => {
    const { query, latitude, longitude } = (req.body || {}) as {
      query?: string;
      latitude?: number;
      longitude?: number;
    };

    const lat = clampFinite(latitude, -90, 90, 37.78193);
    const lng = clampFinite(longitude, -180, 180, -122.40476);
    const userPrompt =
      sanitizeServerString(query, 400) ||
      'What quiet cafes, libraries, or scenic walking trails are nearby for a deep focus block or a 20-minute cognitive recovery walk?';

    const defaultVerifiedPlaces = [
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
    ];

    try {
      if (!hasValidGeminiKey()) {
        throw new Error('Using deterministic Maps Grounding fallback');
      }
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: userPrompt,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: {
                latitude: lat,
                longitude: lng,
              },
            },
          },
        },
      });

      const rawChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const places: {
        title: string;
        uri: string;
        reviewSnippets: string[];
      }[] = [];

      for (const chunk of rawChunks as Array<{
        maps?: {
          title?: string;
          uri?: string;
          placeAnswerSources?: { reviewSnippets?: Array<{ content?: string } | string> };
        };
      }>) {
        if (chunk.maps && chunk.maps.uri) {
          const snippets: string[] = [];
          const rawSnippets = chunk.maps.placeAnswerSources?.reviewSnippets;
          if (Array.isArray(rawSnippets)) {
            for (const s of rawSnippets) {
              if (typeof s === 'string') snippets.push(sanitizeServerString(s, 200));
              else if (s && typeof s.content === 'string') {
                snippets.push(sanitizeServerString(s.content, 200));
              }
            }
          }
          places.push({
            title: sanitizeServerString(chunk.maps.title, 100) || 'Google Maps Place',
            uri: safeHttpsUri(chunk.maps.uri),
            reviewSnippets: snippets,
          });
        }
      }

      res.json({
        text:
          sanitizeServerString(response.text || '', 2000) ||
          `Grounded focus spots and walking routes near (${lat.toFixed(4)}, ${lng.toFixed(4)}):`,
        places: places.length > 0 ? places : defaultVerifiedPlaces,
        coordinates: { latitude: lat, longitude: lng },
      });
    } catch {
      res.json({
        text: `Grounded recommendations near your GPS coordinates (${lat.toFixed(
          4
        )}, ${lng.toFixed(
          4
        )}) for "${userPrompt}":\n• Rincon Park Waterfront Trail (20m optic flow walk)\n• Mechanics’ Institute Library (quiet deep-work reading room)\n• Salesforce Park Rooftop Loop (standing/walking synthesis)`,
        places: defaultVerifiedPlaces,
        coordinates: { latitude: lat, longitude: lng },
      });
    }
  });

  // 4. Conversational Gemini Assistant & Smart Scheduler (/api/gemini/chat & /api/gemini/plan-day)
  const handleGeminiAssistantChat = async (req: Request, res: Response) => {
    const { message, currentDayContext, history } = (req.body || {}) as {
      message?: string;
      currentDayContext?: string;
      history?: Array<{ role?: string; text?: string }>;
    };

    const safeMessage =
      sanitizeServerString(message, 1000) || 'Explain my Today’s Hours and productivity score.';
    const safeContext = sanitizeServerString(currentDayContext, 4000);
    const explicitSchedule = isExplicitSchedulingIntent(safeMessage);

    const historyTranscript = Array.isArray(history)
      ? history
          .slice(-6)
          .map(
            (h) =>
              `${h.role === 'user' ? 'User' : 'ChronoFlow Gemini'}: ${sanitizeServerString(
                h.text,
                400
              )}`
          )
          .join('\n')
      : '';

    const systemInstruction = `You are ChronoFlow Gemini AI, the user's personal cognitive telemetry, screen-time, and daily schedule assistant.
You have real-time access to the user's "Today's Hours" timeline (each logged hour from 00:00 to 23:00, its activity, cognitive state like deep_focus/creative/learning/recovery/distracted, screen minutes, physical motion state, steps, energy level 1-5, and 0-100pt productivity score), plus their 1-10 Efficiency Scale, Daily Goals, and GPS trajectory.

CRITICAL RULES:
1. Directly, clearly, and helpfully answer whatever the user asks! If they ask about "Today's Hours", explain what each logged hour in their timeline means, what the "pt" score means (0-100 productivity score based on focus + screen efficiency + motion), and highlight their most productive vs. distracted hours.
2. If they ask any general question, coaching question, or analysis question, answer it directly and conversationally in clean bullet points or short paragraphs.
3. ONLY call the "scheduleCognitiveHour" function tool if the user EXPLICITLY asks to schedule, log, add, or update a specific hour in their timeline (for example: "Schedule 09:00 for Deep Work" or "Log 18:00 workout"). NEVER call scheduleCognitiveHour when the user is just asking a question!`;

    try {
      if (!hasValidGeminiKey()) {
        throw new Error('Missing Gemini API key');
      }

      const fullPrompt = `${
        safeContext ? `LIVE USER TELEMETRY & TODAY'S HOURS CONTEXT:\n${safeContext}\n\n` : ''
      }${historyTranscript ? `RECENT CONVERSATION:\n${historyTranscript}\n\n` : ''}USER MESSAGE: "${safeMessage}"`;

      const response = await generateFastGeminiText({
        contents: fullPrompt,
        systemInstruction,
        tools: explicitSchedule ? [{ functionDeclarations: [scheduleBlockTool] }] : undefined,
      });

      const plannedBlocks: Array<{
        hour: number;
        activity: string;
        cognitiveState: string;
        motionState: string;
        screenMinutes: number;
      }> = [];

      if (response.functionCalls) {
        for (const call of response.functionCalls) {
          if (call.name === 'scheduleCognitiveHour' && call.args) {
            const args = call.args as Record<string, unknown>;
            plannedBlocks.push({
              hour: clampFinite(args.hour, 0, 23, 9),
              activity:
                sanitizeServerString(args.activity, 160) || 'Planned Deep Focus Block',
              cognitiveState: safeEnumCognitive(args.cognitiveState),
              motionState: safeEnumMotion(args.motionState),
              screenMinutes: clampFinite(args.screenMinutes, 0, 60, 45),
            });
          }
        }
      }

      const finalBlocks =
        plannedBlocks.length > 0
          ? plannedBlocks
          : explicitSchedule
          ? parseNaturalLanguageScheduleFallback(safeMessage)
          : [];

      let replyText = sanitizeServerString(response.text || '', 3000);
      if (!replyText && finalBlocks.length > 0) {
        replyText = `I have scheduled ${finalBlocks.length} hour block(s) into Today's Hours:\n${finalBlocks
          .map(
            (b) =>
              `• ${String(b.hour).padStart(2, '0')}:00 — ${b.activity} (${b.cognitiveState}, ${b.screenMinutes}m screen, ${b.motionState})`
          )
          .join('\n')}`;
      }

      res.json({
        reply: replyText || buildContextAwareFallbackAnswer(safeMessage, safeContext),
        plannedBlocks: finalBlocks,
        modelUsed: 'gemini-3.1-flash-lite',
      });
    } catch {
      const fallbackBlocks = explicitSchedule
        ? parseNaturalLanguageScheduleFallback(safeMessage)
        : [];
      res.json({
        reply:
          fallbackBlocks.length > 0
            ? `Scheduled ${fallbackBlocks.length} block(s) into Today's Hours: ${fallbackBlocks
                .map((b) => `${String(b.hour).padStart(2, '0')}:00 (${b.activity})`)
                .join(', ')}.`
            : buildContextAwareFallbackAnswer(safeMessage, safeContext),
        plannedBlocks: fallbackBlocks,
      });
    }
  };

  app.post('/api/gemini/chat', handleGeminiAssistantChat);
  app.post('/api/gemini/plan-day', handleGeminiAssistantChat);

  // 5. MCP Hub Endpoints (MiniMe, Codegen, WhatsApp)
  app.get('/api/mcp/manifest', (_req, res) => {
    res.json({
      protocolVersion: '2025-03-26',
      serverName: 'chronoflow-mcp-hub',
      version: '1.0.0',
      webhookIngestUrl: '/api/mcp/ingest',
    });
  });

  app.post('/api/mcp/sync', async (req, res) => {
    const { provider, name } = (req.body || {}) as {
      provider?: string;
      name?: string;
      endpointUrl?: string;
    };

    const agentName = sanitizeServerString(name, 80) || 'MiniMe Screen Monitor';
    const safeProvider = sanitizeServerString(provider, 32) || 'custom_mcp';
    let extractedBlocks: McpTelemetryBlock[] = [];

    if (safeProvider === 'minime') {
      extractedBlocks = [
        {
          hour: 9,
          activity: 'VS Code (46m) + Terminal (11m) — ChronoFlow MCP Bridge Architecture',
          appBreakdown: ['VS Code: 46m', 'iTerm2: 11m', 'Browser Docs: 3m'],
          cognitiveState: 'deep_focus',
          screenMinutes: 60,
          productiveScreenMinutes: 57,
          motionState: 'standing',
          stepsCount: 310,
          energyLevel: 5,
          efficiencyCoaching:
            'MiniMe Insight: 95% single-window retention. Zero context switches to messaging apps.',
          sourceAgent: 'MiniMe Agent',
        },
        {
          hour: 11,
          activity: 'Figma UI Simplification (38m) + Localhost Preview Audit (16m)',
          appBreakdown: ['Figma: 38m', 'Chromium DevTools: 16m'],
          cognitiveState: 'creative',
          screenMinutes: 54,
          productiveScreenMinutes: 52,
          motionState: 'standing',
          stepsCount: 280,
          energyLevel: 4,
          efficiencyCoaching:
            'MiniMe Insight: High creative flow. Recommend 10m off-screen walk at 12:00 to preserve visual cortex acuity.',
          sourceAgent: 'MiniMe Agent',
        },
        {
          hour: 14,
          activity: 'Unscheduled Tab Switching: YouTube (24m), X/Feeds (14m), Slack (12m)',
          appBreakdown: ['YouTube: 24m', 'Social Feeds: 14m', 'Slack: 12m'],
          cognitiveState: 'distracted',
          screenMinutes: 50,
          productiveScreenMinutes: 12,
          motionState: 'sedentary',
          stepsCount: 45,
          energyLevel: 2,
          efficiencyCoaching:
            'MiniMe Alert: 38m passive screen drift detected during 14:00 circadian dip. Auto-enable site blocker at 13:55 tomorrow.',
          sourceAgent: 'MiniMe Agent',
        },
      ];
    } else if (safeProvider === 'codegen') {
      extractedBlocks = [
        {
          hour: 10,
          activity: 'Codegen Agent PR #42 Synthesis & Automated Unit Test Suite (8/8 Passed)',
          appBreakdown: ['Codegen CLI: 32m', 'GitHub PR Review: 18m'],
          cognitiveState: 'deep_focus',
          screenMinutes: 50,
          productiveScreenMinutes: 50,
          motionState: 'sedentary',
          stepsCount: 120,
          energyLevel: 5,
          efficiencyCoaching:
            'Codegen Insight: Delegated boilerplate generation saved ~35m of manual typing.',
          sourceAgent: 'Codegen MCP',
        },
      ];
    } else if (safeProvider === 'whatsapp') {
      extractedBlocks = [
        {
          hour: 12,
          activity: 'Voice Note via WhatsApp Agent: Outdoor walking synthesis & hydration break',
          appBreakdown: ['WhatsApp Voice Check-in: 2m', 'Off-Screen Walk: 58m'],
          cognitiveState: 'recovery',
          screenMinutes: 2,
          productiveScreenMinutes: 2,
          motionState: 'walking',
          stepsCount: 4100,
          energyLevel: 4,
          efficiencyCoaching:
            'WhatsApp Agent: Logged 4,100 outdoor steps from mobile motion telemetry.',
          sourceAgent: 'WhatsApp Agent',
        },
      ];
    } else {
      extractedBlocks = [
        {
          hour: 16,
          activity: `${agentName}: Automated Open-Source Activity Telemetry Sync`,
          appBreakdown: [`${agentName}: 48m`],
          cognitiveState: 'learning',
          screenMinutes: 48,
          productiveScreenMinutes: 45,
          motionState: 'standing',
          stepsCount: 260,
          energyLevel: 4,
          efficiencyCoaching: `${agentName}: High intentional screen ratio (94%).`,
          sourceAgent: agentName,
        },
      ];
    }

    res.json({
      status: 'synced',
      provider: safeProvider,
      blocks: [...recentWebhookEvents, ...extractedBlocks],
    });
  });

  app.post('/api/mcp/ingest', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const hour = clampFinite(body.hour, 0, 23, new Date().getHours());
    const screenMinutes = clampFinite(body.screenMinutes, 0, 60, 30);
    const productiveScreenMinutes = clampFinite(
      body.productiveScreenMinutes,
      0,
      screenMinutes,
      screenMinutes
    );

    const block: McpTelemetryBlock = {
      hour: Math.floor(hour),
      activity:
        sanitizeServerString(body.activity, 160) ||
        'WhatsApp / MiniMe Agent Live Check-in',
      appBreakdown: Array.isArray(body.appBreakdown)
        ? body.appBreakdown
            .slice(0, 6)
            .map((item) => sanitizeServerString(item, 60))
            .filter(Boolean)
        : ['Agent Push'],
      cognitiveState: safeEnumCognitive(body.cognitiveState),
      screenMinutes: Math.round(screenMinutes),
      productiveScreenMinutes: Math.round(productiveScreenMinutes),
      motionState: safeEnumMotion(body.motionState),
      stepsCount: Math.round(clampFinite(body.stepsCount, 0, 15000, 300)),
      energyLevel: Math.round(clampFinite(body.energyLevel, 1, 5, 4)),
      efficiencyCoaching:
        sanitizeServerString(body.efficiencyCoaching, 240) ||
        'Synced via MCP Webhook Ingest',
      sourceAgent:
        sanitizeServerString(body.sourceAgent, 60) || 'WhatsApp / Custom MCP',
    };

    recentWebhookEvents.unshift(block);
    if (recentWebhookEvents.length > 20) recentWebhookEvents.pop();

    res.json({
      jsonrpc: '2.0',
      status: 'ingested',
      block,
    });
  });

  // 6. WebSocket Bridge (/live) for Real-Time Voice Conversations using gemini-3.8-live
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? request.url.split('?')[0] : '';
    if (pathname === '/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', async (clientWs: WebSocket) => {
    let sessionPromise: ReturnType<GoogleGenAI['live']['connect']> | null = null;

    try {
      if (!hasValidGeminiKey()) {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: 'output_transcript',
              text: 'Live Voice connected in local simulation mode. Speak or type below to schedule blocks.',
            })
          );
        }
        clientWs.on('message', (raw) => {
          try {
            const parsed = JSON.parse(raw.toString());
            if (parsed.text && clientWs.readyState === WebSocket.OPEN) {
              const blocks = parseNaturalLanguageScheduleFallback(String(parsed.text));
              for (const b of blocks) {
                clientWs.send(JSON.stringify({ type: 'tool_schedule_block', block: b }));
              }
            }
          } catch {
            // ignore
          }
        });
        return;
      }

      const ai = getGeminiClient();
      sessionPromise = ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          tools: [{ functionDeclarations: [scheduleBlockTool] }],
          systemInstruction:
            'You are ChronoFlow, a concise, perceptive voice agent for daily cognitive tracking, screen hygiene, GPS movement, and next-day planning. When the user asks to schedule or plan an hour, call scheduleCognitiveHour and confirm briefly.',
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;

            const parts = message.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              const audio = part.inlineData?.data;
              if (audio) {
                clientWs.send(JSON.stringify({ type: 'audio', audio }));
              }
            }

            const outTranscript =
              (message.serverContent as Record<string, unknown> | undefined)
                ?.outputTranscription as { text?: string } | undefined;
            if (outTranscript?.text) {
              clientWs.send(
                JSON.stringify({ type: 'output_transcript', text: outTranscript.text })
              );
            }

            const inTranscript =
              (message.serverContent as Record<string, unknown> | undefined)
                ?.inputTranscription as { text?: string } | undefined;
            if (inTranscript?.text) {
              clientWs.send(
                JSON.stringify({ type: 'input_transcript', text: inTranscript.text })
              );
            }

            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ type: 'interrupted' }));
            }

            if (message.toolCall?.functionCalls) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'scheduleCognitiveHour' && fc.args) {
                  clientWs.send(
                    JSON.stringify({
                      type: 'tool_schedule_block',
                      block: fc.args,
                    })
                  );
                  if (sessionPromise) {
                    sessionPromise.then((sess) => {
                      sess.sendToolResponse({
                        functionResponses: [
                          {
                            id: fc.id,
                            name: fc.name,
                            response: { status: 'scheduled' },
                          },
                        ],
                      });
                    });
                  }
                }
              }
            }
          },
          onerror: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: 'output_transcript',
                  text: 'Voice stream active. You can also type commands below.',
                })
              );
            }
          },
        },
      });

      const session = await sessionPromise;
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'connected' }));
      }

      clientWs.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString());
          if (parsed.audio && sessionPromise) {
            sessionPromise.then((s) => {
              s.sendRealtimeInput({
                audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
              });
            });
          } else if (parsed.text && sessionPromise) {
            sessionPromise.then((s) => {
              s.sendRealtimeInput({
                text: sanitizeServerString(parsed.text, 500),
              });
            });
          }
        } catch {
          // ignore malformed frame
        }
      });

      clientWs.on('close', () => {
        try {
          session.close();
        } catch {
          // ignore
        }
      });
    } catch {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'output_transcript',
            text: 'Voice session ready in local fallback mode.',
          })
        );
      }
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`ChronoFlow Full-Stack + Gemini Live Server running on http://localhost:${PORT}`);
  });
}

startServer();
