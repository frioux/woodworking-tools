import { calculateFrame, formatInches } from './frame-math.js';
import { renderFrontView, renderTopSection, renderSideSection, renderIsometric } from './frame-diagrams.js';

const INPUT_IDS = [
  'canvas-width', 'canvas-height', 'image-width',
  'top-margin', 'bottom-margin',
  'frame-width', 'frame-depth',
  'glass-depth', 'backer-depth'
];

// Short keys for URL params (keeps URLs compact)
const URL_KEYS = {
  'canvas-width': 'cw', 'canvas-height': 'ch', 'image-width': 'iw',
  'top-margin': 'tm', 'bottom-margin': 'bm',
  'frame-width': 'fw', 'frame-depth': 'fd',
  'glass-depth': 'gd', 'backer-depth': 'bd'
};
const URL_KEYS_REV = Object.fromEntries(
  Object.entries(URL_KEYS).map(([k, v]) => [v, k])
);

function readInputs() {
  return {
    canvasWidth: parseFloat(document.getElementById('canvas-width').value) || 0,
    canvasHeight: parseFloat(document.getElementById('canvas-height').value) || 0,
    imageWidth: parseFloat(document.getElementById('image-width').value) || 0,
    topMargin: parseFloat(document.getElementById('top-margin').value) || 0,
    bottomMargin: parseFloat(document.getElementById('bottom-margin').value) || 0,
    frameWidth: parseFloat(document.getElementById('frame-width').value) || 0,
    frameDepth: parseFloat(document.getElementById('frame-depth').value) || 0,
    glassDepth: parseFloat(document.getElementById('glass-depth').value) || 0,
    backerDepth: parseFloat(document.getElementById('backer-depth').value) || 0
  };
}

// --- Validation UI ---

function clearAllErrors() {
  for (const id of INPUT_IDS) {
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
function validate(params) {
  clearAllErrors();
  let valid = true;

  if (params.canvasWidth <= 0) {
    setError('canvas-width', 'Must be positive');
    valid = false;
  }
  if (params.canvasHeight <= 0) {
    setError('canvas-height', 'Must be positive');
    valid = false;
  }
  if (params.imageWidth <= 0) {
    setError('image-width', 'Must be positive');
    valid = false;
  } else if (params.imageWidth > params.canvasWidth) {
    setError('image-width', 'Exceeds canvas width');
    valid = false;
  }
  if (params.frameWidth <= 0) {
    setError('frame-width', 'Must be positive');
    valid = false;
  }
  if (params.frameDepth <= 0) {
    setError('frame-depth', 'Must be positive');
    valid = false;
  }

  if (params.canvasHeight > 0 && params.topMargin + params.bottomMargin >= params.canvasHeight) {
    setError('top-margin', 'Top + bottom margins must be less than canvas height');
    setError('bottom-margin', 'Top + bottom margins must be less than canvas height');
    valid = false;
  }

  // Check frame depth vs glass + backer + 3/16" minimum clearance
  if (params.frameDepth > 0) {
    const minDepth = params.glassDepth + params.backerDepth + 3 / 16;
    if (params.frameDepth < minDepth) {
      setError('frame-depth', 'Too shallow for glass + backer + 3/16" clearance');
      valid = false;
    }
  }

  return valid;
}

function updateImperialDisplays() {
  for (const id of INPUT_IDS) {
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
  let loaded = false;
  for (const [shortKey, inputId] of Object.entries(URL_KEYS_REV)) {
    const val = params.get(shortKey);
    if (val !== null) {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        document.getElementById(inputId).value = num;
        loaded = true;
      }
    }
  }
  return loaded;
}

function buildQueryString() {
  const parts = [];
  for (const id of INPUT_IDS) {
    const val = document.getElementById(id).value;
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

// --- rendering ---

function renderCutList(dims) {
  const container = document.getElementById('cut-list-content');
  container.innerHTML = '';

  // --- Cut List ---
  const cutHeading = document.createElement('h3');
  cutHeading.className = 'section-heading';
  cutHeading.textContent = 'Cut List';
  container.appendChild(cutHeading);

  const cutTable = document.createElement('table');
  cutTable.innerHTML = `
    <thead><tr><th>Piece</th><th>Qty</th><th>Length</th></tr></thead>
    <tbody>
      <tr>
        <td>Horizontal rails</td>
        <td>2</td>
        <td>${formatInches(dims.miterLengthHorizontal)}</td>
      </tr>
      <tr>
        <td>Vertical rails</td>
        <td>2</td>
        <td>${formatInches(dims.miterLengthVertical)}</td>
      </tr>
    </tbody>
  `;
  container.appendChild(cutTable);

  // --- Miter Values ---
  const miterHeading = document.createElement('h3');
  miterHeading.className = 'section-heading';
  miterHeading.textContent = 'Miter Values';
  container.appendChild(miterHeading);

  const miterTable = document.createElement('table');
  miterTable.innerHTML = `
    <thead><tr><th>Piece</th><th>Long Point</th><th>Short Point</th></tr></thead>
    <tbody>
      <tr>
        <td>Horizontal</td>
        <td>${formatInches(dims.miterLengthHorizontal)}</td>
        <td>${formatInches(dims.miterShortHorizontal)}</td>
      </tr>
      <tr>
        <td>Vertical</td>
        <td>${formatInches(dims.miterLengthVertical)}</td>
        <td>${formatInches(dims.miterShortVertical)}</td>
      </tr>
    </tbody>
  `;
  container.appendChild(miterTable);

  // --- Calculated Dimensions ---
  const dimsHeading = document.createElement('h3');
  dimsHeading.className = 'section-heading';
  dimsHeading.textContent = 'Calculated Dimensions';
  container.appendChild(dimsHeading);

  const dl = document.createElement('dl');
  dl.className = 'derived-values';

  const items = [
    ['Left / right margin', formatInches(dims.leftMargin)],
    ['Image height', formatInches(dims.imageHeight)],
    ['Outer width', formatInches(dims.outerWidth)],
    ['Outer height', formatInches(dims.outerHeight)],
    ['Rabbet depth', formatInches(dims.rabbetDepth)]
  ];

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

function renderDiagrams(dims) {
  const fmt = formatInches;

  const targets = [
    ['diagram-front', renderFrontView],
    ['diagram-top', renderTopSection],
    ['diagram-side', renderSideSection],
    ['diagram-iso', renderIsometric]
  ];

  for (const [id, renderFn] of targets) {
    const container = document.getElementById(id);
    container.innerHTML = '';
    const svg = renderFn(document, dims, fmt);
    container.appendChild(svg);
  }
}

function update(updateURL = true) {
  updateImperialDisplays();

  const params = readInputs();

  if (!validate(params)) return;

  const dims = calculateFrame(params);
  if (dims.imageHeight <= 0) return;

  renderCutList(dims);
  renderDiagrams(dims);

  if (updateURL) pushURL();
}

// Wire up inputs
for (const id of INPUT_IDS) {
  document.getElementById(id).addEventListener('input', update);
}

// Wire up stepper buttons (use native stepUp/stepDown)
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

// Handle back/forward navigation
window.addEventListener('popstate', onPopState);

// Load from URL on startup, then render
loadFromURL();
update(false);

// Set initial URL if none present
if (!window.location.search) {
  history.replaceState(null, '', buildQueryString());
}
