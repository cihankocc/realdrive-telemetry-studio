import { parseTelemetryCsv } from '/src/telemetryParser.js';
import { computeTelemetryStats, formatLapTime } from '/src/telemetryStats.js';
import { extractLaps, compareLaps, buildTrackHeatmapData } from '/src/lapAnalyzer.js';

const CHANNELS = [
  {
    id: 'speed',
    label: 'Hız (km/s)',
    color: '#00e5ff',
    min: 0,
    max: 160,
    autoMax: true,
    getValue: (f) => f.speed
  },
  {
    id: 'throttle',
    label: 'Gaz (%)',
    color: '#66ff88',
    min: 0,
    max: 100,
    autoMax: false,
    getValue: (f) => f.throttle * 100
  },
  {
    id: 'brake',
    label: 'Fren (%)',
    color: '#ff5555',
    min: 0,
    max: 100,
    autoMax: false,
    getValue: (f) => f.brake * 100
  },
  {
    id: 'rpm',
    label: 'RPM',
    color: '#ffcc44',
    min: 0,
    max: 9000,
    autoMax: true,
    getValue: (f) => f.rpm
  },
  {
    id: 'tireTemp',
    label: 'Lastik Isısı (°C)',
    color: '#ff6e40',
    min: 30,
    max: 130,
    autoMax: true,
    getValue: (f) => f.avgTireTemp
  },
  {
    id: 'gLat',
    label: 'Yanal G (|G|)',
    color: '#bb86fc',
    min: 0,
    max: 2.5,
    autoMax: true,
    getValue: (f) => Math.abs(f.gLat)
  }
];

const HEATMAP_METRIC_BUTTONS = [
  { id: 'speed', label: 'Hız' },
  { id: 'brake', label: 'Fren' },
  { id: 'tireTemp', label: 'Lastik Isısı' }
];

const state = {
  frames: [],
  metadata: {},
  format: '',
  sourceName: '',
  activeChannels: new Set(['speed', 'throttle', 'brake']),
  hoverIndex: null,
  laps: [],
  lapANumber: null,
  lapBNumber: null,
  heatmapMetric: 'speed',
  heatmapLapFilter: 'all',
  heatmapData: null,
  heatmapProjected: [],
  heatmapHoverIdx: null
};

const els = {
  headerStatus: document.getElementById('header-status'),
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('csv-file-input'),
  btnSampleTech: document.getElementById('btn-sample-tech'),
  btnSampleCity: document.getElementById('btn-sample-city'),
  errorBanner: document.getElementById('error-banner'),
  metaStrip: document.getElementById('meta-strip'),
  kpiGrid: document.getElementById('kpi-grid'),
  channelToggles: document.getElementById('channel-toggles'),
  chartCanvas: document.getElementById('telemetry-chart'),
  cursorReadout: document.getElementById('chart-cursor-readout'),
  feature2Mount: document.getElementById('feature2-mount')
};

let f2Els = null;

function mountFeature2Dom() {
  if (!els.feature2Mount) return;
  els.feature2Mount.innerHTML = `
    <section class="card" id="lap-comparison-section">
      <div class="card-header">
        <div>
          <h2 class="card-title">4. Tur Bazlı Performans ve Sektör Karşılaştırması</h2>
          <p class="card-subtitle">
            Otomatik tur ayrıştırma, S1/S2/S3 sektör süreleri ve iki tur arasında zaman farkı (Δt) analizi
          </p>
        </div>
      </div>

      <div class="split-grid">
        <div class="table-wrap">
          <table class="lap-table">
            <thead>
              <tr>
                <th>Tur</th>
                <th>Süre</th>
                <th>S1</th>
                <th>S2</th>
                <th>S3</th>
                <th>Maks. Hız</th>
                <th>Ort. Hız</th>
                <th>Lastik</th>
              </tr>
            </thead>
            <tbody id="lap-table-body"></tbody>
          </table>
        </div>

        <div>
          <div class="compare-controls" id="lap-compare-controls">
            <div class="select-group">
              <label for="select-lap-a">Referans Tur (A)</label>
              <select class="select-input" id="select-lap-a"></select>
            </div>
            <div class="select-group">
              <label for="select-lap-b">Karşılaştırılan Tur (B)</label>
              <select class="select-input" id="select-lap-b"></select>
            </div>
          </div>

          <div class="info-banner hidden" id="lap-single-notice">
            Bu oturumda yalnızca 1 tur bulunuyor. Tur karşılaştırması için en az 2 tur içeren bir oturum yükleyin; tek tur özeti ve 2B pist ısı haritası aktif olarak çalışmaktadır.
          </div>

          <div class="delta-grid" id="lap-delta-grid"></div>
        </div>
      </div>
    </section>

    <section class="card" id="track-heatmap-section" style="margin-top: 20px;">
      <div class="card-header">
        <div>
          <h2 class="card-title">5. 2B Pist Isı Haritası (Track Heatmap)</h2>
          <p class="card-subtitle">
            PosX / PosY koordinatları üzerinde hız, frenleme yoğunluğu veya lastik sıcaklığı dağılımı
          </p>
        </div>
      </div>

      <div class="heatmap-toolbar">
        <div class="channel-toggles" id="heatmap-metrics"></div>
        <div class="select-group" style="min-width: 170px;">
          <label for="heatmap-lap-filter">Tur Filtresi</label>
          <select class="select-input" id="heatmap-lap-filter"></select>
        </div>
      </div>

      <div class="canvas-frame">
        <canvas class="heatmap-canvas" id="track-heatmap-canvas"></canvas>
      </div>

      <div class="heatmap-legend">
        <div class="legend-ramp-wrap">
          <span id="heatmap-min-label">Min: -</span>
          <div class="legend-ramp" id="heatmap-legend-ramp"></div>
          <span id="heatmap-max-label">Maks: -</span>
        </div>
        <span id="heatmap-cursor-readout">İmleci pist çizgisi üzerine getirerek nokta verilerini inceleyin.</span>
      </div>
    </section>
  `;

  f2Els = {
    lapTableBody: document.getElementById('lap-table-body'),
    compareControls: document.getElementById('lap-compare-controls'),
    selectLapA: document.getElementById('select-lap-a'),
    selectLapB: document.getElementById('select-lap-b'),
    singleNotice: document.getElementById('lap-single-notice'),
    deltaGrid: document.getElementById('lap-delta-grid'),
    heatmapMetrics: document.getElementById('heatmap-metrics'),
    heatmapLapFilter: document.getElementById('heatmap-lap-filter'),
    heatmapCanvas: document.getElementById('track-heatmap-canvas'),
    heatmapMinLabel: document.getElementById('heatmap-min-label'),
    heatmapMaxLabel: document.getElementById('heatmap-max-label'),
    heatmapLegendRamp: document.getElementById('heatmap-legend-ramp'),
    heatmapCursorReadout: document.getElementById('heatmap-cursor-readout')
  };

  f2Els.selectLapA.addEventListener('change', () => {
    state.lapANumber = Number(f2Els.selectLapA.value);
    renderLapComparison();
  });

  f2Els.selectLapB.addEventListener('change', () => {
    state.lapBNumber = Number(f2Els.selectLapB.value);
    renderLapComparison();
  });

  f2Els.heatmapMetrics.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-heatmap-metric]');
    if (!btn) return;
    state.heatmapMetric = btn.dataset.heatmapMetric;
    state.heatmapHoverIdx = null;
    refreshHeatmap();
  });

  f2Els.heatmapLapFilter.addEventListener('change', () => {
    state.heatmapLapFilter = f2Els.heatmapLapFilter.value;
    state.heatmapHoverIdx = null;
    refreshHeatmap();
  });

  f2Els.heatmapCanvas.addEventListener('mousemove', (e) => {
    if (!state.heatmapProjected.length) return;
    const rect = f2Els.heatmapCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let bestIdx = -1;
    let bestDistSq = 28 * 28;
    for (let i = 0; i < state.heatmapProjected.length; i++) {
      const p = state.heatmapProjected[i];
      const dx = p.sx - mx;
      const dy = p.sy - my;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestIdx = i;
      }
    }

    state.heatmapHoverIdx = bestIdx >= 0 ? bestIdx : null;
    updateHeatmapCursorReadout();
    drawHeatmap();
  });

  f2Els.heatmapCanvas.addEventListener('mouseleave', () => {
    state.heatmapHoverIdx = null;
    updateHeatmapCursorReadout();
    drawHeatmap();
  });
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function showError(message) {
  els.errorBanner.textContent = message;
  els.errorBanner.classList.remove('hidden');
}

function clearError() {
  els.errorBanner.textContent = '';
  els.errorBanner.classList.add('hidden');
}

function renderMetadata() {
  const m = state.metadata;
  const items = [
    { label: 'Pist (Venue)', value: m.venue || '-' },
    { label: 'Araç', value: m.vehicle || '-' },
    { label: 'Pilot', value: m.driver || '-' },
    { label: 'Format', value: state.format || '-' },
    { label: 'Örnek Sayısı', value: `${state.frames.length} satır` },
    { label: 'Örnekleme Hızı', value: `${m.sampleRate || '20'} Hz` }
  ];

  els.metaStrip.innerHTML = items
    .map(
      (item) => `
      <div class="meta-item">
        <div class="meta-label">${escapeHtml(item.label)}</div>
        <div class="meta-value">${escapeHtml(item.value)}</div>
      </div>`
    )
    .join('');
}

function renderKpis(stats) {
  const cards = [
    {
      label: 'Maks. Hız',
      value: `${stats.maxSpeedKmh.toFixed(1)} km/s`,
      sub: `Ort. ${stats.avgSpeedKmh.toFixed(1)} km/s`,
      tone: ''
    },
    {
      label: 'Tepe Yanal / Boyuna G',
      value: `${stats.peakLatG.toFixed(2)} G`,
      sub: `Boyuna: ${stats.peakLongG.toFixed(2)} G`,
      tone: 'gold'
    },
    {
      label: 'Fren Süresi',
      value: `${stats.brakeTimeSec.toFixed(1)} sn`,
      sub: `Oturumun %${stats.brakeRatioPct.toFixed(1)}'i · Tam Gaz %${stats.fullThrottlePct.toFixed(0)}`,
      tone: 'red'
    },
    {
      label: 'Tutunma Kaybı (<0.75)',
      value: `${stats.lowGripTimeSec.toFixed(1)} sn`,
      sub: stats.lowGripTimeSec > 0 ? 'Virajlarda kayma tespit edildi' : 'Stabil tutunma',
      tone: stats.lowGripTimeSec > 0 ? 'orange' : 'green'
    },
    {
      label: 'Tepe Lastik Isısı',
      value: `${stats.peakTireTempC.toFixed(1)} °C`,
      sub: `Maks. Aşınma %${stats.maxTireWearPct.toFixed(1)}`,
      tone: stats.peakTireTempC >= 100 ? 'orange' : 'green'
    },
    {
      label: 'Tepe Fren Diski Isısı',
      value: `${stats.peakBrakeTempC.toFixed(0)} °C`,
      sub: `Maks. Devir ${Math.round(stats.maxRpm)} rpm`,
      tone: 'gold'
    },
    {
      label: 'Toplam Süre & Mesafe',
      value: formatLapTime(stats.durationSec),
      sub: `${stats.distanceMeters.toFixed(0)} m · ${stats.lapCount} Tur`,
      tone: ''
    }
  ];

  els.kpiGrid.innerHTML = cards
    .map(
      (c) => `
      <div class="kpi-card">
        <div class="kpi-label">${escapeHtml(c.label)}</div>
        <div class="kpi-value ${escapeHtml(c.tone)}">${escapeHtml(c.value)}</div>
        <div class="kpi-sub">${escapeHtml(c.sub)}</div>
      </div>`
    )
    .join('');
}

function renderChannelToggles() {
  els.channelToggles.innerHTML = CHANNELS.map((ch) => {
    const active = state.activeChannels.has(ch.id);
    return `
      <button
        type="button"
        class="btn channel-btn ${active ? 'active' : ''}"
        data-channel-id="${escapeHtml(ch.id)}"
      >
        <span class="channel-dot" style="background:${escapeHtml(ch.color)};"></span>
        ${escapeHtml(ch.label)}
      </button>
    `;
  }).join('');
}

function updateCursorReadout(frame) {
  if (!frame) {
    if (state.frames.length > 0) {
      els.cursorReadout.innerHTML =
        '<span>İmleci grafik üzerine getirerek anlık <strong>20 Hz</strong> telemetri değerlerini okuyun.</span>';
    }
    return;
  }

  els.cursorReadout.innerHTML = `
    <span>Zaman: <strong>${frame.t.toFixed(2)}s</strong></span>
    <span>Tur: <strong>${frame.lap}</strong></span>
    <span>Vites: <strong>${frame.gear}</strong></span>
    <span>Hız: <strong>${frame.speed.toFixed(1)} km/s</strong></span>
    <span>RPM: <strong>${Math.round(frame.rpm)}</strong></span>
    <span>Gaz: <strong>%${(frame.throttle * 100).toFixed(0)}</strong></span>
    <span>Fren: <strong>%${(frame.brake * 100).toFixed(0)}</strong></span>
    <span>Lastik: <strong>${frame.avgTireTemp.toFixed(1)} °C</strong></span>
    <span>Tutunma: <strong>%${(frame.grip * 100).toFixed(0)}</strong></span>
  `;
}

function drawChart() {
  const canvas = els.chartCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width));
  const height = Math.max(240, Math.round(rect.height));

  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = '#04080f';
  ctx.fillRect(0, 0, width, height);

  const frames = state.frames;
  if (!frames || frames.length < 2) {
    ctx.restore();
    return;
  }

  const pad = { top: 26, right: 20, bottom: 32, left: 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  ctx.strokeStyle = 'rgba(148, 179, 214, 0.14)';
  ctx.lineWidth = 1;
  for (let row = 0; row <= 4; row++) {
    const y = pad.top + (plotH * row) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
  }

  const tMin = frames[0].t;
  const tMax = Math.max(tMin + 0.1, frames[frames.length - 1].t);
  const tSpan = tMax - tMin;

  ctx.font = '11px Consolas, monospace';
  ctx.fillStyle = '#93a8c7';
  const tickCount = 6;
  for (let i = 0; i <= tickCount; i++) {
    const ratio = i / tickCount;
    const x = pad.left + ratio * plotW;
    ctx.strokeStyle = 'rgba(148, 179, 214, 0.1)';
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + plotH);
    ctx.stroke();
    const labelT = tMin + ratio * tSpan;
    ctx.fillText(`${labelT.toFixed(1)}s`, Math.min(width - 42, Math.max(pad.left, x - 14)), height - 10);
  }

  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(255, 204, 68, 0.35)';
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].lap !== frames[i - 1].lap) {
      const x = pad.left + ((frames[i].t - tMin) / tSpan) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotH);
      ctx.stroke();
      ctx.fillStyle = '#ffcc44';
      ctx.fillText(`Tur ${frames[i].lap}`, x + 4, pad.top + 13);
    }
  }
  ctx.restore();

  const activeList = CHANNELS.filter((ch) => state.activeChannels.has(ch.id));
  if (activeList.length === 0) {
    ctx.restore();
    return;
  }

  const primary = activeList[0];
  let primaryMax = primary.max;
  if (primary.autoMax) {
    let observedMax = primary.min + 1;
    for (const f of frames) {
      const val = primary.getValue(f);
      if (val > observedMax) observedMax = val;
    }
    primaryMax = observedMax * 1.1;
  }
  ctx.fillStyle = primary.color;
  ctx.font = '11px Consolas, monospace';
  for (let row = 0; row <= 4; row++) {
    const y = pad.top + (plotH * row) / 4;
    const val = primaryMax - ((primaryMax - primary.min) * row) / 4;
    ctx.fillText(val >= 100 ? Math.round(val).toString() : val.toFixed(1), 8, y + 4);
  }

  for (const ch of activeList) {
    let chMax = ch.max;
    if (ch.autoMax) {
      let maxSeen = ch.min + 1e-3;
      for (const f of frames) {
        const val = ch.getValue(f);
        if (val > maxSeen) maxSeen = val;
      }
      chMax = maxSeen * 1.1;
    }
    const chSpan = Math.max(1e-3, chMax - ch.min);

    ctx.strokeStyle = ch.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const x = pad.left + ((f.t - tMin) / tSpan) * plotW;
      const norm = Math.max(0, Math.min(1, (ch.getValue(f) - ch.min) / chSpan));
      const y = pad.top + plotH - norm * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ch._lastBounds = { min: ch.min, max: chMax };
  }

  if (state.hoverIndex !== null && frames[state.hoverIndex]) {
    const f = frames[state.hoverIndex];
    const x = pad.left + ((f.t - tMin) / tSpan) * plotW;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + plotH);
    ctx.stroke();

    for (const ch of activeList) {
      const bounds = ch._lastBounds || { min: ch.min, max: ch.max };
      const chSpan = Math.max(1e-3, bounds.max - bounds.min);
      const norm = Math.max(0, Math.min(1, (ch.getValue(f) - bounds.min) / chSpan));
      const y = pad.top + plotH - norm * plotH;
      ctx.fillStyle = ch.color;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.restore();
}

function renderLapTable() {
  if (!f2Els) return;
  f2Els.lapTableBody.innerHTML = state.laps
    .map((lap) => {
      const badge = lap.isBest ? '<span class="badge-fastest">EN HIZLI</span>' : '';
      return `
        <tr class="${lap.isBest ? 'best-row' : ''}">
          <td>Tur ${lap.lapNumber}${badge}</td>
          <td><strong>${formatLapTime(lap.lapTimeSec)}</strong></td>
          <td>${lap.sectors[0].toFixed(2)}s</td>
          <td>${lap.sectors[1].toFixed(2)}s</td>
          <td>${lap.sectors[2].toFixed(2)}s</td>
          <td>${lap.maxSpeedKmh.toFixed(1)} km/s</td>
          <td>${lap.avgSpeedKmh.toFixed(1)} km/s</td>
          <td>${lap.peakTireTempC.toFixed(1)} °C</td>
        </tr>
      `;
    })
    .join('');
}

function setupLapComparisonControls() {
  if (!f2Els) return;
  const laps = state.laps;

  if (laps.length < 2) {
    f2Els.compareControls.classList.add('hidden');
    f2Els.singleNotice.classList.remove('hidden');
    f2Els.deltaGrid.innerHTML = '';
    return;
  }

  f2Els.compareControls.classList.remove('hidden');
  f2Els.singleNotice.classList.add('hidden');

  const bestLap = laps.find((l) => l.isBest) || laps[0];
  const otherLap = laps.find((l) => l.lapNumber !== bestLap.lapNumber) || laps[1];

  state.lapANumber = bestLap.lapNumber;
  state.lapBNumber = otherLap.lapNumber;

  const optionsHtml = (selectedNum) =>
    laps
      .map(
        (l) =>
          `<option value="${l.lapNumber}" ${l.lapNumber === selectedNum ? 'selected' : ''}>Tur ${l.lapNumber} (${formatLapTime(l.lapTimeSec)})${l.isBest ? ' ★' : ''}</option>`
      )
      .join('');

  f2Els.selectLapA.innerHTML = optionsHtml(state.lapANumber);
  f2Els.selectLapB.innerHTML = optionsHtml(state.lapBNumber);

  renderLapComparison();
}

function formatSigned(val, unit, decimals = 2) {
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(decimals)} ${unit}`;
}

function renderLapComparison() {
  if (!f2Els || state.laps.length < 2) return;
  const lapA = state.laps.find((l) => l.lapNumber === state.lapANumber);
  const lapB = state.laps.find((l) => l.lapNumber === state.lapBNumber);
  const cmp = compareLaps(lapA, lapB);
  if (!cmp) return;

  const timeTone = (diff) => {
    if (Math.abs(diff) < 0.005) return 'delta-neutral';
    return diff < 0 ? 'delta-faster' : 'delta-slower';
  };

  const speedTone = (diff) => {
    if (Math.abs(diff) < 0.05) return 'delta-neutral';
    return diff > 0 ? 'delta-faster' : 'delta-slower';
  };

  const cards = [
    {
      label: `Toplam Fark (Tur ${cmp.lapB} vs Tur ${cmp.lapA})`,
      val: formatSigned(cmp.totalDeltaSec, 'sn'),
      tone: timeTone(cmp.totalDeltaSec)
    },
    {
      label: 'Sektör 1 (S1) Farkı',
      val: formatSigned(cmp.sectorDeltas[0], 'sn'),
      tone: timeTone(cmp.sectorDeltas[0])
    },
    {
      label: 'Sektör 2 (S2) Farkı',
      val: formatSigned(cmp.sectorDeltas[1], 'sn'),
      tone: timeTone(cmp.sectorDeltas[1])
    },
    {
      label: 'Sektör 3 (S3) Farkı',
      val: formatSigned(cmp.sectorDeltas[2], 'sn'),
      tone: timeTone(cmp.sectorDeltas[2])
    },
    {
      label: 'Maks. Hız Farkı',
      val: formatSigned(cmp.maxSpeedDiff, 'km/s', 1),
      tone: speedTone(cmp.maxSpeedDiff)
    },
    {
      label: 'Tepe Lastik Isısı Farkı',
      val: formatSigned(cmp.peakTireTempDiff, '°C', 1),
      tone: 'delta-neutral'
    }
  ];

  f2Els.deltaGrid.innerHTML = cards
    .map(
      (c) => `
      <div class="delta-card">
        <div class="delta-label">${escapeHtml(c.label)}</div>
        <div class="delta-value ${escapeHtml(c.tone)}">${escapeHtml(c.val)}</div>
      </div>`
    )
    .join('');
}

function lerpColor(c1, c2, t) {
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function heatmapColor(metric, norm) {
  const t = Math.max(0, Math.min(1, norm));
  if (metric === 'brake') {
    // Low brake: cool slate-cyan -> mid gold -> heavy red
    const cLow = [32, 110, 155];
    const cMid = [255, 204, 68];
    const cHigh = [255, 70, 70];
    return t < 0.5 ? lerpColor(cLow, cMid, t * 2) : lerpColor(cMid, cHigh, (t - 0.5) * 2);
  }
  if (metric === 'tireTemp') {
    // Cool cyan -> green -> hot red
    const cLow = [0, 229, 255];
    const cMid = [102, 255, 136];
    const cHigh = [255, 75, 55];
    return t < 0.5 ? lerpColor(cLow, cMid, t * 2) : lerpColor(cMid, cHigh, (t - 0.5) * 2);
  }
  // Speed: slow red -> mid gold -> fast cyan
  const cLow = [255, 85, 85];
  const cMid = [255, 204, 68];
  const cHigh = [0, 229, 255];
  return t < 0.5 ? lerpColor(cLow, cMid, t * 2) : lerpColor(cMid, cHigh, (t - 0.5) * 2);
}

function renderHeatmapControls() {
  if (!f2Els) return;
  f2Els.heatmapMetrics.innerHTML = HEATMAP_METRIC_BUTTONS.map(
    (m) => `
      <button
        type="button"
        class="btn channel-btn ${state.heatmapMetric === m.id ? 'active' : ''}"
        data-heatmap-metric="${escapeHtml(m.id)}"
      >
        ${escapeHtml(m.label)}
      </button>
    `
  ).join('');

  const lapOpts = ['<option value="all">Tüm Turlar</option>'];
  for (const lap of state.laps) {
    lapOpts.push(
      `<option value="${lap.lapNumber}" ${String(state.heatmapLapFilter) === String(lap.lapNumber) ? 'selected' : ''}>Tur ${lap.lapNumber}</option>`
    );
  }
  f2Els.heatmapLapFilter.innerHTML = lapOpts.join('');
}

function updateHeatmapLegend() {
  if (!f2Els || !state.heatmapData) return;
  const hd = state.heatmapData;
  f2Els.heatmapMinLabel.textContent = `Min: ${hd.minVal.toFixed(1)} ${hd.unit}`;
  f2Els.heatmapMaxLabel.textContent = `Maks: ${hd.maxVal.toFixed(1)} ${hd.unit}`;

  if (hd.metric === 'brake') {
    f2Els.heatmapLegendRamp.style.background =
      'linear-gradient(90deg, #206e9b 0%, #ffcc44 50%, #ff4646 100%)';
  } else if (hd.metric === 'tireTemp') {
    f2Els.heatmapLegendRamp.style.background =
      'linear-gradient(90deg, #00e5ff 0%, #66ff88 50%, #ff4b37 100%)';
  } else {
    f2Els.heatmapLegendRamp.style.background =
      'linear-gradient(90deg, #ff5555 0%, #ffcc44 50%, #00e5ff 100%)';
  }
}

function updateHeatmapCursorReadout() {
  if (!f2Els) return;
  if (state.heatmapHoverIdx === null || !state.heatmapProjected[state.heatmapHoverIdx]) {
    f2Els.heatmapCursorReadout.textContent =
      'İmleci pist çizgisi üzerine getirerek nokta verilerini inceleyin.';
    return;
  }
  const p = state.heatmapProjected[state.heatmapHoverIdx].raw;
  f2Els.heatmapCursorReadout.innerHTML =
    `Tur <strong>${p.lap}</strong> &middot; t=<strong>${p.t.toFixed(2)}s</strong> &middot; ` +
    `Hız: <strong>${p.speed.toFixed(1)} km/s</strong> &middot; ` +
    `Fren: <strong>%${p.brakePct.toFixed(0)}</strong> &middot; ` +
    `Lastik: <strong>${p.tireTemp.toFixed(1)} °C</strong>`;
}

function drawHeatmap() {
  if (!f2Els) return;
  const canvas = f2Els.heatmapCanvas;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width));
  const height = Math.max(280, Math.round(rect.height));

  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#04080f';
  ctx.fillRect(0, 0, width, height);

  const hd = state.heatmapData;
  if (!hd || hd.points.length < 2) {
    state.heatmapProjected = [];
    ctx.fillStyle = '#93a8c7';
    ctx.font = '14px sans-serif';
    ctx.fillText('Pist ısı haritası için konum verisi bulunamadı.', 24, 48);
    ctx.restore();
    return;
  }

  const pad = 40;
  const spanX = Math.max(1, hd.bounds.maxX - hd.bounds.minX);
  const spanY = Math.max(1, hd.bounds.maxY - hd.bounds.minY);
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);

  const offsetX = (width - spanX * scale) / 2 - hd.bounds.minX * scale;
  const offsetY = (height - spanY * scale) / 2 + hd.bounds.maxY * scale;

  const project = (pt) => ({
    sx: pt.x * scale + offsetX,
    sy: offsetY - pt.y * scale,
    raw: pt
  });

  const projected = hd.points.map(project);
  state.heatmapProjected = projected;

  // Underlay dark track outline
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 14;
  ctx.beginPath();
  for (let i = 0; i < projected.length; i++) {
    const p = projected[i];
    if (i === 0) ctx.moveTo(p.sx, p.sy);
    else ctx.lineTo(p.sx, p.sy);
  }
  ctx.stroke();

  // Colored telemetry heat segments
  ctx.lineWidth = 6.5;
  for (let i = 1; i < projected.length; i++) {
    const prev = projected[i - 1];
    const curr = projected[i];
    if (Math.hypot(curr.sx - prev.sx, curr.sy - prev.sy) > 65) continue;
    ctx.strokeStyle = heatmapColor(hd.metric, curr.raw.norm);
    ctx.beginPath();
    ctx.moveTo(prev.sx, prev.sy);
    ctx.lineTo(curr.sx, curr.sy);
    ctx.stroke();
  }

  // Start / Finish marker
  const startPt = projected[0];
  ctx.fillStyle = '#ffcc44';
  ctx.beginPath();
  ctx.arc(startPt.sx, startPt.sy, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#050a12';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#ffcc44';
  ctx.font = 'bold 11px Consolas, monospace';
  ctx.fillText('START / BİTİŞ', startPt.sx + 10, startPt.sy - 8);

  // Hover point highlight
  if (state.heatmapHoverIdx !== null && projected[state.heatmapHoverIdx]) {
    const hp = projected[state.heatmapHoverIdx];
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hp.sx, hp.sy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  ctx.restore();
}

function refreshHeatmap() {
  state.heatmapData = buildTrackHeatmapData(
    state.frames,
    state.heatmapMetric,
    state.heatmapLapFilter
  );
  renderHeatmapControls();
  updateHeatmapLegend();
  updateHeatmapCursorReadout();
  drawHeatmap();
}

function loadCsvText(csvText, sourceLabel) {
  const parsed = parseTelemetryCsv(csvText);
  if (!parsed.ok) {
    showError(parsed.error);
    els.headerStatus.textContent = 'Geçersiz CSV Hatası';
    return false;
  }

  clearError();
  state.frames = parsed.frames;
  state.metadata = parsed.metadata;
  state.format = parsed.format;
  state.sourceName = sourceLabel;
  state.hoverIndex = null;
  state.heatmapHoverIdx = null;
  state.heatmapLapFilter = 'all';

  const stats = computeTelemetryStats(parsed.frames);
  state.laps = extractLaps(parsed.frames);
  els.headerStatus.textContent = `${parsed.metadata.venue} · ${parsed.frames.length} Örnek`;

  renderMetadata();
  renderKpis(stats);
  renderChannelToggles();
  updateCursorReadout(null);
  drawChart();

  renderLapTable();
  setupLapComparisonControls();
  refreshHeatmap();
  return true;
}

async function fetchAndLoadSample(url, buttonEl, label) {
  try {
    els.headerStatus.textContent = 'Örnek Yükleniyor...';
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text();
    const ok = loadCsvText(text, label);
    if (ok) {
      els.btnSampleTech.classList.toggle('active', buttonEl === els.btnSampleTech);
      els.btnSampleCity.classList.toggle('active', buttonEl === els.btnSampleCity);
    }
  } catch (err) {
    showError(`Örnek dosya yüklenemedi: ${err.message}`);
  }
}

function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    els.btnSampleTech.classList.remove('active');
    els.btnSampleCity.classList.remove('active');
    loadCsvText(String(reader.result || ''), file.name);
  };
  reader.onerror = () => {
    showError('Seçilen dosya okunamadı.');
  };
  reader.readAsText(file);
}

function bindEvents() {
  els.btnSampleTech.addEventListener('click', () => {
    fetchAndLoadSample('/samples/teknik_pist_3tur.csv', els.btnSampleTech, 'Teknik Pist (3 Tur)');
  });

  els.btnSampleCity.addEventListener('click', () => {
    fetchAndLoadSample('/samples/sehir_devresi_1tur.csv', els.btnSampleCity, 'Şehir Devresi (1 Tur)');
  });

  els.fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    handleFile(file);
    e.target.value = '';
  });

  els.dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    els.dropzone.classList.add('drag-over');
  });

  els.dropzone.addEventListener('dragleave', () => {
    els.dropzone.classList.remove('drag-over');
  });

  els.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    els.dropzone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    handleFile(file);
  });

  els.channelToggles.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-channel-id]');
    if (!btn) return;
    const id = btn.dataset.channelId;
    if (state.activeChannels.has(id)) {
      if (state.activeChannels.size > 1) {
        state.activeChannels.delete(id);
      }
    } else {
      state.activeChannels.add(id);
    }
    renderChannelToggles();
    drawChart();
  });

  els.chartCanvas.addEventListener('mousemove', (e) => {
    if (state.frames.length < 2) return;
    const rect = els.chartCanvas.getBoundingClientRect();
    const padLeft = 52;
    const padRight = 20;
    const plotW = Math.max(1, rect.width - padLeft - padRight);
    const relX = e.clientX - rect.left - padLeft;
    const ratio = Math.max(0, Math.min(1, relX / plotW));

    const tMin = state.frames[0].t;
    const tMax = state.frames[state.frames.length - 1].t;
    const targetT = tMin + ratio * (tMax - tMin);

    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < state.frames.length; i++) {
      const diff = Math.abs(state.frames[i].t - targetT);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    state.hoverIndex = bestIdx;
    updateCursorReadout(state.frames[bestIdx]);
    drawChart();
  });

  els.chartCanvas.addEventListener('mouseleave', () => {
    state.hoverIndex = null;
    updateCursorReadout(null);
    drawChart();
  });

  window.addEventListener('resize', () => {
    drawChart();
    drawHeatmap();
  });
}

mountFeature2Dom();
bindEvents();
fetchAndLoadSample('/samples/teknik_pist_3tur.csv', els.btnSampleTech, 'Teknik Pist (3 Tur)');
