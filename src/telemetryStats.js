/**
 * Summary KPI calculations and time formatting for 20 Hz telemetry frames.
 */

/**
 * Computes session-wide telemetry KPI metrics from parsed frames.
 * @param {Array<object>} frames
 * @returns {object}
 */
export function computeTelemetryStats(frames) {
  if (!Array.isArray(frames) || frames.length === 0) {
    return {
      sampleCount: 0,
      durationSec: 0,
      distanceMeters: 0,
      lapCount: 0,
      maxSpeedKmh: 0,
      avgSpeedKmh: 0,
      maxRpm: 0,
      peakLatG: 0,
      peakLongG: 0,
      brakeTimeSec: 0,
      brakeRatioPct: 0,
      lowGripTimeSec: 0,
      fullThrottlePct: 0,
      peakTireTempC: 0,
      peakBrakeTempC: 0,
      maxTireWearPct: 0
    };
  }

  let maxSpeedKmh = 0;
  let sumSpeed = 0;
  let maxRpm = 0;
  let peakLatG = 0;
  let peakLongG = 0;
  let brakeTimeSec = 0;
  let lowGripTimeSec = 0;
  let fullThrottleCount = 0;
  let peakTireTempC = 0;
  let peakBrakeTempC = 0;
  let maxWear = 0;
  const laps = new Set();

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (f.speed > maxSpeedKmh) maxSpeedKmh = f.speed;
    sumSpeed += f.speed;
    if (f.rpm > maxRpm) maxRpm = f.rpm;
    if (Math.abs(f.gLat) > peakLatG) peakLatG = Math.abs(f.gLat);
    if (Math.abs(f.gLong) > peakLongG) peakLongG = Math.abs(f.gLong);
    if (f.throttle >= 0.9) fullThrottleCount++;
    if (f.peakTireTemp > peakTireTempC) peakTireTempC = f.peakTireTemp;
    if (f.peakBrakeTemp > peakBrakeTempC) peakBrakeTempC = f.peakBrakeTemp;

    const frameMaxWear = Math.max(f.wearFL, f.wearFR, f.wearRL, f.wearRR);
    if (frameMaxWear > maxWear) maxWear = frameMaxWear;
    laps.add(f.lap);

    if (i > 0) {
      const dt = Math.max(0, f.t - frames[i - 1].t);
      if (f.brake > 0.15) brakeTimeSec += dt;
      if (f.grip < 0.75) lowGripTimeSec += dt;
    }
  }

  const durationSec = Math.max(0, frames[frames.length - 1].t - frames[0].t);
  const distanceMeters = Math.max(0, frames[frames.length - 1].dist - frames[0].dist);

  return {
    sampleCount: frames.length,
    durationSec,
    distanceMeters,
    lapCount: laps.size,
    maxSpeedKmh,
    avgSpeedKmh: sumSpeed / frames.length,
    maxRpm,
    peakLatG,
    peakLongG,
    brakeTimeSec,
    brakeRatioPct: durationSec > 0 ? (brakeTimeSec / durationSec) * 100 : 0,
    lowGripTimeSec,
    fullThrottlePct: (fullThrottleCount / frames.length) * 100,
    peakTireTempC,
    peakBrakeTempC,
    maxTireWearPct: maxWear * 100
  };
}

/**
 * Formats seconds as m:ss.cc (e.g. 0:27.10).
 * @param {number} seconds
 * @returns {string}
 */
export function formatLapTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.00';
  const totalCentis = Math.round(seconds * 100);
  const mins = Math.floor(totalCentis / 6000);
  const rem = totalCentis % 6000;
  const secs = Math.floor(rem / 100);
  const centis = rem % 100;
  return `${mins}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}
