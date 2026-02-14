/**
 * SVG diagram generation for picture frame views.
 * Works in both browser (document) and Node (with linkedom/happy-dom).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

// Color palette — muted woodworking tones
const COLORS = {
  frame: '#8B6914',
  frameDark: '#6B4F12',
  glass: '#B8D4E3',
  canvas: '#F5EED9',
  backer: '#9E9E9E',
  backerDark: '#757575',
  opening: '#FFFFFF',
  dimension: '#444444',
  dimLine: '#888888'
};

/**
 * Create an SVG element in the SVG namespace.
 */
function svgEl(doc, tag, attrs = {}) {
  const el = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

/**
 * Draw a horizontal dimension line with label.
 */
function hDimension(doc, x1, x2, y, label, above = true) {
  const g = svgEl(doc, 'g', { class: 'dim' });
  const offset = above ? -8 : 8;
  const tickDir = above ? 1 : -1;

  // Main line
  g.appendChild(svgEl(doc, 'line', {
    x1, y1: y + offset, x2, y2: y + offset,
    stroke: COLORS.dimLine, 'stroke-width': 0.5,
    'marker-start': 'url(#arrow-left)',
    'marker-end': 'url(#arrow-right)'
  }));

  // Extension lines
  g.appendChild(svgEl(doc, 'line', {
    x1, y1: y, x2: x1, y2: y + offset - tickDir * 3,
    stroke: COLORS.dimLine, 'stroke-width': 0.3
  }));
  g.appendChild(svgEl(doc, 'line', {
    x1: x2, y1: y, x2, y2: y + offset - tickDir * 3,
    stroke: COLORS.dimLine, 'stroke-width': 0.3
  }));

  // Label
  const text = svgEl(doc, 'text', {
    x: (x1 + x2) / 2, y: y + offset + (above ? -3 : 7),
    'text-anchor': 'middle', fill: COLORS.dimension,
    'font-size': 4, 'font-family': 'sans-serif'
  });
  text.textContent = label;
  g.appendChild(text);

  return g;
}

/**
 * Draw a vertical dimension line with label.
 */
function vDimension(doc, y1, y2, x, label, left = true) {
  const g = svgEl(doc, 'g', { class: 'dim' });
  const offset = left ? -8 : 8;
  const tickDir = left ? 1 : -1;

  g.appendChild(svgEl(doc, 'line', {
    x1: x + offset, y1, x2: x + offset, y2,
    stroke: COLORS.dimLine, 'stroke-width': 0.5,
    'marker-start': 'url(#arrow-up)',
    'marker-end': 'url(#arrow-down)'
  }));

  g.appendChild(svgEl(doc, 'line', {
    x1: x, y1, x2: x + offset - tickDir * 3, y2: y1,
    stroke: COLORS.dimLine, 'stroke-width': 0.3
  }));
  g.appendChild(svgEl(doc, 'line', {
    x1: x, y1: y2, x2: x + offset - tickDir * 3, y2,
    stroke: COLORS.dimLine, 'stroke-width': 0.3
  }));

  const text = svgEl(doc, 'text', {
    x: x + offset + (left ? -3 : 3), y: (y1 + y2) / 2,
    'text-anchor': 'middle', fill: COLORS.dimension,
    'font-size': 4, 'font-family': 'sans-serif',
    transform: `rotate(-90, ${x + offset + (left ? -3 : 3)}, ${(y1 + y2) / 2})`
  });
  text.textContent = label;
  g.appendChild(text);

  return g;
}

/**
 * Create arrowhead marker definitions.
 */
function createDefs(doc) {
  const defs = svgEl(doc, 'defs');

  const arrows = [
    { id: 'arrow-right', refX: 6, path: 'M0,0 L0,3 L6,1.5 Z' },
    { id: 'arrow-left', refX: 0, path: 'M6,0 L6,3 L0,1.5 Z' },
    { id: 'arrow-down', refX: 1.5, refY: 6, path: 'M0,0 L3,0 L1.5,6 Z' },
    { id: 'arrow-up', refX: 1.5, refY: 0, path: 'M0,6 L3,6 L1.5,0 Z' }
  ];

  for (const a of arrows) {
    const marker = svgEl(doc, 'marker', {
      id: a.id, markerWidth: 3, markerHeight: 3,
      viewBox: '0 0 6 6',
      refX: a.refX ?? 0, refY: a.refY ?? 1.5,
      markerUnits: 'userSpaceOnUse'
    });
    marker.appendChild(svgEl(doc, 'path', {
      d: a.path, fill: COLORS.dimLine
    }));
    defs.appendChild(marker);
  }

  return defs;
}

/**
 * Generate Front View SVG.
 */
export function renderFrontView(doc, dims, fmt) {
  const pad = 25;
  const scale = 4;
  const w = dims.outerWidth * scale;
  const h = dims.outerHeight * scale;
  const fw = dims.frameWidth * scale;

  const svg = svgEl(doc, 'svg', {
    viewBox: `${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}`,
    xmlns: SVG_NS
  });
  svg.appendChild(createDefs(doc));

  // Outer frame
  svg.appendChild(svgEl(doc, 'rect', {
    x: 0, y: 0, width: w, height: h,
    fill: COLORS.frame, stroke: COLORS.frameDark, 'stroke-width': 0.5
  }));

  // Canvas area (inside frame)
  svg.appendChild(svgEl(doc, 'rect', {
    x: fw, y: fw, width: w - 2 * fw, height: h - 2 * fw,
    fill: COLORS.canvas, stroke: '#ccc', 'stroke-width': 0.3
  }));

  // Image opening — the frame's inner edge aligns with the image opening
  // (canvas margins are hidden behind the frame molding)
  const imgW = dims.imageWidth * scale;
  const imgH = dims.imageHeight * scale;
  const imgX = fw;
  const imgY = fw;
  svg.appendChild(svgEl(doc, 'rect', {
    x: imgX, y: imgY, width: imgW, height: imgH,
    fill: COLORS.opening, stroke: '#aaa', 'stroke-width': 0.3
  }));

  // Mitre lines at corners (45-degree joints)
  const mitreLines = [
    { x1: 0, y1: 0, x2: fw, y2: fw },         // top-left
    { x1: w, y1: 0, x2: w - fw, y2: fw },      // top-right
    { x1: 0, y1: h, x2: fw, y2: h - fw },      // bottom-left
    { x1: w, y1: h, x2: w - fw, y2: h - fw }   // bottom-right
  ];
  for (const ml of mitreLines) {
    svg.appendChild(svgEl(doc, 'line', {
      ...ml, stroke: COLORS.frameDark, 'stroke-width': 0.5
    }));
  }

  // Label
  const label = svgEl(doc, 'text', {
    x: imgX + imgW / 2, y: imgY + imgH / 2,
    'text-anchor': 'middle', fill: '#bbb',
    'font-size': 5, 'font-family': 'sans-serif'
  });
  label.textContent = 'Image';
  svg.appendChild(label);

  // Dimension lines
  svg.appendChild(hDimension(doc, 0, w, 0, fmt(dims.outerWidth), true));
  svg.appendChild(vDimension(doc, 0, h, 0, fmt(dims.outerHeight), true));
  svg.appendChild(hDimension(doc, 0, fw, h, fmt(dims.frameWidth), false));
  svg.appendChild(hDimension(doc, imgX, imgX + imgW, h, fmt(dims.imageWidth), false));
  svg.appendChild(vDimension(doc, 0, fw, w, fmt(dims.frameWidth), false));
  svg.appendChild(vDimension(doc, imgY, imgY + imgH, w, fmt(dims.imageHeight), false));

  return svg;
}

/**
 * Generate Top Cross-Section SVG.
 */
export function renderTopSection(doc, dims, fmt) {
  const pad = 25;
  const scale = 4;
  const w = dims.outerWidth * scale;
  const depthScale = 20; // exaggerate depth for visibility
  const fw = dims.frameWidth * scale;
  const fd = dims.frameDepth * depthScale;
  const gd = dims.glassDepth * depthScale;
  const bd = dims.backerDepth * depthScale;
  const rd = dims.rabbetDepth * depthScale;
  const lip = 2; // rabbet shelf width in SVG units
  const totalDepth = fd;
  const svgH = totalDepth + 2 * pad;

  const svg = svgEl(doc, 'svg', {
    viewBox: `${-pad} ${-pad} ${w + 2 * pad} ${svgH}`,
    xmlns: SVG_NS
  });
  svg.appendChild(createDefs(doc));

  // Left frame profile (L-shaped with rabbet notch)
  svg.appendChild(svgEl(doc, 'polygon', {
    points: [
      `${0},${0}`, `${fw - lip},${0}`, `${fw - lip},${rd}`,
      `${fw},${rd}`, `${fw},${fd}`, `${0},${fd}`
    ].join(' '),
    fill: COLORS.frame, stroke: COLORS.frameDark, 'stroke-width': 0.5
  }));

  // Right frame profile (L-shaped, mirrored)
  svg.appendChild(svgEl(doc, 'polygon', {
    points: [
      `${w - fw + lip},${0}`, `${w},${0}`, `${w},${fd}`,
      `${w - fw},${fd}`, `${w - fw},${rd}`, `${w - fw + lip},${rd}`
    ].join(' '),
    fill: COLORS.frame, stroke: COLORS.frameDark, 'stroke-width': 0.5
  }));

  // Glass layer
  const glassY = 2;
  svg.appendChild(svgEl(doc, 'rect', {
    x: fw - lip, y: glassY, width: w - 2 * fw + 2 * lip, height: gd,
    fill: COLORS.glass, stroke: '#7ab', 'stroke-width': 0.3
  }));

  // Canvas layer
  const canvasY = glassY + gd + 1;
  const canvasD = 3;
  svg.appendChild(svgEl(doc, 'rect', {
    x: fw - lip, y: canvasY, width: w - 2 * fw + 2 * lip, height: canvasD,
    fill: COLORS.canvas, stroke: '#ccc', 'stroke-width': 0.3
  }));

  // Backer layer
  const backerY = canvasY + canvasD + 1;
  svg.appendChild(svgEl(doc, 'rect', {
    x: fw - lip, y: backerY, width: w - 2 * fw + 2 * lip, height: bd,
    fill: COLORS.backer, stroke: COLORS.backerDark, 'stroke-width': 0.3
  }));

  // Dimensions
  svg.appendChild(hDimension(doc, 0, fw, 0, fmt(dims.frameWidth), true));
  svg.appendChild(hDimension(doc, 0, w, fd, fmt(dims.outerWidth), false));
  svg.appendChild(vDimension(doc, 0, fd, 0, fmt(dims.frameDepth), true));
  svg.appendChild(vDimension(doc, 0, rd, w - fw, fmt(dims.rabbetDepth), false));

  // Layer labels
  const labelX = w + 5;
  for (const [text, y] of [['Glass', glassY + gd / 2], ['Canvas', canvasY + canvasD / 2], ['Backer', backerY + bd / 2]]) {
    const t = svgEl(doc, 'text', {
      x: labelX, y: y + 2,
      fill: COLORS.dimension, 'font-size': 3.5, 'font-family': 'sans-serif'
    });
    t.textContent = text;
    svg.appendChild(t);
  }

  return svg;
}

/**
 * Generate Side Cross-Section SVG.
 */
export function renderSideSection(doc, dims, fmt) {
  const pad = 25;
  const scale = 4;
  const h = dims.outerHeight * scale;
  const depthScale = 20;
  const fw = dims.frameWidth * scale;
  const fd = dims.frameDepth * depthScale;
  const gd = dims.glassDepth * depthScale;
  const bd = dims.backerDepth * depthScale;
  const rd = dims.rabbetDepth * depthScale;
  const lip = 2;

  const svg = svgEl(doc, 'svg', {
    viewBox: `${-pad} ${-pad} ${fd + 2 * pad} ${h + 2 * pad}`,
    xmlns: SVG_NS
  });
  svg.appendChild(createDefs(doc));

  // Top frame profile (L-shaped with rabbet notch)
  svg.appendChild(svgEl(doc, 'polygon', {
    points: [
      `${0},${0}`, `${0},${fw - lip}`, `${rd},${fw - lip}`,
      `${rd},${fw}`, `${fd},${fw}`, `${fd},${0}`
    ].join(' '),
    fill: COLORS.frame, stroke: COLORS.frameDark, 'stroke-width': 0.5
  }));

  // Bottom frame profile (L-shaped, mirrored)
  svg.appendChild(svgEl(doc, 'polygon', {
    points: [
      `${0},${h}`, `${fd},${h}`, `${fd},${h - fw}`,
      `${rd},${h - fw}`, `${rd},${h - fw + lip}`, `${0},${h - fw + lip}`
    ].join(' '),
    fill: COLORS.frame, stroke: COLORS.frameDark, 'stroke-width': 0.5
  }));

  // Glass
  const glassX = 2;
  svg.appendChild(svgEl(doc, 'rect', {
    x: glassX, y: fw - lip, width: gd, height: h - 2 * fw + 2 * lip,
    fill: COLORS.glass, stroke: '#7ab', 'stroke-width': 0.3
  }));

  // Canvas
  const canvasX = glassX + gd + 1;
  const canvasD = 3;
  svg.appendChild(svgEl(doc, 'rect', {
    x: canvasX, y: fw - lip, width: canvasD, height: h - 2 * fw + 2 * lip,
    fill: COLORS.canvas, stroke: '#ccc', 'stroke-width': 0.3
  }));

  // Backer
  const backerX = canvasX + canvasD + 1;
  svg.appendChild(svgEl(doc, 'rect', {
    x: backerX, y: fw - lip, width: bd, height: h - 2 * fw + 2 * lip,
    fill: COLORS.backer, stroke: COLORS.backerDark, 'stroke-width': 0.3
  }));

  // Dimensions
  svg.appendChild(vDimension(doc, 0, fw, 0, fmt(dims.frameWidth), true));
  svg.appendChild(vDimension(doc, 0, h, fd, fmt(dims.outerHeight), false));
  svg.appendChild(hDimension(doc, 0, fd, 0, fmt(dims.frameDepth), true));
  svg.appendChild(hDimension(doc, 0, rd, h - fw, fmt(dims.rabbetDepth), false));

  return svg;
}

/**
 * Generate Isometric (3D) Projection SVG.
 */
export function renderIsometric(doc, dims, _fmt) {
  const pad = 30;

  // Isometric projection helpers
  const angle = Math.PI / 6; // 30 degrees
  const cos30 = Math.cos(angle);
  const sin30 = Math.sin(angle);
  const scale = 3;

  function isoProject(x, y, z) {
    return {
      px: pad + (x * cos30 - y * cos30) * scale + 80,
      py: pad + (x * sin30 + y * sin30 - z) * scale + 20
    };
  }

  function isoRect(sx, sy, sz, w, h, d, fill, strokeColor) {
    const g = svgEl(doc, 'g');

    // Top face
    const tl = isoProject(sx, sy, sz + d);
    const tr = isoProject(sx + w, sy, sz + d);
    const br = isoProject(sx + w, sy + h, sz + d);
    const bl = isoProject(sx, sy + h, sz + d);
    g.appendChild(svgEl(doc, 'polygon', {
      points: `${tl.px},${tl.py} ${tr.px},${tr.py} ${br.px},${br.py} ${bl.px},${bl.py}`,
      fill, stroke: strokeColor, 'stroke-width': 0.4
    }));

    // Right face
    const rbr = isoProject(sx + w, sy + h, sz);
    const rtr = isoProject(sx + w, sy, sz);
    g.appendChild(svgEl(doc, 'polygon', {
      points: `${tr.px},${tr.py} ${rtr.px},${rtr.py} ${rbr.px},${rbr.py} ${br.px},${br.py}`,
      fill, stroke: strokeColor, 'stroke-width': 0.4, opacity: 0.85
    }));

    // Left face (for depth)
    const lbl = isoProject(sx, sy + h, sz);
    g.appendChild(svgEl(doc, 'polygon', {
      points: `${bl.px},${bl.py} ${lbl.px},${lbl.py} ${rbr.px},${rbr.py} ${br.px},${br.py}`,
      fill, stroke: strokeColor, 'stroke-width': 0.4, opacity: 0.7
    }));

    return g;
  }

  const ow = dims.outerWidth;
  const oh = dims.outerHeight;
  const fw = dims.frameWidth;
  const fd = dims.frameDepth;
  const layerGap = 3; // gap between exploded layers

  const svgW = 200;
  const svgH = 180;

  const svg = svgEl(doc, 'svg', {
    viewBox: `0 0 ${svgW} ${svgH}`,
    xmlns: SVG_NS
  });

  // Backer (back-most layer)
  const backerZ = 0;
  svg.appendChild(isoRect(fw, fw, backerZ,
    ow - 2 * fw, oh - 2 * fw, dims.backerDepth * 8,
    COLORS.backer, COLORS.backerDark));

  // Canvas layer
  const canvasZ = backerZ + dims.backerDepth * 8 + layerGap;
  svg.appendChild(isoRect(fw, fw, canvasZ,
    ow - 2 * fw, oh - 2 * fw, 2,
    COLORS.canvas, '#cba'));

  // Glass layer
  const glassZ = canvasZ + 2 + layerGap;
  svg.appendChild(isoRect(fw, fw, glassZ,
    ow - 2 * fw, oh - 2 * fw, dims.glassDepth * 8,
    COLORS.glass, '#7ab'));

  // Frame (front-most, with center cut out — draw as 4 rails)
  const frameZ = glassZ + dims.glassDepth * 8 + layerGap;
  // Top rail
  svg.appendChild(isoRect(0, 0, frameZ, ow, fw, fd, COLORS.frame, COLORS.frameDark));
  // Bottom rail
  svg.appendChild(isoRect(0, oh - fw, frameZ, ow, fw, fd, COLORS.frame, COLORS.frameDark));
  // Left rail
  svg.appendChild(isoRect(0, fw, frameZ, fw, oh - 2 * fw, fd, COLORS.frame, COLORS.frameDark));
  // Right rail
  svg.appendChild(isoRect(ow - fw, fw, frameZ, fw, oh - 2 * fw, fd, COLORS.frame, COLORS.frameDark));

  // Labels
  const labels = [
    { text: 'Backer', z: backerZ },
    { text: 'Canvas', z: canvasZ },
    { text: 'Glass', z: glassZ },
    { text: 'Frame', z: frameZ }
  ];
  for (const l of labels) {
    const p = isoProject(-5, oh + 2, l.z);
    const t = svgEl(doc, 'text', {
      x: p.px, y: p.py,
      fill: COLORS.dimension, 'font-size': 4, 'font-family': 'sans-serif'
    });
    t.textContent = l.text;
    svg.appendChild(t);
  }

  return svg;
}
