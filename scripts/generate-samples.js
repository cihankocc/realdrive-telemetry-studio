import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const CHANNELS_ROW = [
  'Time', 'Distance', 'Speed', 'RPM', 'Gear', 'Throttle', 'Brake', 'Steering',
  'G_Lat', 'G_Long', 'YawRate', 'Grip',
  'Temp_FL_I', 'Temp_FL_M', 'Temp_FL_O', 'Temp_FR_I', 'Temp_FR_M', 'Temp_FR_O',
  'Temp_RL_I', 'Temp_RL_M', 'Temp_RL_O', 'Temp_RR_I', 'Temp_RR_M', 'Temp_RR_O',
  'Press_FL', 'Press_FR', 'Press_RL', 'Press_RR',
  'Brake_Temp_FL', 'Brake_Temp_FR', 'Brake_Temp_RL', 'Brake_Temp_RR',
  'Wear_FL', 'Wear_FR', 'Wear_RL', 'Wear_RR',
  'Susp_FL', 'Susp_FR', 'Susp_RL', 'Susp_RR',
  'Slip_FL', 'Slip_FR', 'Slip_RL', 'Slip_RR',
  'Fz_FL', 'Fz_FR', 'Fz_RL', 'Fz_RR',
  'PosX', 'PosY', 'Health', 'FrameMs', 'Lap', 'Position', 'DRS'
];

const UNITS_ROW = [
  's', 'm', 'km/h', 'rpm', '', '%', '%', 'deg',
  'G', 'G', 'rad/s', '%',
  'C', 'C', 'C', 'C', 'C', 'C',
  'C', 'C', 'C', 'C', 'C', 'C',
  'psi', 'psi', 'psi', 'psi',
  'C', 'C', 'C', 'C',
  '%', '%', '%', '%',
  'mm', 'mm', 'mm', 'mm',
  '%', '%', '%', '%',
  'N', 'N', 'N', 'N',
  'm', 'm', '%', 'ms', '', '', ''
];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function technicalSample(angle) {
  const r = 88 + 16 * Math.sin(3 * angle) + 7 * Math.sin(5 * angle);
  const dr = 48 * Math.cos(3 * angle) + 35 * Math.cos(5 * angle);
  const d2r = -144 * Math.sin(3 * angle) - 175 * Math.sin(5 * angle);

  const c = Math.cos(angle);
  const s = Math.sin(angle);

  const x = r * c;
  const y = r * s;

  const dx = dr * c - r * s;
  const dy = dr * s + r * c;
  const d2x = d2r * c - 2 * dr * s - r * c;
  const d2y = d2r * s + 2 * dr * c - r * s;

  const ds = Math.hypot(dx, dy);
  const curvature = (dx * d2y - dy * d2x) / Math.pow(Math.max(ds, 1e-4), 3);

  return { x, y, ds, curvature };
}

function citySample(uNorm) {
  const straight = 80;
  const r = 8;
  const cornerLen = (Math.PI * 0.5) * r;
  const sideLen = straight + cornerLen;
  const peri = 4 * sideLen;
  const halfStraight = straight * 0.5;
  const cx = halfStraight + r;
  const cy = halfStraight + r;

  let u = ((uNorm % 1) + 1) % 1 * peri;

  // Side 0: bottom straight -> SE corner
  if (u <= straight) {
    return { x: -halfStraight + u, y: -cy, curvature: 0, isCorner: false, straightProgress: u / straight, peri };
  }
  u -= straight;
  if (u <= cornerLen) {
    const th = -Math.PI * 0.5 + u / r;
    return { x: cx + Math.cos(th) * r, y: -cy + r + Math.sin(th) * r, curvature: 1 / r, isCorner: true, straightProgress: 1, peri };
  }
  u -= cornerLen;

  // Side 1: right straight -> NE corner
  if (u <= straight) {
    return { x: cx, y: -halfStraight + u, curvature: 0, isCorner: false, straightProgress: u / straight, peri };
  }
  u -= straight;
  if (u <= cornerLen) {
    const th = u / r;
    return { x: cx - r + Math.cos(th) * r, y: cy + Math.sin(th) * r, curvature: 1 / r, isCorner: true, straightProgress: 1, peri };
  }
  u -= cornerLen;

  // Side 2: top straight -> NW corner
  if (u <= straight) {
    return { x: halfStraight - u, y: cy, curvature: 0, isCorner: false, straightProgress: u / straight, peri };
  }
  u -= straight;
  if (u <= cornerLen) {
    const th = Math.PI * 0.5 + u / r;
    return { x: -cx + r + Math.cos(th) * r, y: cy - r + Math.sin(th) * r, curvature: 1 / r, isCorner: true, straightProgress: 1, peri };
  }
  u -= cornerLen;

  // Side 3: left straight -> SW corner
  if (u <= straight) {
    return { x: -cx, y: halfStraight - u, curvature: 0, isCorner: false, straightProgress: u / straight, peri };
  }
  u -= straight;
  const th = Math.PI + clamp(u, 0, cornerLen) / r;
  return { x: -cx + r + Math.cos(th) * r, y: -cy + r + Math.sin(th) * r, curvature: 1 / r, isCorner: true, straightProgress: 1, peri };
}

function buildCsvHeader({ venue, vehicle, driver, comment, logDate, logTime, sampleRate, duration }) {
  const lines = [
    `"Format","MoTeC CSV File"`,
    `"Venue","${venue}"`,
    `"Vehicle","${vehicle}"`,
    `"Driver","${driver}"`,
    `"Device","RealDrive Telemetry Logger"`,
    `"Comment","${comment}"`,
    `"Log Date","${logDate}"`,
    `"Log Time","${logTime}"`,
    `"Sample Rate","${sampleRate}"`,
    `"Duration","${duration.toFixed(2)}"`,
    '',
    CHANNELS_ROW.map((c) => `"${c}"`).join(','),
    UNITS_ROW.map((u) => `"${u}"`).join(',')
  ];
  return lines;
}

function gearForSpeed(speedKmh) {
  if (speedKmh < 48) return 1;
  if (speedKmh < 84) return 2;
  if (speedKmh < 120) return 3;
  if (speedKmh < 158) return 4;
  return 5;
}

function rpmForSpeed(speedKmh, gear) {
  const tops = [0, 62, 102, 140, 178, 225];
  const prevTop = tops[gear - 1] * 0.52;
  const top = tops[gear];
  const ratio = clamp((speedKmh - prevTop) / Math.max(1, top - prevTop), 0.15, 0.98);
  return 2600 + ratio * 5600;
}

function formatTelemetryRow(f) {
  return [
    f.t.toFixed(2), f.dist.toFixed(1), f.speed.toFixed(1), f.rpm.toFixed(0), f.gear,
    f.throttlePct.toFixed(1), f.brakePct.toFixed(1), f.steerDeg.toFixed(2),
    f.gLat.toFixed(2), f.gLong.toFixed(2), f.yawRate.toFixed(3), f.gripPct.toFixed(1),
    ...f.temps,
    ...f.pressures,
    ...f.brakeTemps,
    ...f.wears,
    ...f.susps,
    ...f.slips,
    ...f.fzs,
    f.posX.toFixed(2), f.posY.toFixed(2), f.healthPct.toFixed(1), f.frameMs.toFixed(1),
    f.lap, f.position, f.drs
  ].join(',');
}

function generateTechnical3Laps() {
  const dt = 0.05;
  const lapConfigs = [
    { lap: 1, targetFrames: 576, speedMult: 0.942, tempStart: 56, tempEnd: 82, brakeBase: 250, gripBase: 0.96, overheated: false },
    { lap: 2, targetFrames: 542, speedMult: 1.005, tempStart: 84, tempEnd: 94, brakeBase: 320, gripBase: 1.08, overheated: false },
    { lap: 3, targetFrames: 560, speedMult: 0.968, tempStart: 97, tempEnd: 108, brakeBase: 420, gripBase: 0.92, overheated: true }
  ];

  // Precompute arc-length table for technical track so constant-speed/angle mapping is exact
  const steps = 4000;
  const arcTable = new Float64Array(steps + 1);
  for (let i = 1; i <= steps; i++) {
    const aPrev = ((i - 1) / steps) * Math.PI * 2;
    const aCurr = (i / steps) * Math.PI * 2;
    const p0 = technicalSample(aPrev);
    const p1 = technicalSample(aCurr);
    arcTable[i] = arcTable[i - 1] + Math.hypot(p1.x - p0.x, p1.y - p0.y);
  }
  const totalArc = arcTable[steps];

  function angleAtProgress(u) {
    const targetS = clamp(u, 0, 1) * totalArc;
    let lo = 0;
    let hi = steps;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arcTable[mid] < targetS) lo = mid + 1;
      else hi = mid;
    }
    return (lo / steps) * Math.PI * 2;
  }

  const rows = [];
  let t = 0;
  let dist = 0;
  let prevSpeedKmh = 78;
  let prevBrakeTemp = 180;

  for (const cfg of lapConfigs) {
    const n = cfg.targetFrames;
    // Build speed curve along lap progress u in [0, 1)
    const targetSpeeds = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const uLook = (i + 8) / n;
      const a = angleAtProgress(u);
      const aLook = angleAtProgress(uLook % 1);
      const sNow = technicalSample(a);
      const sAhead = technicalSample(aLook);
      const maxCurv = Math.max(Math.abs(sNow.curvature), Math.abs(sAhead.curvature) * 0.88);
      const baseCornerSpeed = clamp(128 - maxCurv * 2350, 56, 128);
      const harmonic = 6 * Math.sin(u * Math.PI * 6 + 0.4);
      targetSpeeds[i] = clamp((baseCornerSpeed + harmonic) * cfg.speedMult, 52, 136);
    }

    // Smooth pass to ensure continuous acceleration/braking
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < n - 1; i++) {
        targetSpeeds[i] = 0.25 * targetSpeeds[i - 1] + 0.5 * targetSpeeds[i] + 0.25 * targetSpeeds[i + 1];
      }
    }

    for (let i = 0; i < n; i++) {
      const u = i / n;
      const a = angleAtProgress(u);
      const pt = technicalSample(a);
      const speedKmh = targetSpeeds[i];
      const speedMps = speedKmh / 3.6;
      const accelMps2 = (speedKmh - prevSpeedKmh) / 3.6 / dt;
      prevSpeedKmh = speedKmh;

      const gLong = clamp(accelMps2 / 9.81, -1.45, 1.05);
      const gLat = clamp((speedMps * speedMps * pt.curvature) / 9.81, -1.85, 1.85);
      const yawRate = clamp(speedMps * pt.curvature, -1.2, 1.2);
      const steerDeg = clamp(pt.curvature * 1450, -34, 34);

      const brakePct = gLong < -0.14 ? clamp((-gLong - 0.1) * 85, 10, 98) : 0;
      const throttlePct = brakePct > 8 ? 0 : clamp(42 + (gLong + 0.1) * 70 + (speedKmh > 96 ? 18 : 0), 15, 100);

      // Tire temps rise across the lap and peak slightly in high lateral G corners
      const progressTemp = cfg.tempStart + (cfg.tempEnd - cfg.tempStart) * u;
      const cornerLoadHeat = Math.abs(gLat) * 4.2 + (brakePct > 20 ? 2.8 : 0);
      const baseTemp = progressTemp + cornerLoadHeat;

      const temps = [];
      for (let w = 0; w < 4; w++) {
        const bias = w < 2 ? 2.4 : -0.8;
        const sideBias = (w % 2 === 0 ? -gLat : gLat) * 2.1;
        const tM = baseTemp + bias + sideBias;
        const tI = tM + 2.2;
        const tO = tM - 1.6;
        temps.push(tI.toFixed(1), tM.toFixed(1), tO.toFixed(1));
      }

      // Brake temps spike during braking and cool down on straights
      const targetBrakeTemp = cfg.brakeBase + brakePct * 2.6;
      prevBrakeTemp = prevBrakeTemp + (targetBrakeTemp - prevBrakeTemp) * (brakePct > 10 ? 0.22 : 0.05);
      const bFront = prevBrakeTemp;
      const bRear = prevBrakeTemp * 0.84;
      const brakeTemps = [bFront.toFixed(1), (bFront + 6).toFixed(1), bRear.toFixed(1), (bRear + 4).toFixed(1)];

      // Grip dips briefly below 75% (< 0.75) during Lap 3 overheated corner exits
      let grip = cfg.gripBase - Math.abs(gLat) * 0.11;
      if (cfg.overheated && Math.abs(gLat) > 0.78) {
        grip = 0.63 + 0.08 * Math.sin(u * 25);
      }
      const gripPct = clamp(grip * 100, 55, 118);

      const wearBase = (cfg.lap - 1) * 4.2 + u * 4.0;
      const wears = [
        (wearBase + 0.9).toFixed(1), (wearBase + 1.1).toFixed(1),
        (wearBase + 0.4).toFixed(1), (wearBase + 0.5).toFixed(1)
      ];
      const psiBase = 25.4 + (baseTemp - 55) * 0.052;
      const pressures = [
        (psiBase + 0.3).toFixed(1), (psiBase + 0.4).toFixed(1),
        psiBase.toFixed(1), (psiBase + 0.1).toFixed(1)
      ];
      const susps = [
        (12 + gLong * 11 - gLat * 6).toFixed(1),
        (12 + gLong * 11 + gLat * 6).toFixed(1),
        (14 - gLong * 11 - gLat * 5).toFixed(1),
        (14 - gLong * 11 + gLat * 5).toFixed(1)
      ];
      const slipPct = clamp((1.08 - gripPct / 100) * 35 + Math.abs(gLat) * 4, 0.5, 24);
      const slips = [
        slipPct.toFixed(1), (slipPct * 1.05).toFixed(1),
        (slipPct * 1.12).toFixed(1), (slipPct * 1.08).toFixed(1)
      ];
      const fzFront = 3500 - gLong * 720;
      const fzRear = 3500 + gLong * 720;
      const fzs = [
        (fzFront * 0.5 - gLat * 480).toFixed(0),
        (fzFront * 0.5 + gLat * 480).toFixed(0),
        (fzRear * 0.5 - gLat * 420).toFixed(0),
        (fzRear * 0.5 + gLat * 420).toFixed(0)
      ];

      const gear = gearForSpeed(speedKmh);
      const rpm = rpmForSpeed(speedKmh, gear);

      rows.push(formatTelemetryRow({
        t, dist, speed: speedKmh, rpm, gear, throttlePct, brakePct, steerDeg,
        gLat, gLong, yawRate, gripPct,
        temps, pressures, brakeTemps, wears, susps, slips, fzs,
        posX: pt.x, posY: pt.y,
        healthPct: 100 - (cfg.lap - 1) * 1.2,
        frameMs: 16.4 + 0.4 * Math.sin(i * 0.3),
        lap: cfg.lap,
        position: cfg.lap === 1 ? 2 : 1,
        drs: brakePct === 0 && Math.abs(gLat) < 0.35 && speedKmh > 105 ? 1 : 0
      }));

      t += dt;
      dist += speedMps * dt;
    }
  }

  const totalDuration = (rows.length - 1) * dt;
  const header = buildCsvHeader({
    venue: 'Teknik Pist',
    vehicle: 'Apex GT-R',
    driver: 'PILOT_01',
    comment: '20 Hz Teknik Pist 3 Tur Telemetri Kaydi',
    logDate: '2026-11-24',
    logTime: '10:15:00',
    sampleRate: 20,
    duration: totalDuration
  });

  return [...header, ...rows].join('\n') + '\n';
}

function generateCity1Lap() {
  const dt = 0.05;
  const totalFrames = 390; // 19.50 seconds (0.00 -> 19.45s)
  const rows = [];

  let t = 0;
  let dist = 0;
  let prevSpeedKmh = 68;
  let prevBrakeTemp = 190;

  // Build speed profile for 4 straights + 4 tight 90-deg corners
  const speeds = new Float64Array(totalFrames);
  for (let i = 0; i < totalFrames; i++) {
    const u = i / totalFrames;
    const pt = citySample(u);
    if (pt.isCorner) {
      speeds[i] = 41 + 4 * Math.sin(u * 25);
    } else {
      // Accelerate out of corner, brake sharply at straightProgress > 0.72
      if (pt.straightProgress < 0.72) {
        speeds[i] = 44 + (pt.straightProgress / 0.72) * 74;
      } else {
        const brakeU = (pt.straightProgress - 0.72) / 0.28;
        speeds[i] = 118 - brakeU * 76;
      }
    }
  }

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < totalFrames - 1; i++) {
      speeds[i] = 0.25 * speeds[i - 1] + 0.5 * speeds[i] + 0.25 * speeds[i + 1];
    }
  }

  for (let i = 0; i < totalFrames; i++) {
    const u = i / totalFrames;
    const pt = citySample(u);
    const speedKmh = speeds[i];
    const speedMps = speedKmh / 3.6;
    const accelMps2 = (speedKmh - prevSpeedKmh) / 3.6 / dt;
    prevSpeedKmh = speedKmh;

    const gLong = clamp(accelMps2 / 9.81, -1.6, 1.0);
    const gLat = clamp((speedMps * speedMps * pt.curvature) / 9.81, -1.7, 1.7);
    const yawRate = clamp(speedMps * pt.curvature, -1.5, 1.5);
    const steerDeg = pt.isCorner ? 28.5 : clamp(Math.sin(u * 40) * 1.2, -3, 3);

    const brakePct = gLong < -0.15 ? clamp((-gLong - 0.1) * 72, 12, 96) : 0;
    const throttlePct = brakePct > 10 ? 0 : clamp(45 + (gLong + 0.08) * 65, 18, 100);

    const baseTemp = 72 + u * 16 + (pt.isCorner ? 4.5 : 0);
    const temps = [];
    for (let w = 0; w < 4; w++) {
      const tM = baseTemp + (w < 2 ? 2.5 : -0.6);
      temps.push((tM + 1.8).toFixed(1), tM.toFixed(1), (tM - 1.5).toFixed(1));
    }

    const targetBrakeTemp = 260 + brakePct * 3.1;
    prevBrakeTemp = prevBrakeTemp + (targetBrakeTemp - prevBrakeTemp) * (brakePct > 10 ? 0.28 : 0.06);
    const brakeTemps = [
      prevBrakeTemp.toFixed(1), (prevBrakeTemp + 5).toFixed(1),
      (prevBrakeTemp * 0.82).toFixed(1), (prevBrakeTemp * 0.84).toFixed(1)
    ];

    const grip = pt.isCorner ? 0.86 : 1.04;
    const gripPct = grip * 100;
    const wears = [(1.2 + u * 1.4).toFixed(1), (1.3 + u * 1.5).toFixed(1), (0.8 + u * 1.1).toFixed(1), (0.9 + u * 1.1).toFixed(1)];
    const pressures = ['26.8', '26.9', '26.2', '26.3'];
    const susps = [
      (12 + gLong * 12).toFixed(1), (12 + gLong * 12).toFixed(1),
      (13 - gLong * 12).toFixed(1), (13 - gLong * 12).toFixed(1)
    ];
    const slipPct = pt.isCorner ? 7.5 : 2.1;
    const slips = [slipPct.toFixed(1), slipPct.toFixed(1), (slipPct * 1.1).toFixed(1), (slipPct * 1.1).toFixed(1)];
    const fzFront = 3450 - gLong * 700;
    const fzRear = 3450 + gLong * 700;
    const fzs = [
      (fzFront * 0.5 - gLat * 400).toFixed(0), (fzFront * 0.5 + gLat * 400).toFixed(0),
      (fzRear * 0.5 - gLat * 350).toFixed(0), (fzRear * 0.5 + gLat * 350).toFixed(0)
    ];

    const gear = gearForSpeed(speedKmh);
    const rpm = rpmForSpeed(speedKmh, gear);

    rows.push(formatTelemetryRow({
      t, dist, speed: speedKmh, rpm, gear, throttlePct, brakePct, steerDeg,
      gLat, gLong, yawRate, gripPct,
      temps, pressures, brakeTemps, wears, susps, slips, fzs,
      posX: pt.x, posY: pt.y,
      healthPct: 100, frameMs: 16.5, lap: 1, position: 1,
      drs: brakePct === 0 && !pt.isCorner && speedKmh > 92 ? 1 : 0
    }));

    t += dt;
    dist += speedMps * dt;
  }

  const totalDuration = (rows.length - 1) * dt;
  const header = buildCsvHeader({
    venue: 'Şehir Devresi',
    vehicle: 'Velocity GT',
    driver: 'PILOT_01',
    comment: '20 Hz Sehir Devresi 1 Tur Telemetri Kaydi',
    logDate: '2026-11-24',
    logTime: '11:05:00',
    sampleRate: 20,
    duration: totalDuration
  });

  return [...header, ...rows].join('\n') + '\n';
}

async function main() {
  const samplesDir = path.join(ROOT_DIR, 'samples');
  await fs.mkdir(samplesDir, { recursive: true });

  const techCsv = generateTechnical3Laps();
  const cityCsv = generateCity1Lap();

  await fs.writeFile(path.join(samplesDir, 'teknik_pist_3tur.csv'), techCsv, 'utf8');
  await fs.writeFile(path.join(samplesDir, 'sehir_devresi_1tur.csv'), cityCsv, 'utf8');

  console.log('Generated samples/teknik_pist_3tur.csv and samples/sehir_devresi_1tur.csv');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
