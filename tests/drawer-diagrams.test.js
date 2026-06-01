import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { calculateDrawer, formatInches } from '../drawer-designer/drawer-math.js';
import {
  renderFrontView, renderSideView, renderTopView
} from '../drawer-designer/drawer-diagrams.js';

const defaults = {
  depth: 20,
  width: 24,
  height: 6,
  frontThickness: 0.75,
  sideThickness: 0.5
};

let doc;
let dims;
let dimsHB;

beforeEach(() => {
  const window = new Window();
  doc = window.document;
  dims = calculateDrawer(defaults);
  dimsHB = calculateDrawer({ ...defaults, halfBlindFront: true });
});

/* ------------------------------------------------------------------ */
/*  Each view returns a valid, identifiable SVG                        */
/* ------------------------------------------------------------------ */
describe('drawer views return valid SVG', () => {
  const cases = [
    ['front', renderFrontView, 'drawer-front'],
    ['side', renderSideView, 'drawer-side'],
    ['top', renderTopView, 'drawer-top']
  ];

  for (const [name, fn, testid] of cases) {
    it(`${name} view is an <svg> with a viewBox and test id`, () => {
      const svg = fn(doc, dims, formatInches);
      expect(svg.tagName.toLowerCase()).toBe('svg');
      expect(svg.getAttribute('viewBox')).toBeTruthy();
      expect(svg.getAttribute('data-testid')).toBe(testid);
    });

    it(`${name} view renders without error for a half-blind front`, () => {
      const svg = fn(doc, dimsHB, formatInches);
      expect(svg.tagName.toLowerCase()).toBe('svg');
    });
  }
});

/* ------------------------------------------------------------------ */
/*  Dovetail rendering                                                */
/* ------------------------------------------------------------------ */
describe('dovetail rendering', () => {
  it('front view shows through-dovetail joints by default', () => {
    const svg = renderFrontView(doc, dims, formatInches);
    const joints = svg.querySelectorAll('[data-testid="dovetail-joint"]');
    // one joint strip at each vertical edge
    expect(joints.length).toBe(2);
  });

  it('front view hides the joint for a half-blind front', () => {
    const svg = renderFrontView(doc, dimsHB, formatInches);
    const joints = svg.querySelectorAll('[data-testid="dovetail-joint"]');
    // half-blind front face is clean — no visible joint strips
    expect(joints.length).toBe(0);
  });

  it('side view always shows joints at both ends', () => {
    const through = renderSideView(doc, dims, formatInches);
    const halfBlind = renderSideView(doc, dimsHB, formatInches);
    expect(through.querySelectorAll('[data-testid="dovetail-joint"]').length).toBe(2);
    expect(halfBlind.querySelectorAll('[data-testid="dovetail-joint"]').length).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Structural content                                                */
/* ------------------------------------------------------------------ */
describe('view content', () => {
  it('front view labels the width and height', () => {
    const svg = renderFrontView(doc, dims, formatInches);
    const text = svg.textContent;
    expect(text).toContain(formatInches(dims.width));
    expect(text).toContain(formatInches(dims.height));
  });

  it('side view labels the depth', () => {
    const svg = renderSideView(doc, dims, formatInches);
    expect(svg.textContent).toContain(formatInches(dims.depth));
  });

  it('top view contains four wall rectangles plus the bottom panel', () => {
    const svg = renderTopView(doc, dims, formatInches);
    const rects = svg.querySelectorAll('rect');
    // background + bottom panel + 4 walls + inner outline = at least 6
    expect(rects.length).toBeGreaterThanOrEqual(6);
  });

  it('produces different geometry when dimensions change', () => {
    const a = renderFrontView(doc, dims, formatInches).getAttribute('viewBox');
    const big = calculateDrawer({ ...defaults, width: 36 });
    const b = renderFrontView(doc, big, formatInches).getAttribute('viewBox');
    expect(a).not.toBe(b);
  });
});
