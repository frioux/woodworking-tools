import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { buildRockerModel } from '../rocker-model/rocker-math.js';
import { renderChairProfile, renderScene, renderInfoPanel } from '../rocker-model/rocker-diagrams.js';

const defaults = {
  radius: 42,
  seatHeight: 17,
  seatDepth: 16,
  backrestAngle: 100,
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

  it('contains a path element for the arc', () => {
    const g = renderChairProfile(doc, model, 0);
    const paths = g.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(1);
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

  it('contains line elements for legs, seat, backrest, and stick figure', () => {
    const g = renderChairProfile(doc, model, 0);
    const lines = g.querySelectorAll('line');
    // 1 floor tick + 2 legs + 1 seat + 1 backrest + stick figure (neck, upper leg, lower leg, upper arm, forearm) = 10
    expect(lines.length).toBeGreaterThanOrEqual(10);
  });

  it('produces different output at different angles', () => {
    const g0 = renderChairProfile(doc, model, 0);
    const g1 = renderChairProfile(doc, model, 0.15);
    // The path data should differ
    const path0 = g0.querySelector('path').getAttribute('d');
    const path1 = g1.querySelector('path').getAttribute('d');
    expect(path0).not.toBe(path1);
  });

  it('contains stick figure torso triangle', () => {
    const g = renderChairProfile(doc, model, 0);
    const torso = g.querySelector('[data-testid="stick-torso"]');
    expect(torso).toBeTruthy();
    expect(torso.tagName).toBe('path');
  });

  it('contains stick figure head circle', () => {
    const g = renderChairProfile(doc, model, 0);
    const head = g.querySelector('[data-testid="stick-head"]');
    expect(head).toBeTruthy();
    expect(head.tagName).toBe('circle');
  });

  it('renders male torso as inverted triangle (wider at top)', () => {
    const maleModel = buildRockerModel({ ...defaults, sitterGender: 'male' });
    const g = renderChairProfile(doc, maleModel, 0);
    const torso = g.querySelector('[data-testid="stick-torso"]');
    const d = torso.getAttribute('d');
    // Male: two shoulder points + one hip point → 3 path segments + Z
    expect(d).toContain('M');
    expect(d).toContain('Z');
  });

  it('renders female torso differently from male', () => {
    const maleModel = buildRockerModel({ ...defaults, sitterGender: 'male' });
    const femaleModel = buildRockerModel({ ...defaults, sitterGender: 'female' });
    const gMale = renderChairProfile(doc, maleModel, 0);
    const gFemale = renderChairProfile(doc, femaleModel, 0);
    const maleTorso = gMale.querySelector('[data-testid="stick-torso"]').getAttribute('d');
    const femaleTorso = gFemale.querySelector('[data-testid="stick-torso"]').getAttribute('d');
    expect(maleTorso).not.toBe(femaleTorso);
  });

  it('foot does not clip through the floor for a tall sitter', () => {
    // 84" sitter on a standard chair: without clamping the foot would go
    // below world Y = 0 (the floor).  The lower-leg line's y2 must be >= 0
    // in SVG space, i.e. the world Y of the foot must be >= 0 (on the floor
    // or above it).
    const tallModel = buildRockerModel({ ...defaults, sitterHeight: 84 });
    const g = renderChairProfile(doc, tallModel, 0);
    const lowerLeg = g.querySelector('[data-testid="stick-lower-leg"]');
    expect(lowerLeg).toBeTruthy();
    // SVG y2 = -worldFootY * SCALE; floor is at SVG y = 0.
    // A foot on or above the floor has worldFootY >= 0, so SVG y2 <= 0.
    const y2 = parseFloat(lowerLeg.getAttribute('y2'));
    expect(y2).toBeLessThanOrEqual(0);
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

  it('includes natural tilt info', () => {
    const dl = renderInfoPanel(doc, model);
    const text = dl.textContent;
    expect(text).toContain('Natural tilt');
  });

  it('includes CoG fore/aft offset info', () => {
    const dl = renderInfoPanel(doc, model);
    const text = dl.textContent;
    expect(text).toContain('CoG fore/aft offset');
  });

  it('marks unstable model appropriately', () => {
    const unstable = buildRockerModel({ ...defaults, radius: 20, seatHeight: 19 });
    const dl = renderInfoPanel(doc, unstable);
    const text = dl.textContent;
    expect(text).toContain('Unstable');
  });
});
