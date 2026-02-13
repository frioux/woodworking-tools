import { calculateFrame, formatInches } from './frame-math.js';
import { renderFrontView, renderTopSection, renderSideSection, renderIsometric } from './frame-diagrams.js';

const INPUT_IDS = [
  'canvas-width', 'canvas-height', 'image-width',
  'top-margin', 'bottom-margin',
  'frame-width', 'frame-depth',
  'glass-depth', 'backer-depth'
];

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

function renderCutList(dims) {
  const container = document.getElementById('cut-list-content');
  container.innerHTML = '';

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

  // Cut list table
  const h3 = document.createElement('h3');
  h3.textContent = 'Miter Cuts';
  h3.style.cssText = 'font-size:0.95rem;color:#5c3d2e;margin:1rem 0 0.5rem;';
  container.appendChild(h3);

  const table = document.createElement('table');
  table.innerHTML = `
    <thead><tr><th>Piece</th><th>Qty</th><th>Long Point</th><th>Short Point</th></tr></thead>
    <tbody>
      <tr>
        <td>Horizontal rails</td>
        <td>2</td>
        <td>${formatInches(dims.miterLengthHorizontal)}</td>
        <td>${formatInches(dims.miterShortHorizontal)}</td>
      </tr>
      <tr>
        <td>Vertical rails</td>
        <td>2</td>
        <td>${formatInches(dims.miterLengthVertical)}</td>
        <td>${formatInches(dims.miterShortVertical)}</td>
      </tr>
    </tbody>
  `;
  container.appendChild(table);
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

function update() {
  const params = readInputs();

  // Basic validation: all values must be positive (margins can be zero)
  if (params.canvasWidth <= 0 || params.canvasHeight <= 0 ||
      params.imageWidth <= 0 || params.frameWidth <= 0 || params.frameDepth <= 0) {
    return;
  }
  if (params.imageWidth > params.canvasWidth) return;
  if (params.topMargin + params.bottomMargin >= params.canvasHeight) return;

  const dims = calculateFrame(params);
  if (dims.imageHeight <= 0) return;

  renderCutList(dims);
  renderDiagrams(dims);
}

// Wire up inputs
for (const id of INPUT_IDS) {
  document.getElementById(id).addEventListener('input', update);
}

// Initial render
update();
