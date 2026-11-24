/**
 * Lap segmentation, sector delta comparison, and 2D track heatmap dataset builder.
 */

function interpolateTimeAtDistance(lapFrames, targetDist) {
  if (lapFrames.length === 0) return 0;
  if (targetDist <= lapFrames[0].dist) return lapFrames[0].t;
  for (let i = 1; i < lapFrames.length; i++) {
    const prev = lapFrames[i - 1];
    const curr = lapFrames[i];
    if (curr.dist >= targetDist) {
      const span = curr.dist - prev.dist;
      if (span <= 1e-6) return curr.t;
      const ratio = Math.max(0, Math.min(1, (targetDist - prev.dist) / span));
      return prev.t + ratio * (curr.t - prev.t);
    }
  }
  return lapFrames[lapFrames.length - 1].t;
}

/**
 * Segments telemetry frames into laps with sector splits and best-lap detection.
 * @param {Array<object>} frames
 * @returns {Array<object>}
 */
export function extractLaps(frames) {
  if (!Array.isArray(frames) || frames.length === 0) return [];

  const grouped = new Map();
  for (const frame of frames) {
    const lapNum = Number.isFinite(frame.lap) ? frame.lap : 1;
    if (!grouped.has(lapNum)) grouped.set(lapNum, []);
    grouped.get(lapNum).push(frame);
  }

  const lapEntries = Array.from(grouped.entries());
  const laps = [];

  for (let idx = 0; idx < lapEntries.length; idx++) {
    const [lapNumber, lapFrames] = lapEntries[idx];
    const n = lapFrames.length;
    const startTime = lapFrames[0].t;
    const lastFrame = lapFrames[n - 1];

    const avgDt =
      n > 1 ? Math.max(0.01, (lastFrame.t - startTime) / (n - 1)) : 0.05;
    const nextLapFirstFrame =
      idx + 1 < lapEntries.length ? lapEntries[idx + 1][1][0] : null;
    const endTime = nextLapFirstFrame
      ? Math.max(lastFrame.t, nextLapFirstFrame.t)
      : lastFrame.t + avgDt;
    const lapTimeSec = Math.max(0, endTime - startTime);

    const startDist = lapFrames[0].dist;
    const endDist = nextLapFirstFrame
      ? Math.max(lastFrame.dist, nextLapFirstFrame.dist)
      : lastFrame.dist + (lastFrame.speed / 3.6) * avgDt;
    const distanceMeters = Math.max(0, endDist - startDist);

    let maxSpeedKmh = 0;
    let sumSpeed = 0;
    let peakTireTempC = 0;
    let brakeTimeSec = 0;
    let lowGripTimeSec = 0;

    for (let i = 0; i < n; i++) {
      const f = lapFrames[i];
      if (f.speed > maxSpeedKmh) maxSpeedKmh = f.speed;
      sumSpeed += f.speed;
      if (f.peakTireTemp > peakTireTempC) peakTireTempC = f.peakTireTemp;
      if (i > 0) {
        const dt = Math.max(0, f.t - lapFrames[i - 1].t);
        if (f.brake > 0.15) brakeTimeSec += dt;
        if (f.grip < 0.75) lowGripTimeSec += dt;
      }
    }

    let s1End;
    let s2End;
    if (distanceMeters > 5) {
      s1End = interpolateTimeAtDistance(lapFrames, startDist + distanceMeters / 3);
      s2End = interpolateTimeAtDistance(lapFrames, startDist + (2 * distanceMeters) / 3);
    } else {
      s1End = startTime + lapTimeSec / 3;
      s2End = startTime + (2 * lapTimeSec) / 3;
    }

    const s1Sec = Math.max(0, s1End - startTime);
    const s2Sec = Math.max(0, s2End - s1End);
    const s3Sec = Math.max(0, endTime - s2End);

    laps.push({
      lapNumber,
      frameCount: n,
      startTime,
      endTime,
      lapTimeSec,
      distanceMeters,
      maxSpeedKmh,
      avgSpeedKmh: sumSpeed / n,
      peakTireTempC,
      brakeTimeSec,
      lowGripTimeSec,
      sectors: [s1Sec, s2Sec, s3Sec],
      isBest: false
    });
  }

  const eligible = laps.filter((l) => l.frameCount >= 10);
  const candidates = eligible.length > 0 ? eligible : laps;
  if (candidates.length > 0) {
    let best = candidates[0];
    for (const lap of candidates) {
      if (lap.lapTimeSec < best.lapTimeSec) {
        best = lap;
      }
    }
    best.isBest = true;
  }

  return laps;
}

/**
 * Compares two lap summaries (lapB relative to reference lapA).
 * Negative time deltas mean lapB was faster than lapA.
 * @param {object} lapA
 * @param {object} lapB
 * @returns {object|null}
 */
export function compareLaps(lapA, lapB) {
  if (!lapA || !lapB) return null;

  const totalDeltaSec = lapB.lapTimeSec - lapA.lapTimeSec;
  const sectorDeltas = [0, 1, 2].map(
    (idx) => (lapB.sectors?.[idx] ?? 0) - (lapA.sectors?.[idx] ?? 0)
  );

  return {
    lapA: lapA.lapNumber,
    lapB: lapB.lapNumber,
    totalDeltaSec,
    sectorDeltas,
    maxSpeedDiff: lapB.maxSpeedKmh - lapA.maxSpeedKmh,
    avgSpeedDiff: lapB.avgSpeedKmh - lapA.avgSpeedKmh,
    peakTireTempDiff: lapB.peakTireTempC - lapA.peakTireTempC,
    fasterLapNumber:
      lapA.lapTimeSec <= lapB.lapTimeSec ? lapA.lapNumber : lapB.lapNumber
  };
}

const HEATMAP_METRICS = {
  speed: {
    label: 'Hız',
    unit: 'km/s',
    extract: (f) => f.speed
  },
  brake: {
    label: 'Fren',
    unit: '%',
    extract: (f) => f.brake * 100
  },
  tireTemp: {
    label: 'Lastik Isısı',
    unit: '°C',
    extract: (f) => f.avgTireTemp
  }
};

/**
 * Builds normalized 2D track heatmap coordinates and metric values.
 * @param {Array<object>} frames
 * @param {'speed'|'brake'|'tireTemp'} metric
 * @param {'all'|number|string} lapFilter
 * @returns {object}
 */
export function buildTrackHeatmapData(frames, metric = 'speed', lapFilter = 'all') {
  const cfg = HEATMAP_METRICS[metric] || HEATMAP_METRICS.speed;
  const metricKey = HEATMAP_METRICS[metric] ? metric : 'speed';

  const filtered =
    !Array.isArray(frames)
      ? []
      : lapFilter === 'all' || lapFilter === '' || lapFilter === null || lapFilter === undefined
        ? frames
        : frames.filter((f) => f.lap === Number(lapFilter));

  if (filtered.length === 0) {
    return {
      metric: metricKey,
      label: cfg.label,
      unit: cfg.unit,
      minVal: 0,
      maxVal: 0,
      bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
      points: []
    };
  }

  let minVal = Infinity;
  let maxVal = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const rawValues = new Array(filtered.length);
  for (let i = 0; i < filtered.length; i++) {
    const f = filtered[i];
    const v = cfg.extract(f);
    rawValues[i] = v;
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
    if (f.posX < minX) minX = f.posX;
    if (f.posX > maxX) maxX = f.posX;
    if (f.posY < minY) minY = f.posY;
    if (f.posY > maxY) maxY = f.posY;
  }

  const valSpan = maxVal - minVal;
  const points = filtered.map((f, i) => {
    const value = rawValues[i];
    const norm = valSpan > 1e-6 ? (value - minVal) / valSpan : 0.5;
    return {
      x: f.posX,
      y: f.posY,
      value,
      norm: Math.max(0, Math.min(1, norm)),
      t: f.t,
      lap: f.lap,
      speed: f.speed,
      brakePct: f.brake * 100,
      tireTemp: f.avgTireTemp
    };
  });

  return {
    metric: metricKey,
    label: cfg.label,
    unit: cfg.unit,
    minVal,
    maxVal,
    bounds: { minX, maxX, minY, maxY },
    points
  };
}
