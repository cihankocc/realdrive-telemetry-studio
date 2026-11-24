/**
 * 20 Hz MoTeC i2 Pro & raw CSV telemetry parser.
 */

const METADATA_KEYS = new Set([
  'Format',
  'Venue',
  'Vehicle',
  'Driver',
  'Device',
  'Comment',
  'Log Date',
  'Log Time',
  'Sample Rate',
  'Duration'
]);

function splitCsvCells(line) {
  return line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '').trim());
}

function toNumber(val, fallback) {
  if (val === undefined || val === null || val === '') return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function isHeaderOrMetadataRow(line, cells) {
  if (!line) return true;
  const first = cells[0] || '';
  if (METADATA_KEYS.has(first)) return true;
  const lowerLine = line.toLowerCase();
  if (
    lowerLine.startsWith('t,') ||
    lowerLine.startsWith('id,') ||
    lowerLine.startsWith('"time"') ||
    lowerLine.startsWith('time,') ||
    lowerLine.startsWith('"s",') ||
    lowerLine.startsWith('s,')
  ) {
    return true;
  }
  return false;
}

/**
 * Parses MoTeC i2 Pro 55-channel or raw 55/27-channel telemetry CSV text.
 * @param {string} csvText
 * @returns {{ ok: true, format: string, metadata: Record<string, string>, frames: Array<object> } | { ok: false, error: string }}
 */
export function parseTelemetryCsv(csvText) {
  if (typeof csvText !== 'string' || !csvText.trim()) {
    return {
      ok: false,
      error: 'CSV içeriği boş. Lütfen geçerli bir 20 Hz telemetri CSV dosyası seçin.'
    };
  }

  const cleaned = csvText.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/);

  const metadata = {
    format: '',
    venue: 'Bilinmeyen Pist',
    vehicle: 'Bilinmeyen Araç',
    driver: 'PILOT_01',
    device: '20 Hz Telemetry Logger',
    sampleRate: '20',
    duration: '',
    logDate: '',
    logTime: ''
  };

  let hasMotecMeta = false;
  let detectedCols = 0;
  const frames = [];
  let legacyDistAcc = 0;
  let prevLegacyT = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const cells = splitCsvCells(line);
    if (cells.length >= 2 && METADATA_KEYS.has(cells[0])) {
      hasMotecMeta = true;
      const key = cells[0];
      const val = cells[1];
      if (key === 'Format') metadata.format = val;
      else if (key === 'Venue' && val) metadata.venue = val;
      else if (key === 'Vehicle' && val) metadata.vehicle = val;
      else if (key === 'Driver' && val) metadata.driver = val;
      else if (key === 'Device' && val) metadata.device = val;
      else if (key === 'Sample Rate' && val) metadata.sampleRate = val;
      else if (key === 'Duration' && val) metadata.duration = val;
      else if (key === 'Log Date' && val) metadata.logDate = val;
      else if (key === 'Log Time' && val) metadata.logTime = val;
      continue;
    }

    if (isHeaderOrMetadataRow(line, cells)) continue;
    if (cells.length < 8) continue;

    const t = Number(cells[0]);
    if (!Number.isFinite(t)) continue;

    if (cells.length >= 50) {
      detectedCols = Math.max(detectedCols, cells.length);
      const speed = toNumber(cells[2], NaN);
      const rpm = toNumber(cells[3], NaN);
      if (!Number.isFinite(speed) || !Number.isFinite(rpm)) continue;

      const dist = toNumber(cells[1], 0);
      const gear = Math.round(toNumber(cells[4], 2));
      const thrRaw = toNumber(cells[5], 0);
      const brkRaw = toNumber(cells[6], 0);
      const steerRaw = toNumber(cells[7], 0);
      const gLat = toNumber(cells[8], 0);
      const gLong = toNumber(cells[9], 0);
      const yawRate = toNumber(cells[10], 0);
      const gripRaw = toNumber(cells[11], 1);

      const t12 = [];
      for (let i = 12; i <= 23; i++) {
        t12.push(toNumber(cells[i], 45));
      }
      const tempFL = (t12[0] + t12[1] + t12[2]) / 3;
      const tempFR = (t12[3] + t12[4] + t12[5]) / 3;
      const tempRL = (t12[6] + t12[7] + t12[8]) / 3;
      const tempRR = (t12[9] + t12[10] + t12[11]) / 3;
      const avgTireTemp = (tempFL + tempFR + tempRL + tempRR) / 4;
      const peakTireTemp = Math.max(...t12);

      const psiFL = toNumber(cells[24], 26);
      const psiFR = toNumber(cells[25], 26);
      const psiRL = toNumber(cells[26], 26);
      const psiRR = toNumber(cells[27], 26);

      const brakeTempFL = toNumber(cells[28], 80);
      const brakeTempFR = toNumber(cells[29], 80);
      const brakeTempRL = toNumber(cells[30], 80);
      const brakeTempRR = toNumber(cells[31], 80);
      const peakBrakeTemp = Math.max(brakeTempFL, brakeTempFR, brakeTempRL, brakeTempRR);

      const wearFL = toNumber(cells[32], 0);
      const wearFR = toNumber(cells[33], 0);
      const wearRL = toNumber(cells[34], 0);
      const wearRR = toNumber(cells[35], 0);

      const posX = toNumber(cells[48], 0);
      const posY = toNumber(cells[49], 0);
      const hpRaw = toNumber(cells[50], 1);
      const frameMs = toNumber(cells[51], 16);
      const lap = Math.max(1, Math.round(toNumber(cells[52], 1)));
      const position = Math.max(1, Math.round(toNumber(cells[53], 1)));
      const drs = toNumber(cells[54], 0);

      const pctToUnit = (raw) => (hasMotecMeta || raw > 1 ? raw / 100 : raw);

      frames.push({
        t,
        dist,
        speed,
        rpm,
        gear,
        throttle: pctToUnit(thrRaw),
        brake: pctToUnit(brkRaw),
        steer: hasMotecMeta || Math.abs(steerRaw) > 1 ? steerRaw / 36 : steerRaw,
        gLat,
        gLong,
        yawRate,
        grip: hasMotecMeta || gripRaw > 2 ? gripRaw / 100 : gripRaw,
        tempFL,
        tempFR,
        tempRL,
        tempRR,
        avgTireTemp,
        peakTireTemp,
        psiFL,
        psiFR,
        psiRL,
        psiRR,
        brakeTempFL,
        brakeTempFR,
        brakeTempRL,
        brakeTempRR,
        peakBrakeTemp,
        wearFL: pctToUnit(wearFL),
        wearFR: pctToUnit(wearFR),
        wearRL: pctToUnit(wearRL),
        wearRR: pctToUnit(wearRR),
        posX,
        posY,
        health: pctToUnit(hpRaw),
        frameMs,
        lap,
        position,
        drs
      });
    } else {
      detectedCols = Math.max(detectedCols, cells.length);
      const speed = toNumber(cells[1], NaN);
      const rpm = toNumber(cells[2], NaN);
      if (!Number.isFinite(speed) || !Number.isFinite(rpm)) continue;

      if (prevLegacyT !== null && t > prevLegacyT) {
        legacyDistAcc += (speed / 3.6) * (t - prevLegacyT);
      }
      prevLegacyT = t;

      const gear = Math.round(toNumber(cells[3], 2));
      const thrRaw = toNumber(cells[4], 0);
      const brkRaw = toNumber(cells[5], 0);
      const steerRaw = toNumber(cells[6], 0);
      const gripRaw = toNumber(cells[7], 1);
      const yawRate = toNumber(cells[10], 0);
      const posX = toNumber(cells[11], 0);
      const posY = toNumber(cells[12], 0);
      const hpRaw = toNumber(cells[13], 1);
      const frameMs = toNumber(cells[14], 16);
      const lap = Math.max(1, Math.round(toNumber(cells[15], 1)));
      const position = Math.max(1, Math.round(toNumber(cells[16], 1)));
      const gLat = toNumber(cells[17], 0);
      const gLong = toNumber(cells[18], 0);
      const tempFL = toNumber(cells[19], 45);
      const tempFR = toNumber(cells[20], 45);
      const tempRL = toNumber(cells[21], 45);
      const tempRR = toNumber(cells[22], 45);
      const wearFL = toNumber(cells[23], 0);
      const wearFR = toNumber(cells[24], 0);
      const wearRL = toNumber(cells[25], 0);
      const wearRR = toNumber(cells[26], 0);

      const avgTireTemp = (tempFL + tempFR + tempRL + tempRR) / 4;
      const peakTireTemp = Math.max(tempFL, tempFR, tempRL, tempRR);

      frames.push({
        t,
        dist: legacyDistAcc,
        speed,
        rpm,
        gear,
        throttle: thrRaw > 1 ? thrRaw / 100 : thrRaw,
        brake: brkRaw > 1 ? brkRaw / 100 : brkRaw,
        steer: Math.abs(steerRaw) > 1 ? steerRaw / 36 : steerRaw,
        gLat,
        gLong,
        yawRate,
        grip: gripRaw > 2 ? gripRaw / 100 : gripRaw,
        tempFL,
        tempFR,
        tempRL,
        tempRR,
        avgTireTemp,
        peakTireTemp,
        psiFL: 26,
        psiFR: 26,
        psiRL: 26,
        psiRR: 26,
        brakeTempFL: 80,
        brakeTempFR: 80,
        brakeTempRL: 80,
        brakeTempRR: 80,
        peakBrakeTemp: 80,
        wearFL: wearFL > 1 ? wearFL / 100 : wearFL,
        wearFR: wearFR > 1 ? wearFR / 100 : wearFR,
        wearRL: wearRL > 1 ? wearRL / 100 : wearRL,
        wearRR: wearRR > 1 ? wearRR / 100 : wearRR,
        posX,
        posY,
        health: hpRaw > 1 ? hpRaw / 100 : hpRaw,
        frameMs,
        lap,
        position,
        drs: 0
      });
    }
  }

  if (frames.length === 0) {
    return {
      ok: false,
      error:
        'Geçerli telemetri satırı bulunamadı. Lütfen 55 sütunlu MoTeC CSV veya 27 sütunlu ham CSV dosyası yükleyin.'
    };
  }

  if (frames.length < 2) {
    return {
      ok: false,
      error: 'Analiz için en az 2 geçerli telemetri örneği (satır) gereklidir.'
    };
  }

  const formatLabel = hasMotecMeta
    ? `MoTeC i2 Pro CSV (${detectedCols >= 50 ? 55 : detectedCols} Kanal)`
    : detectedCols >= 50
      ? 'Ham CSV (55 Kanal)'
      : 'Klasik CSV (27 Kanal)';

  return {
    ok: true,
    format: formatLabel,
    metadata,
    frames
  };
}
