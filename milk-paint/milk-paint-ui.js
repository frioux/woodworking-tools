import { scalePaint, scaleQuark, formatNumber } from './milk-paint-math.js';

const PAINT_INPUT = 'paint-amount';
const QUARK_INPUT = 'quark-amount';

const URL_KEYS = {
  paintScaleBy: 'pb',  // 'quark' | 'pigment'
  paintAmount: 'pa',
  quarkOpen: 'qo',     // '1' if quark section open
  quarkScaleBy: 'qb',  // 'quark' | 'milk'
  quarkAmount: 'qa'
};

// --- DOM helpers ---

function getPaintScaleBy() {
  const checked = document.querySelector('input[name="paint-scale-by"]:checked');
  return checked ? checked.value : 'quark';
}

function getQuarkScaleBy() {
  const checked = document.querySelector('input[name="quark-scale-by"]:checked');
  return checked ? checked.value : 'quark';
}

function setError(inputId, message) {
  const group = document.getElementById(inputId).closest('.form-group');
  const errorSpan = document.getElementById(`error-${inputId}`);
  if (message) {
    group.classList.add('has-error');
    if (errorSpan) errorSpan.textContent = message;
  } else {
    group.classList.remove('has-error');
    if (errorSpan) errorSpan.textContent = '';
  }
}

// --- Paint section ---

function updatePaintLabels() {
  const scaleBy = getPaintScaleBy();
  const label = document.getElementById('paint-amount-label');
  const input = document.getElementById(PAINT_INPUT);

  label.textContent = scaleBy === 'quark' ? 'Quark' : 'Pigment';

  // On user-initiated mode change, swap to a sensible default for the new mode
  if (input.dataset.lastMode && input.dataset.lastMode !== scaleBy) {
    input.value = scaleBy === 'quark' ? 8 : 1;
  }
  input.dataset.lastMode = scaleBy;
}

function renderPaintRecipe() {
  const scaleBy = getPaintScaleBy();
  const value = parseFloat(document.getElementById(PAINT_INPUT).value);
  const tbody = document.querySelector('#paint-recipe tbody');
  const note = document.getElementById('batch-note');

  if (!isFinite(value) || value <= 0) {
    setError(PAINT_INPUT, 'Enter a positive amount');
    tbody.innerHTML = '';
    note.textContent = '';
    return;
  }
  setError(PAINT_INPUT, '');

  const r = scalePaint({ scaleBy, value });

  const rows = [
    ['Quark (fat-free)', r.quarkOz, 'oz', r.quarkG, 'g'],
    ['Water', r.waterOz, 'fl oz', r.waterMl, 'ml'],
    ['Hydrated lime', r.limeOz, 'oz', r.limeG, 'g'],
    ['Pigment', r.pigmentOz, 'oz', r.pigmentG, 'g']
  ];

  tbody.innerHTML = rows.map(([name, c, cu, m, mu]) => `
    <tr>
      <td>${name}</td>
      <td>${formatNumber(c)} ${cu}</td>
      <td>${formatNumber(m)} ${mu}</td>
    </tr>
  `).join('');

  const pct = formatNumber(r.factor * 100, 0);
  note.textContent = `Batch size: ${pct}% of base recipe (8 oz quark + 1 oz pigment).`;
}

// --- Quark section ---

function updateQuarkLabels() {
  const scaleBy = getQuarkScaleBy();
  const label = document.getElementById('quark-amount-label');
  const unit = document.getElementById('quark-amount-unit');
  const input = document.getElementById(QUARK_INPUT);

  label.textContent = scaleBy === 'quark' ? 'Quark' : 'Skim milk';
  unit.textContent = scaleBy === 'quark' ? '(oz)' : '(qt)';

  if (input.dataset.lastMode && input.dataset.lastMode !== scaleBy) {
    input.value = scaleBy === 'quark' ? 8 : 2;
  }
  input.dataset.lastMode = scaleBy;
}

function renderQuarkRecipe() {
  const scaleBy = getQuarkScaleBy();
  const value = parseFloat(document.getElementById(QUARK_INPUT).value);
  const tbody = document.querySelector('#quark-recipe tbody');

  if (!isFinite(value) || value <= 0) {
    setError(QUARK_INPUT, 'Enter a positive amount');
    tbody.innerHTML = '';
    return;
  }
  setError(QUARK_INPUT, '');

  const r = scaleQuark({ scaleBy, value });
  const vinegarTbsp = r.vinegarCup * 16;

  const rows = [
    ['Skim milk', `${formatNumber(r.milkQt)} qt`, `${formatNumber(r.milkQt * 4)} cups`],
    ['Vinegar', `${formatNumber(r.vinegarCup)} cups`, `${formatNumber(vinegarTbsp)} tbsp`],
    ['Yields', `${formatNumber(r.quarkOz)} oz quark`, '']
  ];

  tbody.innerHTML = rows.map(([name, primary, secondary]) => `
    <tr>
      <td>${name}</td>
      <td>${primary}${secondary ? ` <span class="alt-unit">(${secondary})</span>` : ''}</td>
    </tr>
  `).join('');
}

// --- URL deep linking ---

function loadFromURL() {
  const params = new URLSearchParams(window.location.search);

  const pb = params.get(URL_KEYS.paintScaleBy);
  if (pb === 'quark' || pb === 'pigment') {
    const radio = document.querySelector(`input[name="paint-scale-by"][value="${pb}"]`);
    if (radio) radio.checked = true;
  }
  const pa = params.get(URL_KEYS.paintAmount);
  if (pa !== null && !isNaN(parseFloat(pa))) {
    document.getElementById(PAINT_INPUT).value = pa;
  }

  const qo = params.get(URL_KEYS.quarkOpen);
  if (qo === '1') {
    document.getElementById('quark-section').open = true;
  }
  const qb = params.get(URL_KEYS.quarkScaleBy);
  if (qb === 'quark' || qb === 'milk') {
    const radio = document.querySelector(`input[name="quark-scale-by"][value="${qb}"]`);
    if (radio) radio.checked = true;
    document.getElementById(QUARK_INPUT).dataset.lastMode = qb;
  }
  const qa = params.get(URL_KEYS.quarkAmount);
  if (qa !== null && !isNaN(parseFloat(qa))) {
    document.getElementById(QUARK_INPUT).value = qa;
  }
}

function buildQueryString() {
  const parts = [
    `${URL_KEYS.paintScaleBy}=${getPaintScaleBy()}`,
    `${URL_KEYS.paintAmount}=${document.getElementById(PAINT_INPUT).value}`
  ];
  if (document.getElementById('quark-section').open) {
    parts.push(`${URL_KEYS.quarkOpen}=1`);
    parts.push(`${URL_KEYS.quarkScaleBy}=${getQuarkScaleBy()}`);
    parts.push(`${URL_KEYS.quarkAmount}=${document.getElementById(QUARK_INPUT).value}`);
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

// --- Update orchestration ---

function update(updateURL = true) {
  renderPaintRecipe();
  renderQuarkRecipe();
  if (updateURL) pushURL();
}

// --- Wire up events ---

for (const radio of document.querySelectorAll('input[name="paint-scale-by"]')) {
  radio.addEventListener('change', () => {
    updatePaintLabels();
    update();
  });
}
for (const radio of document.querySelectorAll('input[name="quark-scale-by"]')) {
  radio.addEventListener('change', () => {
    updateQuarkLabels();
    update();
  });
}

document.getElementById(PAINT_INPUT).addEventListener('input', () => update());
document.getElementById(QUARK_INPUT).addEventListener('input', () => update());

document.getElementById('quark-section').addEventListener('toggle', () => update());

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

loadFromURL();
updatePaintLabels();
updateQuarkLabels();
update(false);

if (!window.location.search) {
  history.replaceState(null, '', buildQueryString());
}
