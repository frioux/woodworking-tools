import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { buildRockerModel } from '../rocker-model/rocker-math.js';
import { renderChairProfile, renderScene, renderInfoPanel } from '../rocker-model/rocker-diagrams.js';

const defaults = {
  radius: 42,
  seatHeight: 17,
  seatDepth: 16,
  sitterWeight: 170,
  sitterHeight: 70,
  sitterGender: 'male',
};

let doc;
let model;

beforeEach(() => {
  const window = new Window();
  doc = window.document;
  model = buildRockerModel(defaults);
});

/* ------------------------------------------------------------------ */
/*  renderChairProfile                                                */
/* ------------------------------------------------------------------ */
describe('renderChairProfile', () => {
  it('returns a <g> element', () => {
    const g = renderChairProfile(doc, model, 0);
    expect(g.tagName).toBe('g');
  });

  it('contains path elements for arc, seat, and backrest', () => {
    const g = renderChairProfile(doc, model, 0);
    const paths = g.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(3);
  });

  it('contains circle elements for CoG and contact point', () => {
    const g = renderChairProfile(doc, model, 0);
    const circles = g.querySelectorAll('circle');
    // CoG + contact = 2
    expect(circles.length).toBeGreaterThanOrEqual(2);
  });

  it('contains CoG label text', () => {
    const g = renderChairProfile(doc, model, 0);
    const texts = g.querySelectorAll('text');
    const cogText = Array.from(texts).find(t => t.textContent === 'CoG');
    expect(cogText).toBeTruthy();
  });

  it('contains line elements for legs', () => {
    const g = renderChairProfile(doc, model, 0);
    const lines = g.querySelectorAll('line');
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it('produces different output at different angles', () => {
    const g0 = renderChairProfile(doc, model, 0);
    const g1 = renderChairProfile(doc, model, 0.15);
    // The path data should differ
    const path0 = g0.querySelector('path').getAttribute('d');
    const path1 = g1.querySelector('path').getAttribute('d');
    expect(path0).not.toBe(path1);
  });
});

/* ------------------------------------------------------------------ */
/*  renderScene                                                       */
/* ------------------------------------------------------------------ */
describe('renderScene', () => {
  it('returns a valid SVG element', () => {
    const svg = renderScene(doc, model, 0);
    expect(svg.tagName).toBe('svg');
    expect(svg.getAttribute('viewBox')).toBeTruthy();
  });

  it('has the test id attribute', () => {
    const svg = renderScene(doc, model, 0);
    expect(svg.getAttribute('data-testid')).toBe('rocker-scene');
  });

  it('contains a floor line', () => {
    const svg = renderScene(doc, model, 0);
    const lines = svg.querySelectorAll('line');
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it('contains the chair profile group', () => {
    const svg = renderScene(doc, model, 0);
    const groups = svg.querySelectorAll('g');
    expect(groups.length).toBeGreaterThanOrEqual(1);
  });
});

/* ------------------------------------------------------------------ */
/*  renderInfoPanel                                                   */
/* ------------------------------------------------------------------ */
describe('renderInfoPanel', () => {
  it('returns a <dl> element', () => {
    const dl = renderInfoPanel(doc, model);
    expect(dl.tagName).toBe('DL');
  });

  it('contains dt/dd pairs', () => {
    const dl = renderInfoPanel(doc, model);
    const dts = dl.querySelectorAll('dt');
    const dds = dl.querySelectorAll('dd');
    expect(dts.length).toBeGreaterThan(0);
    expect(dts.length).toBe(dds.length);
  });

  it('includes stability info', () => {
    const dl = renderInfoPanel(doc, model);
    const text = dl.textContent;
    expect(text).toContain('Stability');
    expect(text).toContain('Stable');
  });

  it('includes period info', () => {
    const dl = renderInfoPanel(doc, model);
    const text = dl.textContent;
    expect(text).toContain('Natural period');
  });

  it('marks unstable model appropriately', () => {
    const unstable = buildRockerModel({ ...defaults, radius: 20, seatHeight: 19 });
    const dl = renderInfoPanel(doc, unstable);
    const text = dl.textContent;
    expect(text).toContain('Unstable');
  });
});
