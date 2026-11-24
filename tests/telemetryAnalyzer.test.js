import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseTelemetryCsv } from '../src/telemetryParser.js';
import { computeTelemetryStats, formatLapTime } from '../src/telemetryStats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('parseTelemetryCsv parses 55-channel MoTeC sample CSV with metadata and normalization', async () => {
  const csv = await fs.readFile(path.join(ROOT_DIR, 'samples', 'teknik_pist_3tur.csv'), 'utf8');
  const result = parseTelemetryCsv(csv);

  assert.equal(result.ok, true);
  assert.match(result.format, /MoTeC/i);
  assert.equal(result.metadata.venue, 'Teknik Pist');
  assert.equal(result.metadata.vehicle, 'Apex GT-R');
  assert.equal(result.metadata.driver, 'PILOT_01');
  assert.equal(result.metadata.sampleRate, '20');
  assert.ok(result.frames.length > 1600);

  const first = result.frames[0];
  assert.ok(first.throttle >= 0 && first.throttle <= 1);
  assert.ok(first.brake >= 0 && first.brake <= 1);
  assert.ok(first.grip > 0.4 && first.grip <= 1.5);
  assert.ok(first.tempFL > 40);
  assert.ok(first.wearFL > 0 && first.wearFL < 0.05);
  assert.equal(first.lap, 1);

  const sampleStats = computeTelemetryStats(result.frames);
  assert.ok(
    sampleStats.maxTireWearPct > 10 && sampleStats.maxTireWearPct < 20,
    `Expected realistic tire wear around ~13.5%, got ${sampleStats.maxTireWearPct}`
  );
});

test('parseTelemetryCsv supports raw 55-channel CSV without MoTeC metadata header', () => {
  const row1 = new Array(55).fill('0');
  row1[0] = '0.00'; row1[1] = '0.0'; row1[2] = '100.0'; row1[3] = '5000'; row1[4] = '3';
  row1[5] = '0.8'; row1[6] = '0.0'; row1[11] = '1.05'; row1[12] = '80'; row1[28] = '320'; row1[52] = '1';
  const row2 = new Array(55).fill('0');
  row2[0] = '0.05'; row2[1] = '1.5'; row2[2] = '112.0'; row2[3] = '5400'; row2[4] = '3';
  row2[5] = '1.0'; row2[6] = '0.0'; row2[11] = '1.02'; row2[12] = '82'; row2[28] = '330'; row2[52] = '1';

  const rawCsv = `t,dist,speed_kmh,rpm\n${row1.join(',')}\n${row2.join(',')}\n`;
  const res = parseTelemetryCsv(rawCsv);

  assert.equal(res.ok, true);
  assert.match(res.format, /55 Kanal/);
  assert.equal(res.frames.length, 2);
  assert.equal(res.frames[1].speed, 112);
  assert.equal(res.frames[1].throttle, 1);
});

test('parseTelemetryCsv supports legacy 27-channel CSV format', () => {
  const row1 = [
    '0.00', '80.0', '4200', '2', '0.5', '0.0', '0.1', '0.95',
    '3500', '3500', '0.1', '10', '20', '1.0', '16.5', '1', '1',
    '0.4', '0.2', '65', '66', '62', '63', '0.01', '0.01', '0.01', '0.01'
  ].join(',');
  const row2 = [
    '0.05', '90.0', '4600', '3', '1.0', '0.0', '-0.1', '0.98',
    '3400', '3600', '-0.1', '12', '21', '1.0', '16.5', '1', '1',
    '-0.5', '0.3', '66', '67', '63', '64', '0.02', '0.02', '0.01', '0.01'
  ].join(',');

  const res = parseTelemetryCsv(`t,speed,rpm,gear\n${row1}\n${row2}\n`);
  assert.equal(res.ok, true);
  assert.match(res.format, /27 Kanal/);
  assert.equal(res.frames.length, 2);
  assert.equal(res.frames[1].tempFL, 66);
  assert.ok(res.frames[1].dist > 0);
});

test('parseTelemetryCsv rejects empty, header-only, corrupted, and single-row inputs gracefully', () => {
  for (const bad of ['', '   \n  ', 'not,a,telemetry,file\nabc,def,ghi,jkl', '"Format","MoTeC CSV File"\n"Time","Speed"']) {
    const res = parseTelemetryCsv(bad);
    assert.equal(res.ok, false);
    assert.ok(res.error && res.error.length > 10);
  }

  const oneRow = new Array(55).fill('1').join(',');
  const singleRes = parseTelemetryCsv(`t,dist,speed\n${oneRow}`);
  assert.equal(singleRes.ok, false);
  assert.match(singleRes.error, /en az 2/i);
});

test('computeTelemetryStats computes exact KPI metrics and formatLapTime formats timestamps cleanly', () => {
  const frames = [
    {
      t: 0.0, dist: 0, speed: 100, rpm: 5000, throttle: 1.0, brake: 0.0,
      gLat: 0.5, gLong: 0.4, grip: 1.0, peakTireTemp: 80, peakBrakeTemp: 220,
      wearFL: 0.02, wearFR: 0.03, wearRL: 0.01, wearRR: 0.01, lap: 1
    },
    {
      t: 0.5, dist: 15, speed: 140, rpm: 6500, throttle: 0.95, brake: 0.0,
      gLat: -1.4, gLong: 0.3, grip: 0.70, peakTireTemp: 92, peakBrakeTemp: 260,
      wearFL: 0.04, wearFR: 0.05, wearRL: 0.02, wearRR: 0.02, lap: 1
    },
    {
      t: 1.0, dist: 30, speed: 60, rpm: 3200, throttle: 0.0, brake: 0.85,
      gLat: 0.2, gLong: -1.2, grip: 0.90, peakTireTemp: 96, peakBrakeTemp: 510,
      wearFL: 0.05, wearFR: 0.06, wearRL: 0.03, wearRR: 0.03, lap: 2
    }
  ];

  const stats = computeTelemetryStats(frames);
  assert.equal(stats.sampleCount, 3);
  assert.equal(stats.durationSec, 1.0);
  assert.equal(stats.distanceMeters, 30);
  assert.equal(stats.lapCount, 2);
  assert.equal(stats.maxSpeedKmh, 140);
  assert.equal(stats.avgSpeedKmh, 100);
  assert.equal(stats.maxRpm, 6500);
  assert.equal(stats.peakLatG, 1.4);
  assert.equal(stats.peakLongG, 1.2);
  assert.equal(stats.brakeTimeSec, 0.5);
  assert.equal(stats.lowGripTimeSec, 0.5);
  assert.equal(stats.peakTireTempC, 96);
  assert.equal(stats.peakBrakeTempC, 510);
  assert.equal(stats.maxTireWearPct, 6);

  assert.equal(formatLapTime(27.15), '0:27.15');
  assert.equal(formatLapTime(59.999), '1:00.00');
  assert.equal(formatLapTime(83.85), '1:23.85');
});
