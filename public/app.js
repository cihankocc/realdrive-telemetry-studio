import { parseTelemetryCsv } from '/src/telemetryParser.js';
import { computeTelemetryStats, formatLapTime } from '/src/telemetryStats.js';

const CHANNELS = [
  {
    id: 'speed',
    label: 'Hız (km/s)',
    color: '#00e5ff',
    min: 0,
    max: 160,
    autoMax: true,
    getValue: (f) => f.speed,
    format: (v) => `${v.toFixed(1)} km/s`
  },
  {
    id: 'throttle',
    label: 'Gaz (%)',
    color: '#66ff88',
    min: 0,
    max: 100,
    autoMax: false,
    getValue: (f) => f.throttle * 100,
    format: (v) => `%${v.toFixed(0)}`
  },
  {
    id: 'brake',
    label: 'Fren (%)',
    color: '#ff5555',
    min: 0,
    max: 100,
    autoMax: false,
    getValue: (f) => f.brake * 100,
    format: (v) => `%${v.toFixed(0)}`
  },
  {
    id: 'rpm',
    label: 'RPM',
    color: '#ffcc44',
    min: 0,
    max: 9000,
    autoMax: true,
    getValue: (f) => f.rpm,
    format: (v) => `${Math.round(v)} rpm`
  },
  {
    id: 'tireTemp',
    label: 'Lastik Isısı (°C)',
    color: '#ff6e40',
    min: 30,
    max: 130,
    autoMax: true,
    getValue: (f) => f.avgTireTemp,
    format: (v) => `${v.toFixed(1)} °C`
  },
  {
    id: 'gLat',
    label: 'Yanal G (|G|)',
    color: '#bb86fc',
    min: 0,
    max: 2.5,
    autoMax: true,
    getValue: (f) => Math.abs(f.gLat),
    format: (v) => `${v.toFixed(2)} G`
  }
];

const state = {
  frames: [],
  metadata: {},
  format: '',
  sourceName: '',
  activeChannels: new Set(['speed', 'throttle', 'brake']),
  hoverIndex: null
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
  cursorReadout: document.getElementById('chart-cursor-readout')
};

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
    ctx.fillStyle = '#93a8c7';
    ctx.font = '14px sans-serif';
    ctx.fillText('Grafik çizmek için geçerli telemetri verisi yükleyin.', 24, 48);
    ctx.restore();
    return;
  }

  const pad = { top: 26, right: 20, bottom: 32, left: 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  // Background grid
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

  // Vertical time markers + lap boundaries
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

  // Lap separator dashed lines
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
    ctx.fillStyle = '#93a8c7';
    ctx.font = '13px sans-serif';
    ctx.fillText('En az bir kanal seçin.', pad.left + 12, pad.top + 28);
    ctx.restore();
    return;
  }

  // Left axis scale for primary active channel
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

  // Draw channel series
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

  // Hover crosshair
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

  const stats = computeTelemetryStats(parsed.frames);
  els.headerStatus.textContent = `${parsed.metadata.venue} · ${parsed.frames.length} Örnek`;

  renderMetadata();
  renderKpis(stats);
  renderChannelToggles();
  updateCursorReadout(null);
  drawChart();
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
  });
}

bindEvents();
fetchAndLoadSample('/samples/teknik_pist_3tur.csv', els.btnSampleTech, 'Teknik Pist (3 Tur)');
