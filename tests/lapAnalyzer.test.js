import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseTelemetryCsv } from '../src/telemetryParser.js';
import { extractLaps, compareLaps, buildTrackHeatmapData } from '../src/lapAnalyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('extractLaps segments 3-lap Teknik Pist CSV and identifies Tur 2 as fastest', async () => {
  const csv = await fs.readFile(path.join(ROOT_DIR, 'samples', 'teknik_pist_3tur.csv'), 'utf8');
  const parsed = parseTelemetryCsv(csv);
  assert.equal(parsed.ok, true);

  const laps = extractLaps(parsed.frames);
  assert.equal(laps.length, 3);

  const bestLap = laps.find((l) => l.isBest);
  assert.ok(bestLap);
  assert.equal(bestLap.lapNumber, 2);

  for (const lap of laps) {
    assert.equal(lap.sectors.length, 3);
    const sectorSum = lap.sectors[0] + lap.sectors[1] + lap.sectors[2];
    assert.ok(
      Math.abs(sectorSum - lap.lapTimeSec) <= 0.15,
      `Expected sectorSum (${sectorSum}) to match lapTimeSec (${lap.lapTimeSec})`
    );
  }
});

test('compareLaps computes signed total/sector deltas and identifies faster lap', async () => {
  const csv = await fs.readFile(path.join(ROOT_DIR, 'samples', 'teknik_pist_3tur.csv'), 'utf8');
  const parsed = parseTelemetryCsv(csv);
  const laps = extractLaps(parsed.frames);

  const lap1 = laps[0];
  const lap2 = laps[1];

  const cmp = compareLaps(lap1, lap2);
  assert.ok(cmp);
  assert.equal(cmp.lapA, 1);
  assert.equal(cmp.lapB, 2);
  assert.equal(cmp.fasterLapNumber, 2);
  assert.ok(cmp.totalDeltaSec < 0, 'Lap 2 is faster than Lap 1 so delta should be negative');

  const cmpReverse = compareLaps(lap2, lap1);
  assert.equal(cmpReverse.fasterLapNumber, 2);
  assert.ok(cmpReverse.totalDeltaSec > 0, 'Lap 1 is slower than Lap 2 so delta should be positive');
  assert.ok(Math.abs(cmp.totalDeltaSec + cmpReverse.totalDeltaSec) < 1e-6);
});

test('extractLaps handles single-lap Şehir Devresi CSV cleanly', async () => {
  const csv = await fs.readFile(path.join(ROOT_DIR, 'samples', 'sehir_devresi_1tur.csv'), 'utf8');
  const parsed = parseTelemetryCsv(csv);
  assert.equal(parsed.ok, true);

  const laps = extractLaps(parsed.frames);
  assert.equal(laps.length, 1);
  assert.equal(laps[0].lapNumber, 1);
  assert.equal(laps[0].isBest, true);
  assert.ok(laps[0].lapTimeSec > 18 && laps[0].lapTimeSec < 21);
});

test('buildTrackHeatmapData supports speed, brake, tireTemp metrics and lap filtering', async () => {
  const csv = await fs.readFile(path.join(ROOT_DIR, 'samples', 'teknik_pist_3tur.csv'), 'utf8');
  const parsed = parseTelemetryCsv(csv);
  const frames = parsed.frames;

  for (const metric of ['speed', 'brake', 'tireTemp']) {
    const hdAll = buildTrackHeatmapData(frames, metric, 'all');
    assert.equal(hdAll.metric, metric);
    assert.equal(hdAll.points.length, frames.length);
    assert.ok(hdAll.bounds.maxX > hdAll.bounds.minX);
    assert.ok(hdAll.bounds.maxY > hdAll.bounds.minY);
    for (const pt of hdAll.points) {
      assert.ok(pt.norm >= 0 && pt.norm <= 1);
    }
  }

  const hdLap2 = buildTrackHeatmapData(frames, 'speed', '2');
  assert.ok(hdLap2.points.length > 500 && hdLap2.points.length < 600);
  assert.ok(hdLap2.points.every((pt) => pt.lap === 2));
});
