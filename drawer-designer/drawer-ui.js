import { calculateDrawer, formatInches } from './drawer-math.js';
import { renderFrontView, renderSideView, renderTopView, renderIsometric } from './drawer-diagrams.js';

const NUMBER_IDS = [
  'depth', 'width', 'height',
  'front-thickness', 'side-thickness',
  'bottom-thickness', 'groove-depth', 'groove-from-bottom'
];
const ALL_IDS = [...NUMBER_IDS, 'half-blind-front'];

// Short keys for URL params (keeps URLs compact)
const URL_KEYS = {
  'depth': 'd', 'width': 'w', 'height': 'h',
  'front-thickness': 'ft', 'side-thickness': 'st',
  'bottom-thickness': 'bt', 'groove-depth': 'gd', 'groove-from-bottom': 'gb',
  'half-blind-front': 'hb'
};
const URL_KEYS_REV = Object.fromEntries(
  Object.entries(URL_KEYS).map(([k, v]) => [v, k])
);

function readInputs() {
  const num = (id) => parseFloat(document.getElementById(id).value) || 0;
  return {
    depth: num('depth'),
    width: num('width'),
    height: num('height'),
    frontThickness: num('front-thickness'),
    sideThickness: num('side-thickness'),
    bottomThickness: num('bottom-thickness'),
    grooveDepth: num('groove-depth'),
    grooveFromBottom: num('groove-from-bottom'),
    halfBlindFront: document.getElementById('half-blind-front').checked
  };
}

// --- Validation UI ---

function clearAllErrors() {
  for (const id of NUMBER_IDS) {
    const group = document.getElementById(id).closest('.form-group');
    group.classList.remove('has-error');
    const errorSpan = document.getElementById(`error-${id}`);
    if (errorSpan) errorSpan.textContent = '';
  }
}

function setError(inputId, message) {
  const group = document.getElementById(inputId).closest('.form-group');
  group.classList.add('has-error');
  const errorSpan = document.getElementById(`error-${inputId}`);
  if (errorSpan) errorSpan.textContent = message;
}

/**
 * Validate inputs and set error UI. Returns true if all valid.
 */
function validate(p) {
  clearAllErrors();
  let valid = true;

  const positives = [
    ['depth', p.depth], ['width', p.width], ['height', p.height],
    ['front-thickness', p.frontThickness], ['side-thickness', p.sideThickness],
    ['bottom-thickness', p.bottomThickness], ['groove-depth', p.grooveDepth]
  ];
  for (const [id, v] of positives) {
    if (v <= 0) {
      setError(id, 'Must be positive');
      valid = false;
    }
  }

  // Walls must leave a positive interior.
  if (p.width > 0 && p.sideThickness > 0 && p.width <= 2 * p.sideThickness) {
    setError('width', 'Too narrow for two side walls');
    valid = false;
  }
  if (p.depth > 0 && p.frontThickness > 0 && p.sideThickness > 0 &&
      p.depth <= p.frontThickness + p.sideThickness) {
    setError('depth', 'Too shallow for front + back walls');
    valid = false;
  }

  // The groove must fit within the wall height.
  if (p.height > 0 && p.grooveFromBottom + p.bottomThickness >= p.height) {
    setError('groove-from-bottom', 'Groove sits above the drawer height');
    valid = false;
  }

  // Groove can't be deeper than the thinnest wall it cuts into.
  if (p.grooveDepth > 0 && p.sideThickness > 0 && p.grooveDepth >= p.sideThickness) {
    setError('groove-depth', 'Deeper than the side thickness');
    valid = false;
  }

  return valid;
}

function updateImperialDisplays() {
  for (const id of NUMBER_IDS) {
    const input = document.getElementById(id);
    const span = document.querySelector(`.imperial[data-for="${id}"]`);
    if (span) {
      const val = parseFloat(input.value);
      span.textContent = isNaN(val) ? '' : formatInches(val);
    }
  }
}

// --- URL deep linking ---

function loadFromURL() {
  const params = new URLSearchParams(window.location.search);
  for (const [shortKey, inputId] of Object.entries(URL_KEYS_REV)) {
    const val = params.get(shortKey);
    if (val === null) continue;
    if (inputId === 'half-blind-front') {
      document.getElementById(inputId).checked = val === '1' || val === 'true';
    } else {
      const numVal = parseFloat(val);
      if (!isNaN(numVal)) document.getElementById(inputId).value = numVal;
    }
  }
}

function buildQueryString() {
  const parts = [];
  for (const id of ALL_IDS) {
    const el = document.getElementById(id);
    const val = id === 'half-blind-front' ? (el.checked ? '1' : '0') : el.value;
    parts.push(`${URL_KEYS[id]}=${val}`);
  }
  return '?' + parts.join('&');
}

let pushTimer = null;

function pushURL() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const qs = buildQueryString();
    if (qs !== window.location.search) {
      history.pushState(null, '', qs);
    }
  }, 300);
}

function onPopState() {
  loadFromURL();
  update(false);
}

// --- Rendering ---

function row(cells, header = false) {
  const tr = document.createElement('tr');
  for (const c of cells) {
    const cell = document.createElement(header ? 'th' : 'td');
    cell.textContent = c;
    tr.appendChild(cell);
  }
  return tr;
}

function renderCutList(d) {
  const container = document.getElementById('cut-list-content');
  container.innerHTML = '';

  const frontJoint = d.halfBlindFront ? 'Half-blind DT' : 'Through DT';

  // --- Cut list ---
  const cutHeading = document.createElement('h3');
  cutHeading.className = 'section-heading';
  cutHeading.textContent = 'Cut List';
  container.appendChild(cutHeading);

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.appendChild(row(['Part', 'Qty', 'Length', 'Width', 'Thick', 'Joinery'], true));
  table.appendChild(thead);
  const tbody = document.createElement('tbody');

  const f = formatInches;
  const rows = [
    ['Front', '1', f(d.frontLength), f(d.pieceHeight), f(d.frontThickness), frontJoint],
    ['Back', '1', f(d.backLength), f(d.backHeight), f(d.backThickness), 'Through DT'],
    ['Sides', '2', f(d.sideLength), f(d.pieceHeight), f(d.sideThickness), 'Through DT'],
    ['Bottom', '1', f(d.bottomDepth), f(d.bottomWidth), f(d.bottomThickness), 'In groove']
  ];
  for (const r of rows) {
    tbody.appendChild(row(r));
  }
  table.appendChild(tbody);
  container.appendChild(table);

  // --- Joinery & groove ---
  const jHeading = document.createElement('h3');
  jHeading.className = 'section-heading';
  jHeading.textContent = 'Joinery & Groove';
  container.appendChild(jHeading);

  const dl = document.createElement('dl');
  dl.className = 'derived-values';

  const items = [
    ['Front joint', d.halfBlindFront ? 'Half-blind dovetails' : 'Through dovetails'],
    ['Tails per corner', String(d.tailCount)]
  ];
  if (d.halfBlindFront) {
    items.push(['Front lap', formatInches(d.frontLap)]);
    items.push(['Tail socket depth', formatInches(d.frontSocketDepth)]);
  }
  items.push(['Groove width', formatInches(d.grooveWidth)]);
  items.push(['Groove depth', formatInches(d.grooveDepth)]);
  items.push(['Groove off bottom', formatInches(d.grooveFromBottom)]);
  items.push(['Interior W × D', `${formatInches(d.innerWidth)} × ${formatInches(d.innerDepth)}`]);

  for (const [label, value] of items) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
  container.appendChild(dl);
}

function renderDiagrams(d) {
  const targets = [
    ['diagram-front', renderFrontView],
    ['diagram-side', renderSideView],
    ['diagram-top', renderTopView],
    ['diagram-iso', renderIsometric]
  ];
  for (const [id, renderFn] of targets) {
    const container = document.getElementById(id);
    container.innerHTML = '';
    container.appendChild(renderFn(document, d, formatInches));
  }
}

function update(updateURL = true) {
  updateImperialDisplays();

  const params = readInputs();
  if (!validate(params)) return;

  const d = calculateDrawer(params);
  renderCutList(d);
  renderDiagrams(d);

  if (updateURL) pushURL();
}

// --- Wire up inputs ---

for (const id of ALL_IDS) {
  const el = document.getElementById(id);
  const evt = el.type === 'checkbox' ? 'change' : 'input';
  el.addEventListener(evt, () => update());
}

// Stepper buttons (use native stepUp/stepDown)
function activateStepper(btn) {
  const input = document.getElementById(btn.dataset.for);
  if (btn.dataset.dir === 'up') {
    input.stepUp();
  } else {
    input.stepDown();
  }
  input.dispatchEvent(new Event('input'));
}

for (const btn of document.querySelectorAll('.stepper')) {
  btn.addEventListener('click', () => activateStepper(btn));
  btn.addEventListener('touchend', (e) => {
    e.preventDefault();
    activateStepper(btn);
  });
}

window.addEventListener('popstate', onPopState);

// Load from URL on startup, then render
loadFromURL();
update(false);

if (!window.location.search) {
  history.replaceState(null, '', buildQueryString());
}
