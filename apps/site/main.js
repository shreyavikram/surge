// Draws the two maps, wires the coverage tabs and the severity dial.
// Map geometry and the values colouring it come from assets/maps.js, generated out of
// the terminal's own geodata and cited sources by tools/build-graphics.mjs.

import { world, districts } from './assets/maps.js';

const $ = (sel) => document.querySelector(sel);

/** Six-step ramp. Breaks are share thresholds, chosen so the top class is a real outlier. */
const RAMP = ['g0', 'g1', 'g2', 'g3', 'g4', 'g5'];

function classFor(share, breaks) {
  for (let i = breaks.length - 1; i >= 0; i--) if (share >= breaks[i]) return RAMP[i + 1];
  return RAMP[0];
}

function svg(width, height) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', `0 0 ${width} ${height}`);
  el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return el;
}

function pathEl(d, className) {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  p.setAttribute('class', className);
  return p;
}

function legend(node, labels) {
  node.innerHTML = '';
  const low = document.createElement('span');
  low.className = 'legend-text';
  low.textContent = labels[0];
  const scale = document.createElement('span');
  scale.className = 'legend-scale';
  for (const c of RAMP) {
    const i = document.createElement('i');
    i.className = `geo ${c}`;
    scale.appendChild(i);
  }
  const high = document.createElement('span');
  high.className = 'legend-text';
  high.textContent = labels[1];
  node.append(low, scale, high);
}

const pct = (share) => {
  if (share <= 0) return null;
  if (share >= 0.01) return `${(share * 100).toFixed(1)}%`;
  if (share >= 0.001) return `${(share * 100).toFixed(2)}%`;
  return '<0.1%';
};

/** Hover and keyboard focus both drive the readout; touch gets the tap. */
function bindReadout(el, readout, describe, resting) {
  const show = () => {
    readout.innerHTML = describe();
    el.classList.add('on');
  };
  const clear = () => {
    readout.textContent = resting;
    el.classList.remove('on');
  };
  el.addEventListener('pointerenter', show);
  el.addEventListener('pointerleave', clear);
  el.addEventListener('focus', show);
  el.addEventListener('blur', clear);
}

// ────────────────────────────────────────────────────────── world map

function drawWorld() {
  const host = $('#world-map');
  const readout = $('#world-readout');
  if (!host) return;

  // Import share is extremely skewed (Canada 29%, a long tail under 0.1%), so the
  // breaks are spaced by order of magnitude rather than evenly.
  const breaks = [0.0002, 0.002, 0.01, 0.04, 0.12];
  const resting = 'Hover a country';
  const el = svg(world.width, world.height);

  for (const c of world.countries) {
    const p = pathEl(c.d, `geo ${classFor(c.share, breaks)}${c.share > 0 ? ' hot' : ''}`);
    if (c.share > 0) {
      p.setAttribute('tabindex', '0');
      p.setAttribute('role', 'listitem');
      p.setAttribute('aria-label', `${c.name}, ${pct(c.share)} of US food imports`);
      bindReadout(p, readout, () => `${c.name} <b>${pct(c.share)}</b>`, resting);
    } else {
      bindReadout(p, readout, () => `${c.name} <span class="zero">no tracked food imports</span>`, resting);
    }
    el.appendChild(p);
  }

  host.appendChild(el);
  legend($('#world-legend'), ['None', 'Largest origin']);
  listTopOrigins();
}

/** The map shows the shape of the dependence; this puts numbers on the top of it. */
function listTopOrigins(count = 8) {
  const host = $('#top-origins');
  if (!host) return;
  const top = world.countries.filter((c) => c.share > 0).slice(0, count);
  const peak = top[0]?.share || 1;

  for (const [i, c] of top.entries()) {
    const li = document.createElement('li');
    li.innerHTML =
      `<span class="rank">${String(i + 1).padStart(2, '0')}</span>` +
      `<span class="name">${c.name}</span>` +
      `<span class="share">${pct(c.share)}</span>` +
      `<span class="bar"><i style="width:${((c.share / peak) * 100).toFixed(1)}%"></i></span>`;
    host.appendChild(li);
  }
}

// ─────────────────────────────────────────────────────── district map

function drawDistricts() {
  const host = $('#district-map');
  const chipHost = $('#district-chips');
  const readout = $('#district-readout');
  if (!host) return;

  const resting = 'Hover a district';
  const el = svg(districts.width, districts.height);
  const shapes = new Map();

  for (const d of districts.districts) {
    const p = pathEl(d.d, 'geo g0');
    p.setAttribute('tabindex', '0');
    p.setAttribute('role', 'listitem');
    shapes.set(d.id, { el: p, name: d.name });
    el.appendChild(p);
  }
  host.appendChild(el);

  let current = districts.order[0];

  function paint(key) {
    current = key;
    const series = districts.production[key];
    // Shares are stored in parts per 100,000; breaks track the top of the distribution
    // so the handful of districts that grow most of a crop stay visible.
    const breaks = [1, 50, 200, 800, 2500];
    for (const [id, shape] of shapes) {
      const raw = series.shares[id] || 0;
      shape.el.setAttribute('class', `geo ${classFor(raw, breaks)} hot`);
      shape.el.setAttribute('aria-label', `${shape.name}, ${pct(raw / 1e5) || 'no recorded production'} of national ${series.label.toLowerCase()} production`);
      shape.describe = () => {
        const share = pct(raw / 1e5);
        return share
          ? `<b>${id}</b> ${share} of U.S. ${series.label.toLowerCase()}`
          : `<b>${id}</b> <span class="zero">no recorded production</span>`;
      };
    }
    for (const b of chipHost.children) b.setAttribute('aria-selected', String(b.dataset.key === key));
    legend($('#district-legend'), ['None', `Most ${series.label.toLowerCase()}`]);
  }

  for (const [id, shape] of shapes) {
    bindReadout(shape.el, readout, () => shape.describe(), resting);
  }

  for (const key of districts.order) {
    const series = districts.production[key];
    if (!series) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.dataset.key = key;
    b.textContent = series.label;
    b.addEventListener('click', () => paint(key));
    chipHost.appendChild(b);
  }

  paint(current);
}

// ─────────────────────────────────────────────────────── coverage tabs

function wireTabs() {
  const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
  if (!tabs.length) return;

  const select = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
  };

  tabs.forEach((tab, i) => {
    tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = tabs[(i + step + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  });
}

// ──────────────────────────────────────────────────────── odds and ends

function wireSeverity() {
  const input = $('#sev');
  const out = $('#sev-out');
  if (!input || !out) return;
  input.addEventListener('input', () => { out.textContent = `${input.value}%`; });
}

function wireNav() {
  const nav = $('#nav');
  if (!nav) return;
  const onScroll = () => nav.classList.toggle('stuck', window.scrollY > 8);
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });
}

drawWorld();
drawDistricts();
wireTabs();
wireSeverity();
wireNav();
