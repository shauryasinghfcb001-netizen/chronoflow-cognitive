import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateHourlyInput,
  computeHourScore,
  analyzeDailyCognitiveTelemetry,
  computeHourlyHeatmapCells,
  mergeMcpBlocksIntoEntries,
  calculateHaversineKm,
  summarizeGpsTrajectory,
  computeTenPointEfficiencyScale,
  buildWeeklyCognitiveTrend,
  sanitizeTextInput,
  validateSafeEndpointUrl,
  validateSafeMapsUri,
  normalizeCognitiveState,
  normalizeMotionState,
  DEFAULT_GPS_WAYPOINTS,
  formatHourLabel,
  CURATED_DAY_TEMPLATES,
  type HourlyEntry,
} from './cognitiveEngine';

test('formatHourLabel formats 0-23 hours as 2-digit tabular strings', () => {
  assert.equal(formatHourLabel(0), '00:00');
  assert.equal(formatHourLabel(9), '09:00');
  assert.equal(formatHourLabel(14), '14:00');
  assert.equal(formatHourLabel(23), '23:00');
});

test('validateHourlyInput enforces bounds and productive <= total screen time', () => {
  const valid = validateHourlyInput({
    hour: 9,
    activity: 'Deep architecture work',
    screenMinutes: 50,
    productiveScreenMinutes: 45,
    stepsCount: 300,
    energyLevel: 5,
  });
  assert.equal(valid.valid, true);

  const invalidScreen = validateHourlyInput({
    hour: 9,
    activity: 'Deep architecture work',
    screenMinutes: 30,
    productiveScreenMinutes: 45,
    stepsCount: 300,
    energyLevel: 5,
  });
  assert.equal(invalidScreen.valid, false);
  assert.match(invalidScreen.error || '', /cannot exceed total screen minutes/);

  const emptyActivity = validateHourlyInput({
    hour: 10,
    activity: '   ',
    screenMinutes: 20,
    productiveScreenMinutes: 20,
    stepsCount: 100,
    energyLevel: 3,
  });
  assert.equal(emptyActivity.valid, false);
});

test('computeHourScore distinguishes Productive Peak from Cognitive Drain', () => {
  const deepHour: HourlyEntry = {
    id: 'h-9',
    dateKey: '2026-10-28',
    hour: 9,
    activity: 'Kernel compiler optimization',
    cognitiveState: 'deep_focus',
    screenMinutes: 55,
    productiveScreenMinutes: 55,
    motionState: 'standing',
    stepsCount: 280,
    energyLevel: 5,
  };

  const distractedHour: HourlyEntry = {
    id: 'h-14',
    dateKey: '2026-10-28',
    hour: 14,
    activity: 'Unplanned video feeds and context switching',
    cognitiveState: 'distracted',
    screenMinutes: 55,
    productiveScreenMinutes: 5,
    motionState: 'sedentary',
    stepsCount: 40,
    energyLevel: 2,
  };

  const deepScore = computeHourScore(deepHour);
  const distractedScore = computeHourScore(distractedHour);

  assert.ok(deepScore.score >= 82, `Expected deep focus score >= 82, got ${deepScore.score}`);
  assert.equal(deepScore.classification, 'Productive Peak');
  assert.equal(deepScore.passiveScreenMinutes, 0);

  assert.ok(
    distractedScore.score < 45,
    `Expected distracted score < 45, got ${distractedScore.score}`
  );
  assert.equal(distractedScore.classification, 'Cognitive Drain');
  assert.equal(distractedScore.passiveScreenMinutes, 50);
});

test('analyzeDailyCognitiveTelemetry aggregates peak hours, screen ratio, and motion metrics', () => {
  const template = CURATED_DAY_TEMPLATES[0];
  const entries: HourlyEntry[] = template.entries.map((e, i) => ({
    ...e,
    id: `test-${i}`,
    dateKey: '2026-10-28',
  }));

  const summary = analyzeDailyCognitiveTelemetry(entries);
  assert.equal(summary.totalTrackedHours, 10);
  assert.ok(summary.productiveHoursCount >= 7);
  assert.equal(summary.unproductiveHoursCount, 1);
  assert.equal(summary.peakHour, 9);
  assert.equal(summary.drainHour, 14);
  assert.ok(summary.screenEfficiencyPct >= 80);
  assert.ok(summary.totalSteps > 12000);
});

test('computeHourlyHeatmapCells generates 24-hour energy and motion intensity cells', () => {
  const template = CURATED_DAY_TEMPLATES[0];
  const entries: HourlyEntry[] = template.entries.map((e, i) => ({
    ...e,
    id: `test-${i}`,
    dateKey: '2026-10-28',
  }));

  const cells = computeHourlyHeatmapCells(entries);
  assert.equal(cells.length, 24);

  const hour9 = cells[9];
  assert.equal(hour9.logged, true);
  assert.equal(hour9.energyLevel, 5);
  assert.equal(hour9.energyCode, 'E5');
  assert.equal(hour9.motionIntensity, 2);
  assert.equal(hour9.motionCode, 'Std');
  assert.equal(hour9.couplingStatus, 'Peak Synergy');

  const hour14 = cells[14];
  assert.equal(hour14.logged, true);
  assert.equal(hour14.energyLevel, 2);
  assert.equal(hour14.motionIntensity, 1);
  assert.equal(hour14.couplingStatus, 'Low Energy');

  const hour3 = cells[3];
  assert.equal(hour3.logged, false);
  assert.equal(hour3.energyCode, '—');
  assert.equal(hour3.motionCode, '—');
});

test('mergeMcpBlocksIntoEntries normalizes MiniMe and WhatsApp MCP telemetry into hourly timeline', () => {
  const initial: HourlyEntry[] = [];
  const merged = mergeMcpBlocksIntoEntries(
    initial,
    [
      {
        hour: 9,
        activity: 'VS Code (46m) — ChronoFlow MCP Bridge',
        appBreakdown: ['VS Code: 46m'],
        cognitiveState: 'deep_focus',
        screenMinutes: 60,
        productiveScreenMinutes: 57,
        motionState: 'standing',
        stepsCount: 310,
        energyLevel: 5,
        efficiencyCoaching: 'MiniMe Insight: 95% single-window focus.',
        sourceAgent: 'MiniMe Agent',
      },
    ],
    '2026-10-29'
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].hour, 9);
  assert.equal(merged[0].productiveScreenMinutes, 57);
  assert.match(merged[0].notes || '', /MiniMe Insight/);
});

test('summarizeGpsTrajectory computes Haversine distance across daily GPS waypoints', () => {
  const d = calculateHaversineKm(37.7858, -122.4065, 37.7955, -122.3937);
  assert.ok(d > 1.0 && d < 3.0, `Expected ~1.56km, got ${d}`);

  const summary = summarizeGpsTrajectory(DEFAULT_GPS_WAYPOINTS);
  assert.equal(summary.locationsVisited, 3);
  assert.ok(summary.totalDistanceKm > 1.5);
  assert.equal(summary.latestWaypoint?.hour, 12);
});

test('computeTenPointEfficiencyScale calculates 1-to-10 scale ratings across focus, screen, motion, and goals', () => {
  const template = CURATED_DAY_TEMPLATES[0];
  const entries: HourlyEntry[] = template.entries.map((e, i) => ({
    ...e,
    id: `test-${i}`,
    dateKey: '2026-10-29',
  }));
  const analytics = analyzeDailyCognitiveTelemetry(entries);
  const goals = template.goals.map((g, i) => ({ ...g, id: `g-${i}` }));

  const scale = computeTenPointEfficiencyScale(analytics, goals, 3);
  assert.ok(scale.overallScale >= 7.5 && scale.overallScale <= 10.0);
  assert.ok(scale.focusScale >= 7.0);
  assert.ok(scale.screenHygieneScale >= 8.0);
  assert.ok(scale.motionScale >= 9.0);
});

test('Cybersecurity Agent Suite: XSS stripping, SSRF blocking, and malformed enum fuzzing', () => {
  // 1. XSS & Control Character Sanitization
  const maliciousText = 'Deep work <script>alert("xss")</script> javascript:evil()\u0000';
  const cleaned = sanitizeTextInput(maliciousText, 160);
  assert.equal(cleaned.includes('<script>'), false);
  assert.equal(cleaned.includes('javascript:'), false);
  assert.equal(cleaned.includes('\u0000'), false);

  // 2. SSRF & Dangerous URI Scheme Blocking
  assert.equal(validateSafeEndpointUrl('javascript:alert(1)').valid, false);
  assert.equal(validateSafeEndpointUrl('file:///etc/passwd').valid, false);
  assert.equal(
    validateSafeEndpointUrl('http://169.254.169.254/latest/meta-data/').valid,
    false
  );
  assert.equal(
    validateSafeEndpointUrl('http://metadata.google.internal/computeMetadata/v1/').valid,
    false
  );
  assert.equal(validateSafeEndpointUrl('https://api.codegen.com/v1/mcp').valid, true);
  assert.equal(validateSafeEndpointUrl('/api/mcp/ingest').valid, true);

  // 3. Google Maps URI Validation
  assert.equal(validateSafeMapsUri('javascript:alert(1)'), 'https://www.google.com/maps');
  assert.equal(
    validateSafeMapsUri('https://www.google.com/maps/place/Test'),
    'https://www.google.com/maps/place/Test'
  );

  // 4. Malformed Enum & NaN Fuzzing
  assert.equal(normalizeCognitiveState('__proto__'), 'deep_focus');
  assert.equal(normalizeMotionState('HACKED_MOTION'), 'standing');

  const fuzzedEntry = {
    id: 'fuzz-1',
    dateKey: '2026-10-29',
    hour: 9,
    activity: 'Fuzzed block',
    cognitiveState: 'INVALID_STATE' as unknown as HourlyEntry['cognitiveState'],
    screenMinutes: 50,
    productiveScreenMinutes: 40,
    motionState: 'INVALID_MOTION' as unknown as HourlyEntry['motionState'],
    stepsCount: 200,
    energyLevel: 99,
  };
  const fuzzedScore = computeHourScore(fuzzedEntry);
  assert.ok(Number.isFinite(fuzzedScore.score));
});

test('buildWeeklyCognitiveTrend aggregates deep_focus vs distracted hours across a 7-day window', () => {
  const template = CURATED_DAY_TEMPLATES[0];
  const todayEntries: HourlyEntry[] = template.entries.map((e, i) => ({
    ...e,
    id: `t-${i}`,
    dateKey: '2026-10-29',
  }));

  const summary = buildWeeklyCognitiveTrend(todayEntries, '2026-10-29', true);
  assert.equal(summary.days.length, 7);
  assert.equal(summary.days[0].dateKey, '2026-10-23');
  assert.equal(summary.days[6].dateKey, '2026-10-29');
  assert.equal(summary.days[6].isReferenceDay, true);
  // Today in Ultradian Maker template has 3 deep_focus hours (9, 10, 15) and 1 distracted hour (14)
  assert.equal(summary.days[6].deep_focus, 3);
  assert.equal(summary.days[6].distracted, 1);
  assert.equal(summary.trendDirection, 'improving');
  assert.ok(summary.totalDeepFocusHours > summary.totalDistractedHours);
});
