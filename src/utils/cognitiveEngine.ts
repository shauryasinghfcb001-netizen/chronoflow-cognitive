export type CognitiveState =
  | 'deep_focus'
  | 'shallow_work'
  | 'creative'
  | 'learning'
  | 'recovery'
  | 'distracted';

export type MotionState = 'sedentary' | 'standing' | 'walking' | 'workout';

export type GoalCategory = 'deep_work' | 'screen_hygiene' | 'motion' | 'habit';

export interface HourlyEntry {
  id: string;
  dateKey: string;
  hour: number; // 0 - 23
  activity: string;
  cognitiveState: CognitiveState;
  screenMinutes: number; // 0 - 60
  productiveScreenMinutes: number; // 0 - 60
  motionState: MotionState;
  stepsCount: number; // 0 - 15000
  energyLevel: number; // 1 - 5
  notes?: string;
}

export interface DailyGoalItem {
  id: string;
  title: string;
  category: GoalCategory;
  targetValue: number;
  currentValue: number;
  unit: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
}

export interface DayTemplate {
  id: string;
  name: string;
  subtitle: string;
  targetAudience: string;
  benchmarkOrigin: string;
  entries: Omit<HourlyEntry, 'id' | 'dateKey'>[];
  goals: Omit<DailyGoalItem, 'id'>[];
}

export interface HourlyProductivityScore {
  hour: number;
  score: number; // 0 - 100
  classification: 'Productive Peak' | 'Effective Flow' | 'Neutral Maintenance' | 'Cognitive Drain';
  passiveScreenMinutes: number;
  motionBonus: number;
}

export interface DailyCognitiveAnalytics {
  totalTrackedHours: number;
  productiveHoursCount: number;
  unproductiveHoursCount: number;
  deepFocusHours: number;
  totalScreenMinutes: number;
  productiveScreenMinutes: number;
  passiveScreenMinutes: number;
  screenEfficiencyPct: number;
  activeMotionHours: number;
  totalSteps: number;
  overallCognitiveIndex: number; // 0 - 100
  peakHour: number | null;
  drainHour: number | null;
  chronotypeWindow: string;
  hourlyScores: Record<number, HourlyProductivityScore>;
  sedentaryStreakWarning: boolean;
}

export const COGNITIVE_STATE_META: Record<
  CognitiveState,
  { label: string; weight: number; description: string }
> = {
  deep_focus: {
    label: 'Deep Focus',
    weight: 1.0,
    description: 'High-leverage, distraction-free analytical or engineering output',
  },
  creative: {
    label: 'Creative Synthesis',
    weight: 0.92,
    description: 'Architecture, writing, design, or strategic ideation',
  },
  learning: {
    label: 'Active Learning',
    weight: 0.85,
    description: 'Deliberate study, research synthesis, or skill acquisition',
  },
  shallow_work: {
    label: 'Shallow Operations',
    weight: 0.55,
    description: 'Admin, triage, email, routine coordination, or status syncs',
  },
  recovery: {
    label: 'Intentional Recovery',
    weight: 0.72,
    description: 'Ultradian rest, walk, nutrition, mindfulness, or off-screen recharge',
  },
  distracted: {
    label: 'Fragmented / Distracted',
    weight: 0.12,
    description: 'Context switching, doomscrolling, or unplanned passive screen drift',
  },
};

export const MOTION_STATE_META: Record<
  MotionState,
  { label: string; cognitiveModifier: number; defaultSteps: number }
> = {
  sedentary: {
    label: 'Sedentary Desk',
    cognitiveModifier: 0,
    defaultSteps: 80,
  },
  standing: {
    label: 'Standing Posture',
    cognitiveModifier: 6,
    defaultSteps: 220,
  },
  walking: {
    label: 'Active Walk / Pacing',
    cognitiveModifier: 12,
    defaultSteps: 3200,
  },
  workout: {
    label: 'Metabolic Training',
    cognitiveModifier: 15,
    defaultSteps: 4800,
  },
};

export function normalizeCognitiveState(val: unknown): CognitiveState {
  if (
    typeof val === 'string' &&
    (val === 'deep_focus' ||
      val === 'shallow_work' ||
      val === 'creative' ||
      val === 'learning' ||
      val === 'recovery' ||
      val === 'distracted')
  ) {
    return val;
  }
  return 'deep_focus';
}

export function normalizeMotionState(val: unknown): MotionState {
  if (
    typeof val === 'string' &&
    (val === 'sedentary' || val === 'standing' || val === 'walking' || val === 'workout')
  ) {
    return val;
  }
  return 'standing';
}

export function sanitizeTextInput(raw: unknown, maxLength = 240): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<\s*\/?\s*script[^>]*>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .trim()
    .slice(0, maxLength);
}

export function validateSafeEndpointUrl(rawUrl: unknown): {
  valid: boolean;
  sanitizedUrl: string;
  error?: string;
} {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { valid: false, sanitizedUrl: '', error: 'Endpoint URL is required.' };
  }
  const trimmed = rawUrl.trim().slice(0, 256);
  const lower = trimmed.toLowerCase();

  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file:')
  ) {
    return {
      valid: false,
      sanitizedUrl: '',
      error: 'Unsafe URI scheme blocked by security policy.',
    };
  }

  if (
    lower.includes('169.254.169.254') ||
    lower.includes('metadata.google.internal') ||
    lower.includes('[::ffff:169.254.169.254]')
  ) {
    return {
      valid: false,
      sanitizedUrl: '',
      error: 'Cloud metadata SSRF target blocked by security policy.',
    };
  }

  if (trimmed.startsWith('/api/')) {
    return { valid: true, sanitizedUrl: trimmed };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        valid: false,
        sanitizedUrl: '',
        error: 'Only http:// and https:// MCP endpoints are permitted.',
      };
    }
    return { valid: true, sanitizedUrl: parsed.toString().slice(0, 256) };
  } catch {
    return { valid: false, sanitizedUrl: '', error: 'Invalid URL format.' };
  }
}

export function validateSafeMapsUri(rawUri: unknown): string {
  if (typeof rawUri !== 'string' || !rawUri.trim()) {
    return 'https://www.google.com/maps';
  }
  try {
    const parsed = new URL(rawUri.trim());
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    // ignore
  }
  return 'https://www.google.com/maps';
}

export function formatHourLabel(hour: number): string {
  const safeHour = Number.isFinite(hour) ? hour : 0;
  const clamped = Math.max(0, Math.min(23, Math.floor(safeHour)));
  return `${String(clamped).padStart(2, '0')}:00`;
}

export function validateHourlyInput(input: {
  hour: number;
  activity: string;
  screenMinutes: number;
  productiveScreenMinutes: number;
  stepsCount: number;
  energyLevel: number;
}): { valid: boolean; error?: string } {
  if (!Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23) {
    return { valid: false, error: 'Hour must be an integer between 0 and 23.' };
  }
  const trimmed = sanitizeTextInput(input.activity, 160);
  if (trimmed.length < 1 || trimmed.length > 160) {
    return { valid: false, error: 'Activity description is required (1–160 characters).' };
  }
  if (
    typeof input.screenMinutes !== 'number' ||
    !Number.isFinite(input.screenMinutes) ||
    input.screenMinutes < 0 ||
    input.screenMinutes > 60
  ) {
    return { valid: false, error: 'Screen time must be between 0 and 60 minutes.' };
  }
  if (
    typeof input.productiveScreenMinutes !== 'number' ||
    !Number.isFinite(input.productiveScreenMinutes) ||
    input.productiveScreenMinutes < 0 ||
    input.productiveScreenMinutes > 60
  ) {
    return { valid: false, error: 'Productive screen time must be between 0 and 60 minutes.' };
  }
  if (input.productiveScreenMinutes > input.screenMinutes) {
    return {
      valid: false,
      error: 'Productive screen minutes cannot exceed total screen minutes in the hour.',
    };
  }
  if (
    typeof input.stepsCount !== 'number' ||
    !Number.isFinite(input.stepsCount) ||
    input.stepsCount < 0 ||
    input.stepsCount > 15000
  ) {
    return { valid: false, error: 'Steps count must be between 0 and 15,000 per hour.' };
  }
  if (
    typeof input.energyLevel !== 'number' ||
    !Number.isFinite(input.energyLevel) ||
    input.energyLevel < 1 ||
    input.energyLevel > 5
  ) {
    return { valid: false, error: 'Energy level must be rated between 1 and 5.' };
  }
  return { valid: true };
}

export function computeHourScore(entry: HourlyEntry): HourlyProductivityScore {
  const safeCognitive = normalizeCognitiveState(entry.cognitiveState);
  const safeMotion = normalizeMotionState(entry.motionState);
  const baseWeight = COGNITIVE_STATE_META[safeCognitive].weight;
  const passiveScreenMinutes = Math.max(0, entry.screenMinutes - entry.productiveScreenMinutes);
  const screenRatio =
    entry.screenMinutes > 0 ? entry.productiveScreenMinutes / entry.screenMinutes : 1;

  // Base cognitive value (0 - 70)
  const basePoints = baseWeight * 68;

  // Energy alignment bonus (0 - 15)
  const energyPoints = ((Math.max(1, Math.min(5, entry.energyLevel || 3)) - 1) / 4) * 14;

  // Motion coupling bonus (0 - 15)
  const motionBonus = MOTION_STATE_META[safeMotion].cognitiveModifier;

  // Passive screen penalty (up to -28 points if high passive screen time)
  const passivePenalty = (passiveScreenMinutes / 60) * 28;

  // Screen intentionality bonus when doing deep/creative/learning work
  const screenBonus =
    entry.cognitiveState === 'recovery' && entry.screenMinutes <= 10
      ? 10
      : screenRatio * 8;

  const rawScore = basePoints + energyPoints + motionBonus + screenBonus - passivePenalty;
  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  let classification: HourlyProductivityScore['classification'] = 'Neutral Maintenance';
  if (score >= 82) {
    classification = 'Productive Peak';
  } else if (score >= 64) {
    classification = 'Effective Flow';
  } else if (score < 45 || entry.cognitiveState === 'distracted') {
    classification = 'Cognitive Drain';
  }

  return {
    hour: entry.hour,
    score,
    classification,
    passiveScreenMinutes,
    motionBonus,
  };
}

export function analyzeDailyCognitiveTelemetry(entries: HourlyEntry[]): DailyCognitiveAnalytics {
  const sorted = [...entries].sort((a, b) => a.hour - b.hour);
  const hourlyScores: Record<number, HourlyProductivityScore> = {};

  let productiveHoursCount = 0;
  let unproductiveHoursCount = 0;
  let deepFocusHours = 0;
  let totalScreenMinutes = 0;
  let productiveScreenMinutes = 0;
  let activeMotionHours = 0;
  let totalSteps = 0;
  let scoreSum = 0;

  let peakHour: number | null = null;
  let peakScore = -1;
  let drainHour: number | null = null;
  let drainScore = 101;

  let consecutiveSedentary = 0;
  let maxConsecutiveSedentary = 0;

  for (const entry of sorted) {
    const evaluated = computeHourScore(entry);
    hourlyScores[entry.hour] = evaluated;
    scoreSum += evaluated.score;

    if (
      evaluated.classification === 'Productive Peak' ||
      evaluated.classification === 'Effective Flow'
    ) {
      productiveHoursCount += 1;
    } else if (evaluated.classification === 'Cognitive Drain') {
      unproductiveHoursCount += 1;
    }

    if (entry.cognitiveState === 'deep_focus' || entry.cognitiveState === 'creative') {
      deepFocusHours += 1;
    }

    totalScreenMinutes += entry.screenMinutes;
    productiveScreenMinutes += entry.productiveScreenMinutes;
    totalSteps += entry.stepsCount;

    if (entry.motionState !== 'sedentary') {
      activeMotionHours += 1;
      consecutiveSedentary = 0;
    } else {
      consecutiveSedentary += 1;
      if (consecutiveSedentary > maxConsecutiveSedentary) {
        maxConsecutiveSedentary = consecutiveSedentary;
      }
    }

    if (evaluated.score > peakScore) {
      peakScore = evaluated.score;
      peakHour = entry.hour;
    }
    if (evaluated.score < drainScore) {
      drainScore = evaluated.score;
      drainHour = entry.hour;
    }
  }

  const passiveScreenMinutes = Math.max(0, totalScreenMinutes - productiveScreenMinutes);
  const screenEfficiencyPct =
    totalScreenMinutes > 0
      ? Math.round((productiveScreenMinutes / totalScreenMinutes) * 100)
      : 100;

  const overallCognitiveIndex =
    sorted.length > 0 ? Math.round(scoreSum / sorted.length) : 0;

  let chronotypeWindow = 'Uncalibrated (Log 3+ hours)';
  if (peakHour !== null) {
    if (peakHour >= 6 && peakHour <= 11) {
      chronotypeWindow = 'Morning Analytical Peak (07:00–11:30)';
    } else if (peakHour >= 12 && peakHour <= 16) {
      chronotypeWindow = 'Afternoon Synthesis Peak (12:00–16:00)';
    } else {
      chronotypeWindow = 'Nocturnal Deep-Flow Peak (17:00–22:00)';
    }
  }

  return {
    totalTrackedHours: sorted.length,
    productiveHoursCount,
    unproductiveHoursCount,
    deepFocusHours,
    totalScreenMinutes,
    productiveScreenMinutes,
    passiveScreenMinutes,
    screenEfficiencyPct,
    activeMotionHours,
    totalSteps,
    overallCognitiveIndex,
    peakHour,
    drainHour,
    chronotypeWindow,
    hourlyScores,
    sedentaryStreakWarning: maxConsecutiveSedentary >= 3,
  };
}

export interface HourlyHeatmapCell {
  hour: number;
  hourLabel: string;
  logged: boolean;
  energyLevel: number; // 0 if unlogged, 1-5 if logged
  energyCode: string; // 'E1'..'E5' or '—'
  energyLabel: string;
  motionState: MotionState | null;
  motionIntensity: number; // 0 if unlogged, 1=sedentary, 2=standing, 3=walking, 4=workout
  motionCode: string; // 'Sed' | 'Std' | 'Wlk' | 'Wrk' | '—'
  motionLabel: string;
  stepsCount: number;
  couplingStatus: 'Peak Synergy' | 'Active Flow' | 'Sedentary Load' | 'Low Energy' | 'Unlogged';
}

const ENERGY_LABELS: Record<number, string> = {
  1: 'Depleted (1/5)',
  2: 'Low Energy (2/5)',
  3: 'Baseline (3/5)',
  4: 'High Focus (4/5)',
  5: 'Peak Alertness (5/5)',
};

const MOTION_INTENSITY_MAP: Record<
  MotionState,
  { intensity: number; code: string; label: string }
> = {
  sedentary: { intensity: 1, code: 'Sed', label: 'Sedentary Desk (L1)' },
  standing: { intensity: 2, code: 'Std', label: 'Standing Posture (L2)' },
  walking: { intensity: 3, code: 'Wlk', label: 'Active Walk (L3)' },
  workout: { intensity: 4, code: 'Wrk', label: 'Metabolic Workout (L4)' },
};

export function computeHourlyHeatmapCells(entries: HourlyEntry[]): HourlyHeatmapCell[] {
  const byHour = new Map<number, HourlyEntry>();
  for (const entry of entries) {
    byHour.set(entry.hour, entry);
  }

  return Array.from({ length: 24 }, (_, hour) => {
    const entry = byHour.get(hour);
    const hourLabel = formatHourLabel(hour);

    if (!entry) {
      return {
        hour,
        hourLabel,
        logged: false,
        energyLevel: 0,
        energyCode: '—',
        energyLabel: 'Unlogged',
        motionState: null,
        motionIntensity: 0,
        motionCode: '—',
        motionLabel: 'Unlogged',
        stepsCount: 0,
        couplingStatus: 'Unlogged',
      };
    }

    const clampedEnergy = Math.max(1, Math.min(5, Math.round(entry.energyLevel)));
    const motionInfo = MOTION_INTENSITY_MAP[entry.motionState];

    let couplingStatus: HourlyHeatmapCell['couplingStatus'] = 'Active Flow';
    if (clampedEnergy >= 4 && motionInfo.intensity >= 2) {
      couplingStatus = 'Peak Synergy';
    } else if (clampedEnergy <= 2) {
      couplingStatus = 'Low Energy';
    } else if (motionInfo.intensity === 1 && clampedEnergy >= 3) {
      couplingStatus = 'Sedentary Load';
    }

    return {
      hour,
      hourLabel,
      logged: true,
      energyLevel: clampedEnergy,
      energyCode: `E${clampedEnergy}`,
      energyLabel: ENERGY_LABELS[clampedEnergy] || `Energy ${clampedEnergy}/5`,
      motionState: entry.motionState,
      motionIntensity: motionInfo.intensity,
      motionCode: motionInfo.code,
      motionLabel: motionInfo.label,
      stepsCount: entry.stepsCount,
      couplingStatus,
    };
  });
}

export type McpProviderType = 'minime' | 'codegen' | 'whatsapp' | 'custom_mcp';

export interface McpConnectorItem {
  id: string;
  name: string;
  provider: McpProviderType;
  endpointUrl: string;
  description: string;
  enabled: boolean;
  lastSyncedAt?: string;
}

export interface McpExtractedBlock {
  hour: number;
  activity: string;
  appBreakdown: string[];
  cognitiveState: CognitiveState;
  screenMinutes: number;
  productiveScreenMinutes: number;
  motionState: MotionState;
  stepsCount: number;
  energyLevel: number;
  efficiencyCoaching: string;
  sourceAgent: string;
}

export const DEFAULT_MCP_CONNECTORS: McpConnectorItem[] = [
  {
    id: 'mcp-minime',
    name: 'MiniMe Screen & Efficiency Agent',
    provider: 'minime',
    endpointUrl: 'http://localhost:4120/mcp/minime',
    description:
      'Monitors active window titles, IDE vs. passive browser time, and generates hourly efficiency coaching.',
    enabled: true,
  },
  {
    id: 'mcp-codegen',
    name: 'Codegen Autonomous Dev MCP',
    provider: 'codegen',
    endpointUrl: 'https://api.codegen.com/v1/mcp',
    description:
      'Extracts automated PR syntheses, test runs, and engineering deep-work blocks into your timeline.',
    enabled: true,
  },
  {
    id: 'mcp-whatsapp',
    name: 'WhatsApp Personal Agent Bridge',
    provider: 'whatsapp',
    endpointUrl: '/api/mcp/ingest',
    description:
      'Receives voice/text hourly check-ins, off-screen walks, and habit updates directly from your WhatsApp agent.',
    enabled: true,
  },
];

export function mergeMcpBlocksIntoEntries(
  existingEntries: HourlyEntry[],
  mcpBlocks: McpExtractedBlock[],
  dateKey: string
): HourlyEntry[] {
  const mapByKey = new Map<string, HourlyEntry>();
  for (const item of existingEntries) {
    mapByKey.set(`${item.dateKey}_h${item.hour}`, item);
  }

  for (const block of mcpBlocks) {
    const safeHour = Number.isFinite(block.hour) ? block.hour : 9;
    const clampedHour = Math.max(0, Math.min(23, Math.floor(safeHour)));
    const safeScreen = Number.isFinite(block.screenMinutes) ? block.screenMinutes : 30;
    const screenMins = Math.max(0, Math.min(60, Math.round(safeScreen)));
    const safeProd = Number.isFinite(block.productiveScreenMinutes)
      ? block.productiveScreenMinutes
      : screenMins;
    const prodMins = Math.max(0, Math.min(screenMins, Math.round(safeProd)));
    const safeSteps = Number.isFinite(block.stepsCount) ? block.stepsCount : 250;
    const safeEnergy = Number.isFinite(block.energyLevel) ? block.energyLevel : 4;
    const key = `${dateKey}_h${clampedHour}`;

    mapByKey.set(key, {
      id: key,
      dateKey,
      hour: clampedHour,
      activity:
        sanitizeTextInput(block.activity, 160) || 'Automated MCP Activity Sync',
      cognitiveState: normalizeCognitiveState(block.cognitiveState),
      screenMinutes: screenMins,
      productiveScreenMinutes: prodMins,
      motionState: normalizeMotionState(block.motionState),
      stepsCount: Math.max(0, Math.min(15000, Math.round(safeSteps))),
      energyLevel: Math.max(1, Math.min(5, Math.round(safeEnergy))),
      notes: sanitizeTextInput(
        `${block.efficiencyCoaching || ''} [${block.sourceAgent || 'MCP'}]`,
        400
      ),
    });
  }

  return Array.from(mapByKey.values()).sort((a, b) => a.hour - b.hour);
}

export interface GpsWaypoint {
  id: string;
  hour: number;
  label: string;
  latitude: number;
  longitude: number;
  motionState: MotionState;
  contextNote: string;
}

export const DEFAULT_GPS_WAYPOINTS: GpsWaypoint[] = [
  {
    id: 'gps-1',
    hour: 8,
    label: 'Morning Sunlight Trail & Park Loop',
    latitude: 37.7858,
    longitude: -122.4065,
    motionState: 'walking',
    contextNote: '3,400 steps · Circadian optic flow walk',
  },
  {
    id: 'gps-2',
    hour: 9,
    label: 'Primary Deep-Work Studio Desk',
    latitude: 37.7819,
    longitude: -122.4048,
    motionState: 'standing',
    contextNote: 'Ultradian Engineering Block 1 & 2',
  },
  {
    id: 'gps-3',
    hour: 12,
    label: 'Waterfront Esplanade Walk',
    latitude: 37.7955,
    longitude: -122.3937,
    motionState: 'walking',
    contextNote: '3,800 steps · Midday off-screen decompression',
  },
];

export function calculateHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export function summarizeGpsTrajectory(waypoints: GpsWaypoint[]): {
  totalDistanceKm: number;
  locationsVisited: number;
  latestWaypoint: GpsWaypoint | null;
} {
  if (waypoints.length === 0) {
    return { totalDistanceKm: 0, locationsVisited: 0, latestWaypoint: null };
  }
  const sorted = [...waypoints].sort((a, b) => a.hour - b.hour);
  let dist = 0;
  for (let i = 1; i < sorted.length; i++) {
    dist += calculateHaversineKm(
      sorted[i - 1].latitude,
      sorted[i - 1].longitude,
      sorted[i].latitude,
      sorted[i].longitude
    );
  }
  return {
    totalDistanceKm: Math.round(dist * 100) / 100,
    locationsVisited: sorted.length,
    latestWaypoint: sorted[sorted.length - 1],
  };
}

export interface TenPointEfficiencyScale {
  overallScale: number; // 1.0 - 10.0
  focusScale: number; // 1.0 - 10.0
  screenHygieneScale: number; // 1.0 - 10.0
  motionScale: number; // 1.0 - 10.0
  goalScale: number; // 1.0 - 10.0
  verdictLabel: string;
}

export function computeTenPointEfficiencyScale(
  analytics: DailyCognitiveAnalytics,
  goals: DailyGoalItem[],
  gpsLocationsCount: number
): TenPointEfficiencyScale {
  const focusScale = Math.max(
    1,
    Math.min(10, Math.round((analytics.overallCognitiveIndex / 10) * 10) / 10)
  );
  const screenHygieneScale = Math.max(
    1,
    Math.min(10, Math.round((analytics.screenEfficiencyPct / 10) * 10) / 10)
  );
  const stepRatio = Math.min(1, analytics.totalSteps / 10000);
  const gpsBonus = Math.min(2, gpsLocationsCount * 0.5);
  const motionScale = Math.max(
    1,
    Math.min(10, Math.round((stepRatio * 8 + gpsBonus) * 10) / 10)
  );

  const completedGoals = goals.filter((g) => g.completed).length;
  const goalScale =
    goals.length > 0
      ? Math.max(1, Math.min(10, Math.round((completedGoals / goals.length) * 10 * 10) / 10))
      : 8.5;

  const rawOverall =
    focusScale * 0.35 +
    screenHygieneScale * 0.25 +
    motionScale * 0.2 +
    goalScale * 0.2;
  const overallScale = Math.max(1, Math.min(10, Math.round(rawOverall * 10) / 10));

  let verdictLabel = 'Calibration Needed';
  if (overallScale >= 9.0) {
    verdictLabel = 'Peak Ultradian Flow (9+ Verified)';
  } else if (overallScale >= 7.5) {
    verdictLabel = 'High Cognitive Output';
  } else if (overallScale >= 6.0) {
    verdictLabel = 'Balanced Maintenance';
  }

  return {
    overallScale,
    focusScale,
    screenHygieneScale,
    motionScale,
    goalScale,
    verdictLabel,
  };
}

export interface WeeklyCognitiveTrendPoint {
  dateKey: string;
  dayLabel: string;
  shortDay: string;
  deep_focus: number;
  distracted: number;
  netFocusHours: number;
  totalTrackedHours: number;
  isReferenceDay: boolean;
}

export interface WeeklyCognitiveTrendSummary {
  days: WeeklyCognitiveTrendPoint[];
  totalDeepFocusHours: number;
  totalDistractedHours: number;
  avgDeepFocusPerDay: number;
  avgDistractedPerDay: number;
  focusVsDistractedRatio: number;
  trendDirection: 'improving' | 'steady' | 'declining';
  progressionDeltaHours: number;
}

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const HISTORICAL_PROGRESSION_BASELINE: ReadonlyArray<{
  daysAgo: number;
  deep_focus: number;
  distracted: number;
  totalTrackedHours: number;
}> = [
  { daysAgo: 6, deep_focus: 2, distracted: 3, totalTrackedHours: 8 },
  { daysAgo: 5, deep_focus: 3, distracted: 2, totalTrackedHours: 9 },
  { daysAgo: 4, deep_focus: 2, distracted: 2, totalTrackedHours: 8 },
  { daysAgo: 3, deep_focus: 3, distracted: 2, totalTrackedHours: 9 },
  { daysAgo: 2, deep_focus: 4, distracted: 1, totalTrackedHours: 10 },
  { daysAgo: 1, deep_focus: 3, distracted: 1, totalTrackedHours: 9 },
];

export function buildWeeklyCognitiveTrend(
  allEntries: HourlyEntry[],
  referenceDateKey: string,
  useBaselineForEmptyPastDays = true
): WeeklyCognitiveTrendSummary {
  const safeRef = /^\d{4}-\d{2}-\d{2}$/.test(referenceDateKey)
    ? referenceDateKey
    : '2026-10-29';
  const baseDate = new Date(`${safeRef}T12:00:00Z`);

  const days: WeeklyCognitiveTrendPoint[] = [];

  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const d = new Date(baseDate.getTime() - daysAgo * 86_400_000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const dateKey = `${yyyy}-${mm}-${dd}`;
    const shortDay = SHORT_WEEKDAYS[d.getUTCDay()];
    const dayLabel = `${shortDay} ${Number(mm)}/${Number(dd)}`;

    const dayEntries = allEntries.filter((entry) => entry.dateKey === dateKey);

    let deepFocusCount = 0;
    let distractedCount = 0;
    let totalTrackedHours = dayEntries.length;

    if (dayEntries.length > 0) {
      deepFocusCount = dayEntries.filter(
        (e) => normalizeCognitiveState(e.cognitiveState) === 'deep_focus'
      ).length;
      distractedCount = dayEntries.filter(
        (e) => normalizeCognitiveState(e.cognitiveState) === 'distracted'
      ).length;
    } else if (daysAgo > 0 && useBaselineForEmptyPastDays) {
      const preset = HISTORICAL_PROGRESSION_BASELINE.find((p) => p.daysAgo === daysAgo);
      if (preset) {
        deepFocusCount = preset.deep_focus;
        distractedCount = preset.distracted;
        totalTrackedHours = preset.totalTrackedHours;
      }
    }

    days.push({
      dateKey,
      dayLabel,
      shortDay,
      deep_focus: deepFocusCount,
      distracted: distractedCount,
      netFocusHours: deepFocusCount - distractedCount,
      totalTrackedHours,
      isReferenceDay: daysAgo === 0,
    });
  }

  const totalDeepFocusHours = days.reduce((acc, item) => acc + item.deep_focus, 0);
  const totalDistractedHours = days.reduce((acc, item) => acc + item.distracted, 0);
  const avgDeepFocusPerDay = Math.round((totalDeepFocusHours / 7) * 10) / 10;
  const avgDistractedPerDay = Math.round((totalDistractedHours / 7) * 10) / 10;
  const focusVsDistractedRatio =
    totalDistractedHours > 0
      ? Math.round((totalDeepFocusHours / totalDistractedHours) * 10) / 10
      : totalDeepFocusHours;

  // Compare first 3 days vs last 3 days net focus progression
  const earlyNet =
    days.slice(0, 3).reduce((acc, d) => acc + (d.deep_focus - d.distracted), 0) / 3;
  const recentNet =
    days.slice(4, 7).reduce((acc, d) => acc + (d.deep_focus - d.distracted), 0) / 3;
  const progressionDeltaHours = Math.round((recentNet - earlyNet) * 10) / 10;

  let trendDirection: 'improving' | 'steady' | 'declining' = 'steady';
  if (progressionDeltaHours >= 0.4) {
    trendDirection = 'improving';
  } else if (progressionDeltaHours <= -0.4) {
    trendDirection = 'declining';
  }

  return {
    days,
    totalDeepFocusHours,
    totalDistractedHours,
    avgDeepFocusPerDay,
    avgDistractedPerDay,
    focusVsDistractedRatio,
    trendDirection,
    progressionDeltaHours,
  };
}

export const CURATED_DAY_TEMPLATES: DayTemplate[] = [
  {
    id: 'ultradian-maker',
    name: 'Ultradian Maker Architecture',
    subtitle: '90-minute deep engineering blocks paired with non-screen motion recovery',
    targetAudience: 'For software engineers, researchers & technical founders',
    benchmarkOrigin: 'Synthesized from Motion Auto-Scheduler + Cal Newport Time-Block Planner',
    entries: [
      {
        hour: 8,
        activity: 'Morning sunlight walk & hydration protocol',
        cognitiveState: 'recovery',
        screenMinutes: 5,
        productiveScreenMinutes: 5,
        motionState: 'walking',
        stepsCount: 3400,
        energyLevel: 4,
        notes: 'Zero social media before first deep block',
      },
      {
        hour: 9,
        activity: 'Core architecture & system implementation (Ultradian Block 1)',
        cognitiveState: 'deep_focus',
        screenMinutes: 55,
        productiveScreenMinutes: 55,
        motionState: 'standing',
        stepsCount: 250,
        energyLevel: 5,
        notes: 'Notifications silenced; single repository focus',
      },
      {
        hour: 10,
        activity: 'Algorithmic problem solving & unit verification',
        cognitiveState: 'deep_focus',
        screenMinutes: 50,
        productiveScreenMinutes: 50,
        motionState: 'sedentary',
        stepsCount: 110,
        energyLevel: 5,
        notes: 'High cognitive throughput window',
      },
      {
        hour: 11,
        activity: 'Product design specification & RFC synthesis',
        cognitiveState: 'creative',
        screenMinutes: 45,
        productiveScreenMinutes: 42,
        motionState: 'standing',
        stepsCount: 310,
        energyLevel: 4,
        notes: 'Drafting structural specs',
      },
      {
        hour: 12,
        activity: 'Midday metabolic walk & off-screen lunch',
        cognitiveState: 'recovery',
        screenMinutes: 8,
        productiveScreenMinutes: 5,
        motionState: 'walking',
        stepsCount: 3800,
        energyLevel: 4,
        notes: 'Resets visual fatigue and circadian dip',
      },
      {
        hour: 13,
        activity: 'Async code review, PR triage & team unblocking',
        cognitiveState: 'shallow_work',
        screenMinutes: 50,
        productiveScreenMinutes: 40,
        motionState: 'sedentary',
        stepsCount: 120,
        energyLevel: 3,
        notes: 'Batched communication window',
      },
      {
        hour: 14,
        activity: 'Post-lunch drift / unscheduled feed browsing',
        cognitiveState: 'distracted',
        screenMinutes: 48,
        productiveScreenMinutes: 12,
        motionState: 'sedentary',
        stepsCount: 60,
        energyLevel: 2,
        notes: 'Circadian trough — replace with 15m walk tomorrow',
      },
      {
        hour: 15,
        activity: 'Frontend telemetry & performance optimization (Block 2)',
        cognitiveState: 'deep_focus',
        screenMinutes: 52,
        productiveScreenMinutes: 50,
        motionState: 'standing',
        stepsCount: 290,
        energyLevel: 4,
        notes: 'Second wind focus wave',
      },
      {
        hour: 16,
        activity: 'Technical paper reading & domain research',
        cognitiveState: 'learning',
        screenMinutes: 40,
        productiveScreenMinutes: 38,
        motionState: 'sedentary',
        stepsCount: 140,
        energyLevel: 4,
        notes: 'Annotated key takeaways in workspace',
      },
      {
        hour: 17,
        activity: 'Strength & cardiovascular conditioning session',
        cognitiveState: 'recovery',
        screenMinutes: 10,
        productiveScreenMinutes: 10,
        motionState: 'workout',
        stepsCount: 5200,
        energyLevel: 5,
        notes: 'BDNF boost & cortisol clearance',
      },
    ],
    goals: [
      {
        title: 'Complete 4+ hours of uninterrupted Deep Focus & Creative blocks',
        category: 'deep_work',
        targetValue: 4,
        currentValue: 4,
        unit: 'hrs',
        completed: true,
        priority: 'high',
      },
      {
        title: 'Keep passive/unproductive screen drift under 45 minutes',
        category: 'screen_hygiene',
        targetValue: 45,
        currentValue: 51,
        unit: 'mins max',
        completed: false,
        priority: 'high',
      },
      {
        title: 'Hit 12,000 daily steps across standing, walks & workout',
        category: 'motion',
        targetValue: 12000,
        currentValue: 13680,
        unit: 'steps',
        completed: true,
        priority: 'medium',
      },
      {
        title: 'Zero phone screen exposure during first 60m after waking',
        category: 'habit',
        targetValue: 1,
        currentValue: 1,
        unit: 'session',
        completed: true,
        priority: 'medium',
      },
    ],
  },
  {
    id: 'executive-synthesis',
    name: 'Executive Strategy & Zero-Drift Protocol',
    subtitle: 'Front-loaded strategic synthesis with strict screen boundaries and walking 1:1s',
    targetAudience: 'For product leaders, operators & multi-project strategists',
    benchmarkOrigin: 'Synthesized from Notion Executive HQ + Rize Screen Telemetry',
    entries: [
      {
        hour: 8,
        activity: 'Quarterly thesis & priority memo writing',
        cognitiveState: 'creative',
        screenMinutes: 45,
        productiveScreenMinutes: 45,
        motionState: 'standing',
        stepsCount: 240,
        energyLevel: 5,
        notes: 'Written before opening inbox',
      },
      {
        hour: 9,
        activity: 'Financial & product telemetry deep audit',
        cognitiveState: 'deep_focus',
        screenMinutes: 55,
        productiveScreenMinutes: 55,
        motionState: 'sedentary',
        stepsCount: 100,
        energyLevel: 5,
        notes: 'Cohort retention & unit economics review',
      },
      {
        hour: 10,
        activity: 'Walking 1:1 leadership sync (audio only, outdoors)',
        cognitiveState: 'shallow_work',
        screenMinutes: 10,
        productiveScreenMinutes: 10,
        motionState: 'walking',
        stepsCount: 3900,
        energyLevel: 4,
        notes: 'High-clarity alignment while moving',
      },
      {
        hour: 11,
        activity: 'Partner negotiation & roadmap specification',
        cognitiveState: 'deep_focus',
        screenMinutes: 50,
        productiveScreenMinutes: 48,
        motionState: 'standing',
        stepsCount: 280,
        energyLevel: 4,
        notes: 'Locked Q4 deliverables',
      },
      {
        hour: 12,
        activity: 'Nutrition & zero-screen cognitive decompression',
        cognitiveState: 'recovery',
        screenMinutes: 0,
        productiveScreenMinutes: 0,
        motionState: 'walking',
        stepsCount: 2600,
        energyLevel: 4,
        notes: 'Full visual cortex rest',
      },
      {
        hour: 13,
        activity: 'Inbox zero batching & stakeholder dispatches',
        cognitiveState: 'shallow_work',
        screenMinutes: 45,
        productiveScreenMinutes: 42,
        motionState: 'sedentary',
        stepsCount: 110,
        energyLevel: 3,
        notes: 'Cleared 38 threads in single batch',
      },
    ],
    goals: [
      {
        title: 'Publish daily strategic memo before 09:00',
        category: 'deep_work',
        targetValue: 1,
        currentValue: 1,
        unit: 'memo',
        completed: true,
        priority: 'high',
      },
      {
        title: 'Maintain 90%+ productive screen ratio across workday',
        category: 'screen_hygiene',
        targetValue: 90,
        currentValue: 98,
        unit: '% ratio',
        completed: true,
        priority: 'high',
      },
      {
        title: 'Convert at least 2 calls into outdoor walking sessions',
        category: 'motion',
        targetValue: 2,
        currentValue: 2,
        unit: 'walks',
        completed: true,
        priority: 'medium',
      },
    ],
  },
  {
    id: 'academic-deep-research',
    name: 'Deep Research & Literature Synthesis',
    subtitle: 'High-retention study blocks with active recall and posture alternation',
    targetAudience: 'For scientists, graduate researchers & lifelong learners',
    benchmarkOrigin: 'Synthesized from Huberman Ultradian Protocol + Obsidian/Notion Zettelkasten',
    entries: [
      {
        hour: 9,
        activity: 'Primary literature reading & theorem derivation',
        cognitiveState: 'learning',
        screenMinutes: 35,
        productiveScreenMinutes: 35,
        motionState: 'standing',
        stepsCount: 210,
        energyLevel: 5,
        notes: 'Paper annotations + handwritten synthesis',
      },
      {
        hour: 10,
        activity: 'Experimental dataset modeling & statistical validation',
        cognitiveState: 'deep_focus',
        screenMinutes: 55,
        productiveScreenMinutes: 55,
        motionState: 'sedentary',
        stepsCount: 95,
        energyLevel: 5,
        notes: 'Verified hypothesis p-values',
      },
      {
        hour: 11,
        activity: 'Pacing active recall & concept mapping',
        cognitiveState: 'creative',
        screenMinutes: 15,
        productiveScreenMinutes: 15,
        motionState: 'walking',
        stepsCount: 2900,
        energyLevel: 4,
        notes: 'Verbal synthesis without looking at notes',
      },
      {
        hour: 12,
        activity: 'Zone 2 aerobic run & recovery meal',
        cognitiveState: 'recovery',
        screenMinutes: 5,
        productiveScreenMinutes: 5,
        motionState: 'workout',
        stepsCount: 6100,
        energyLevel: 5,
        notes: 'Consolidates morning hippocampal encoding',
      },
    ],
    goals: [
      {
        title: 'Synthesize 3 peer-reviewed papers into atomic notes',
        category: 'deep_work',
        targetValue: 3,
        currentValue: 3,
        unit: 'papers',
        completed: true,
        priority: 'high',
      },
      {
        title: 'Complete 45m Zone 2 metabolic conditioning',
        category: 'motion',
        targetValue: 45,
        currentValue: 45,
        unit: 'mins',
        completed: true,
        priority: 'high',
      },
    ],
  },
];
