/**
 * SVG diagram generation for picture frame views.
 * Works in both browser (document) and Node (with linkedom/happy-dom).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

// Color palette — muted woodworking tones
// Canvas (paper) layer thickness in SVG units — not a user input, just enough to be visible
const CANVAS_DEPTH = 0.3;

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
 * Compute arrow scale factor: full size above 1" (4 SVG units at scale=4),
 * linearly scaled down for smaller spans.
 */
function arrowScale(span) {
  const threshold = 6; // 1.5 inches at scale=4
  if (span >= threshold) return 1;
  return Math.max(0.3, (span / threshold) ** 2);
}

/**
 * Draw a horizontal dimension line with label.
 */
function hDimension(doc, x1, x2, y, label, above = true) {
  const g = svgEl(doc, 'g', { class: 'dim' });
  const offset = above ? -8 : 8;
  const tickDir = above ? 1 : -1;
  const lineY = y + offset;
  const span = Math.abs(x2 - x1);
  const s = arrowScale(span);
  const arrowLen = 2.5 * s;
  const arrowHalf = 1.25 * s;

  // Main line
  g.appendChild(svgEl(doc, 'line', {
    x1, y1: lineY, x2, y2: lineY,
    stroke: COLORS.dimLine, 'stroke-width': 0.5
  }));

  // Left arrowhead
  g.appendChild(svgEl(doc, 'polygon', {
    points: `${x1},${lineY} ${x1 + arrowLen},${lineY - arrowHalf} ${x1 + arrowLen},${lineY + arrowHalf}`,
    fill: COLORS.dimLine
  }));

  // Right arrowhead
  g.appendChild(svgEl(doc, 'polygon', {
    points: `${x2},${lineY} ${x2 - arrowLen},${lineY - arrowHalf} ${x2 - arrowLen},${lineY + arrowHalf}`,
    fill: COLORS.dimLine
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
  const lineX = x + offset;
  const span = Math.abs(y2 - y1);
  const s = arrowScale(span);
  const arrowLen = 2.5 * s;
  const arrowHalf = 1.25 * s;

  // Main line
  g.appendChild(svgEl(doc, 'line', {
    x1: lineX, y1, x2: lineX, y2,
    stroke: COLORS.dimLine, 'stroke-width': 0.5
  }));

  // Top arrowhead
  g.appendChild(svgEl(doc, 'polygon', {
    points: `${lineX},${y1} ${lineX - arrowHalf},${y1 + arrowLen} ${lineX + arrowHalf},${y1 + arrowLen}`,
    fill: COLORS.dimLine
  }));

  // Bottom arrowhead
  g.appendChild(svgEl(doc, 'polygon', {
    points: `${lineX},${y2} ${lineX - arrowHalf},${y2 - arrowLen} ${lineX + arrowHalf},${y2 - arrowLen}`,
    fill: COLORS.dimLine
  }));

  // Extension lines
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
    { id: 'arrow-right', refX: 4, path: 'M0,0 L0,6 L4,3 Z' },
    { id: 'arrow-left', refX: 0, path: 'M4,0 L4,6 L0,3 Z' },
    { id: 'arrow-down', refX: 3, refY: 4, path: 'M0,0 L6,0 L3,4 Z' },
    { id: 'arrow-up', refX: 3, refY: 0, path: 'M0,4 L6,4 L3,0 Z' }
  ];

  for (const a of arrows) {
    const marker = svgEl(doc, 'marker', {
      id: a.id, markerWidth: 2.5, markerHeight: 2.5,
      viewBox: '0 0 6 6',
      refX: a.refX ?? 0, refY: a.refY ?? 3,
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

  // Miter lines at corners (45-degree joints)
  const miterLines = [
    { x1: 0, y1: 0, x2: fw, y2: fw },         // top-left
    { x1: w, y1: 0, x2: w - fw, y2: fw },      // top-right
    { x1: 0, y1: h, x2: fw, y2: h - fw },      // bottom-left
    { x1: w, y1: h, x2: w - fw, y2: h - fw }   // bottom-right
  ];
  for (const ml of miterLines) {
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
  const fw = dims.frameWidth * scale;
  const fd = dims.frameDepth * scale;
  const gd = dims.glassDepth * scale;
  const bd = dims.backerDepth * scale;
  const rd = dims.rabbetDepth * scale;
  const lip = 1; // rabbet shelf width in SVG units
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

  // Layers sit inside the rabbet notch (between the lips)
  const layerX = fw - lip;
  const layerW = w - 2 * (fw - lip);
  // Backer layer (at the back of the rabbet, y=0)
  const backerY = 0;
  svg.appendChild(svgEl(doc, 'rect', {
    x: layerX, y: backerY, width: layerW, height: bd,
    fill: COLORS.backer, stroke: COLORS.backerDark, 'stroke-width': 0.3
  }));

  // Canvas layer (between backer and glass)
  const canvasY = backerY + bd;
  svg.appendChild(svgEl(doc, 'rect', {
    x: layerX, y: canvasY, width: layerW, height: CANVAS_DEPTH,
    fill: COLORS.canvas, stroke: '#ccc', 'stroke-width': 0.3
  }));

  // Glass layer (at the front of the rabbet, closest to viewer)
  const glassY = canvasY + CANVAS_DEPTH;
  svg.appendChild(svgEl(doc, 'rect', {
    x: layerX, y: glassY, width: layerW, height: gd,
    fill: COLORS.glass, stroke: '#7ab', 'stroke-width': 0.3
  }));

  // Dimensions
  svg.appendChild(hDimension(doc, 0, fw, 0, fmt(dims.frameWidth), true));
  svg.appendChild(hDimension(doc, 0, w, fd, fmt(dims.outerWidth), false));
  svg.appendChild(vDimension(doc, 0, fd, 0, fmt(dims.frameDepth), true));
  svg.appendChild(vDimension(doc, 0, rd, w - fw, fmt(dims.rabbetDepth), false));

  return svg;
}

/**
 * Generate Side Cross-Section SVG.
 */
export function renderSideSection(doc, dims, fmt) {
  const pad = 25;
  const scale = 4;
  const h = dims.outerHeight * scale;
  const fw = dims.frameWidth * scale;
  const fd = dims.frameDepth * scale;
  const gd = dims.glassDepth * scale;
  const bd = dims.backerDepth * scale;
  const rd = dims.rabbetDepth * scale;
  const lip = 1;

  // Use outerWidth for viewBox width to match front view / top section scale
  const vbW = dims.outerWidth * scale + 2 * pad;

  const svg = svgEl(doc, 'svg', {
    viewBox: `${-pad} ${-pad} ${vbW} ${h + 2 * pad}`,
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

  // Backer (at the back of the rabbet, x=0)
  const backerX = 0;
  svg.appendChild(svgEl(doc, 'rect', {
    x: backerX, y: fw, width: bd, height: h - 2 * fw,
    fill: COLORS.backer, stroke: COLORS.backerDark, 'stroke-width': 0.3
  }));

  // Canvas (between backer and glass)
  const canvasX = backerX + bd;
  svg.appendChild(svgEl(doc, 'rect', {
    x: canvasX, y: fw, width: CANVAS_DEPTH, height: h - 2 * fw,
    fill: COLORS.canvas, stroke: '#ccc', 'stroke-width': 0.3
  }));

  // Glass (at the front of the rabbet, closest to viewer)
  const glassX = canvasX + CANVAS_DEPTH;
  svg.appendChild(svgEl(doc, 'rect', {
    x: glassX, y: fw, width: gd, height: h - 2 * fw,
    fill: COLORS.glass, stroke: '#7ab', 'stroke-width': 0.3
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
    ow - 2 * fw, oh - 2 * fw, dims.backerDepth,
    COLORS.backer, COLORS.backerDark));

  // Canvas layer (paper-thin in real units)
  const isoCanvasDepth = 0.05;
  const canvasZ = backerZ + dims.backerDepth + layerGap;
  svg.appendChild(isoRect(fw, fw, canvasZ,
    ow - 2 * fw, oh - 2 * fw, isoCanvasDepth,
    COLORS.canvas, '#cba'));

  // Glass layer
  const glassZ = canvasZ + isoCanvasDepth + layerGap;
  svg.appendChild(isoRect(fw, fw, glassZ,
    ow - 2 * fw, oh - 2 * fw, dims.glassDepth,
    COLORS.glass, '#7ab'));

  // Frame (front-most) — draw as 4 mitered rails
  const frameZ = glassZ + dims.glassDepth + layerGap;
  const topZ = frameZ + fd;

  // Helper to draw an isometric polygon from 3D points
  function isoFace(pts, fill, stroke, opacity) {
    const projected = pts.map(([x, y, z]) => isoProject(x, y, z));
    const attrs = {
      points: projected.map(p => `${p.px},${p.py}`).join(' '),
      fill, stroke, 'stroke-width': 0.4
    };
    if (opacity !== null && opacity !== undefined) attrs.opacity = opacity;
    return svgEl(doc, 'polygon', attrs);
  }

  // Side faces (behind top faces)
  // Top rail inner face (at y=fw, faces viewer)
  svg.appendChild(isoFace(
    [[fw,fw,topZ], [ow-fw,fw,topZ], [ow-fw,fw,frameZ], [fw,fw,frameZ]],
    COLORS.frame, COLORS.frameDark, 0.7
  ));
  // Left rail inner face (at x=fw, faces right)
  svg.appendChild(isoFace(
    [[fw,fw,topZ], [fw,oh-fw,topZ], [fw,oh-fw,frameZ], [fw,fw,frameZ]],
    COLORS.frame, COLORS.frameDark, 0.85
  ));
  // Bottom rail outer face (at y=oh, faces viewer)
  svg.appendChild(isoFace(
    [[0,oh,topZ], [ow,oh,topZ], [ow,oh,frameZ], [0,oh,frameZ]],
    COLORS.frame, COLORS.frameDark, 0.7
  ));
  // Right rail outer face (at x=ow, faces right)
  svg.appendChild(isoFace(
    [[ow,0,topZ], [ow,oh,topZ], [ow,oh,frameZ], [ow,0,frameZ]],
    COLORS.frame, COLORS.frameDark, 0.85
  ));

  // Top faces (trapezoids showing miter joints)
  // Top rail
  svg.appendChild(isoFace(
    [[0,0,topZ], [ow,0,topZ], [ow-fw,fw,topZ], [fw,fw,topZ]],
    COLORS.frame, COLORS.frameDark
  ));
  // Left rail
  svg.appendChild(isoFace(
    [[0,0,topZ], [fw,fw,topZ], [fw,oh-fw,topZ], [0,oh,topZ]],
    COLORS.frame, COLORS.frameDark
  ));
  // Bottom rail
  svg.appendChild(isoFace(
    [[fw,oh-fw,topZ], [ow-fw,oh-fw,topZ], [ow,oh,topZ], [0,oh,topZ]],
    COLORS.frame, COLORS.frameDark
  ));
  // Right rail
  svg.appendChild(isoFace(
    [[ow-fw,fw,topZ], [ow,0,topZ], [ow,oh,topZ], [ow-fw,oh-fw,topZ]],
    COLORS.frame, COLORS.frameDark
  ));

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
