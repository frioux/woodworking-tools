import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { calculateFrame, formatInches } from '../frame-designer/frame-math.js';
import { renderFrontView, renderTopSection, renderSideSection, renderIsometric } from '../frame-designer/frame-diagrams.js';

const defaults = {
  canvasWidth: 16,
  canvasHeight: 20,
  imageWidth: 10,
  topMargin: 3,
  bottomMargin: 4,
  frameWidth: 1.5,
  frameDepth: 0.75,
  glassDepth: 0.125,
  backerDepth: 0.125
};

let doc;
let dims;

beforeEach(() => {
  const window = new Window();
  doc = window.document;
  dims = calculateFrame(defaults);
});

describe('renderFrontView', () => {
  it('returns a valid SVG element', () => {
    const svg = renderFrontView(doc, dims, formatInches);
    expect(svg.tagName).toBe('svg');
    expect(svg.getAttribute('viewBox')).toBeTruthy();
  });

  it('contains rect elements for frame, mat, and image opening', () => {
    const svg = renderFrontView(doc, dims, formatInches);
    const rects = svg.querySelectorAll('rect');
    expect(rects.length).toBeGreaterThanOrEqual(3);
  });

  it('contains dimension text labels', () => {
    const svg = renderFrontView(doc, dims, formatInches);
    const texts = svg.querySelectorAll('text');
    expect(texts.length).toBeGreaterThanOrEqual(1);
  });

  it('contains dimension lines', () => {
    const svg = renderFrontView(doc, dims, formatInches);
    const lines = svg.querySelectorAll('line');
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it('changes output when dimensions change', () => {
    const svg1 = renderFrontView(doc, dims, formatInches);
    const dims2 = calculateFrame({ ...defaults, imageWidth: 12 });
    const svg2 = renderFrontView(doc, dims2, formatInches);
    expect(svg1.outerHTML).not.toBe(svg2.outerHTML);
  });
});

describe('renderTopSection', () => {
  it('returns a valid SVG element', () => {
    const svg = renderTopSection(doc, dims, formatInches);
    expect(svg.tagName).toBe('svg');
    expect(svg.getAttribute('viewBox')).toBeTruthy();
  });

  it('contains structural elements (polygons for frame profiles, rects for layers)', () => {
    const svg = renderTopSection(doc, dims, formatInches);
    const rects = svg.querySelectorAll('rect');
    const polys = svg.querySelectorAll('polygon');
    // 2 frame profiles (polygons) + glass + mat + backer (rects) = at least 5 total
    expect(rects.length).toBeGreaterThanOrEqual(3);
    expect(polys.length).toBeGreaterThanOrEqual(2);
  });

  it('has layer labels', () => {
    const svg = renderTopSection(doc, dims, formatInches);
    const texts = svg.querySelectorAll('text');
    const labels = Array.from(texts).map(t => t.textContent);
    expect(labels).toContain('Glass');
    expect(labels).toContain('Canvas');
    expect(labels).toContain('Backer');
  });
});

describe('renderSideSection', () => {
  it('returns a valid SVG element', () => {
    const svg = renderSideSection(doc, dims, formatInches);
    expect(svg.tagName).toBe('svg');
    expect(svg.getAttribute('viewBox')).toBeTruthy();
  });

  it('contains structural elements', () => {
    const svg = renderSideSection(doc, dims, formatInches);
    const rects = svg.querySelectorAll('rect');
    const polys = svg.querySelectorAll('polygon');
    // 2 frame profiles (polygons) + glass + mat + backer (rects)
    expect(rects.length).toBeGreaterThanOrEqual(3);
    expect(polys.length).toBeGreaterThanOrEqual(2);
  });

  it('contains dimension lines', () => {
    const svg = renderSideSection(doc, dims, formatInches);
    const lines = svg.querySelectorAll('line');
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });
});

describe('renderIsometric', () => {
  it('returns a valid SVG element', () => {
    const svg = renderIsometric(doc, dims, formatInches);
    expect(svg.tagName).toBe('svg');
    expect(svg.getAttribute('viewBox')).toBeTruthy();
  });

  it('contains polygon elements for 3D faces', () => {
    const svg = renderIsometric(doc, dims, formatInches);
    const polys = svg.querySelectorAll('polygon');
    expect(polys.length).toBeGreaterThanOrEqual(4);
  });

  it('has layer labels', () => {
    const svg = renderIsometric(doc, dims, formatInches);
    const texts = svg.querySelectorAll('text');
    const labels = Array.from(texts).map(t => t.textContent);
    expect(labels).toContain('Frame');
    expect(labels).toContain('Glass');
    expect(labels).toContain('Backer');
  });

  it('changes when input parameters change', () => {
    const svg1 = renderIsometric(doc, dims, formatInches);
    const dims2 = calculateFrame({ ...defaults, frameWidth: 2.5 });
    const svg2 = renderIsometric(doc, dims2, formatInches);
    expect(svg1.outerHTML).not.toBe(svg2.outerHTML);
  });
});
