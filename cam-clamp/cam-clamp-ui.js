import { calculateClamp, validateClamp, clampWarnings, formatInches } from './cam-clamp-math.js';
import {
  renderAssembly, renderFixedJaw, renderSlidingJaw, renderLever
} from './cam-clamp-diagrams.js';

// input id → param name
const FIELDS = {
  'bar-thickness': 'barThickness',
  'bar-width': 'barWidth',
  'bar-length': 'barLength',
  'jaw-reach': 'jawReach'
};
const IDS = Object.keys(FIELDS);

// Short keys for URL params (keeps URLs compact)
const URL_KEYS = {
  'bar-thickness': 't', 'bar-width': 'w', 'bar-length': 'l', 'jaw-reach': 'r'
};
const URL_KEYS_REV = Object.fromEntries(
  Object.entries(URL_KEYS).map(([k, v]) => [v, k])
);

function readInputs() {
  const p = {};
  for (const [id, key] of Object.entries(FIELDS)) {
    p[key] = parseFloat(document.getElementById(id).value) || 0;
  }
  return p;
}

// --- Validation UI ---

function clearAllErrors() {
  for (const id of IDS) {
    document.getElementById(id).closest('.form-group').classList.remove('has-error');
    document.getElementById(`error-${id}`).textContent = '';
  }
}

function setError(inputId, message) {
  document.getElementById(inputId).closest('.form-group').classList.add('has-error');
  document.getElementById(`error-${inputId}`).textContent = message;
}

function validate(p) {
  clearAllErrors();
  const errors = validateClamp(p);
  for (const [id, key] of Object.entries(FIELDS)) {
    if (errors[key]) setError(id, errors[key]);
  }
  return Object.keys(errors).length === 0;
}

function updateImperialDisplays() {
  for (const id of IDS) {
    const val = parseFloat(document.getElementById(id).value);
    const span = document.querySelector(`.imperial[data-for="${id}"]`);
    span.textContent = isNaN(val) ? '' : formatInches(val);
  }
}

// --- URL deep linking ---

function loadFromURL() {
  const params = new URLSearchParams(window.location.search);
  for (const [shortKey, inputId] of Object.entries(URL_KEYS_REV)) {
    const val = params.get(shortKey);
    if (val === null) continue;
    const numVal = parseFloat(val);
    if (!isNaN(numVal)) document.getElementById(inputId).value = numVal;
  }
}

function buildQueryString() {
  return '?' + IDS.map(id => `${URL_KEYS[id]}=${document.getElementById(id).value}`).join('&');
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

function heading(text) {
  const h = document.createElement('h3');
  h.className = 'section-heading';
  h.textContent = text;
  return h;
}

function definitionList(items) {
  const dl = document.createElement('dl');
  dl.className = 'derived-values';
  for (const [label, value] of items) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
  return dl;
}

function renderCutList(d) {
  const container = document.getElementById('cut-list-content');
  container.innerHTML = '';
  const f = formatInches;

  container.appendChild(heading('Cut List'));
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.appendChild(row(['Part', 'Qty', 'Length', 'Width', 'Thick'], true));
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  const rows = [
    ['Fixed jaw', '1', f(d.jawLength), f(d.fixedHeight), f(d.jawThickness)],
    ['Sliding jaw', '1', f(d.jawLength), f(d.slidingHeight), f(d.jawThickness)],
    ['Cam lever', '1', f(d.leverLength), f(d.leverWidth), f(d.leverThickness)],
    ['Bar (aluminum)', '1', f(d.barLength), f(d.barWidth), f(d.barThickness)],
    ['Cork pads', '2', f(d.padLength), f(d.jawThickness), f(d.padThickness)],
    ['Roll pins', '5', f(d.pinLength), `${f(d.pinDiameter)} dia`, '']
  ];
  for (const r of rows) tbody.appendChild(row(r));
  table.appendChild(tbody);
  container.appendChild(table);

  container.appendChild(heading('Fixed Jaw'));
  container.appendChild(definitionList([
    ['Bar mortise', `${f(d.fixedMortiseLength)} × ${f(d.mortiseWidth)}, ${f(d.fixedMortiseStart)} from end`],
    ['Notch', `${f(d.notchLength)} long × ${f(d.notchDepth)} deep`],
    ['Pin 1', `${f(d.fixedPins[0].x)} in, ${f(d.fixedPins[0].y)} from top`],
    ['Pin 2', `${f(d.fixedPins[1].x)} in, ${f(d.fixedHeight - d.fixedPins[1].y)} from bottom`]
  ]));

  container.appendChild(heading('Sliding Jaw'));
  container.appendChild(definitionList([
    ['Bar mortise', `${f(d.slidingMortiseLength)} × ${f(d.mortiseWidth)}, ${f(d.slidingMortiseStart)} from end`],
    ['Tongue', `${f(d.tongueThickness)} thick × ${f(d.tongueLength)}`],
    ['Kerf', `${f(d.kerf)}, from ${f(d.reliefDiameter)} relief hole ${f(d.reliefX)} from end`],
    ['Lever slot', `${f(d.leverSlotLength)} × ${f(d.leverSlotWidth)}, open at bottom`],
    ['Pivot', `${f(d.pivotFromTip)} from tip, ${f(d.pivotBelowKerf)} below kerf`],
    ['Pin 1', `${f(d.slidingPins[0].x)} in, ${f(d.slidingPins[0].y)} from top`],
    ['Pin 2', `${f(d.slidingPins[1].x)} in, ${f(d.slidingHeight - d.slidingPins[1].y)} from bottom`]
  ]));

  container.appendChild(heading('Cam Lever'));
  container.appendChild(definitionList([
    ['Head', `R ${f(d.headRadius)}`],
    ['Handle end', `R ${f(d.tailRadius)}, ${f(d.centerDistance)} center to center`],
    ['Pivot hole', `${f(d.pinDiameter)} dia, ${f(-d.leverPivot.x)} behind and ${f(-d.leverPivot.y)} above the head center`],
    ['Cam rise', `${f(d.camRise)}; clamped at ${d.camSwing}° (dead center ${Math.round(d.deadCenter)}°) it flexes the tongue ${f(d.tongueFlex)}`],
    ['At rest', `handle hangs ${f(d.handleDrop)} below the jaw, head ${f(d.noseOverhang)} past the tip`]
  ]));

  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = 'Layout measured from the back (bar) end of each jaw. ' +
    'Sliding-jaw pins straddle the bar; they bite when the jaw racks.';
  container.appendChild(note);

  container.appendChild(heading('Performance'));
  container.appendChild(definitionList([
    ['Reach', f(d.jawReach)],
    ['Max opening', f(d.capacity)],
    ['Rack angle to lock', `${d.lockAngleDeg.toFixed(1)}°`],
    ['Clamping force', `≈ ${Math.round(d.clampForce / 5) * 5} lb (hardwood tongue, before the cork compresses)`]
  ]));
}

function renderWarnings(list) {
  const ul = document.getElementById('warnings');
  ul.innerHTML = '';
  for (const w of list) {
    const li = document.createElement('li');
    li.textContent = w;
    ul.appendChild(li);
  }
}

function renderDiagrams(d) {
  const targets = [
    ['diagram-assembly', renderAssembly],
    ['diagram-fixed', renderFixedJaw],
    ['diagram-sliding', renderSlidingJaw],
    ['diagram-lever', renderLever]
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
  if (!validate(params)) {
    renderWarnings([]);
    return;
  }

  const d = calculateClamp(params);
  renderCutList(d);
  renderWarnings(clampWarnings(d));
  renderDiagrams(d);

  if (updateURL) pushURL();
}

// --- Wire up inputs ---

for (const id of IDS) {
  document.getElementById(id).addEventListener('input', () => update());
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
