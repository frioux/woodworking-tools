import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { calculateClamp, formatInches, leverToJaw } from '../cam-clamp/cam-clamp-math.js';
import {
  renderAssembly, renderFixedJaw, renderSlidingJaw, renderLever
} from '../cam-clamp/cam-clamp-diagrams.js';

const original = { barThickness: 0.25, barWidth: 1, barLength: 8.5, jawReach: 4.75 };

let doc;
let dims;

beforeEach(() => {
  const window = new Window();
  doc = window.document;
  dims = calculateClamp(original);
});

function allText(svg) {
  return [...svg.querySelectorAll('text')].map(t => t.textContent);
}

describe('cam clamp views return valid SVG', () => {
  const cases = [
    ['assembly', renderAssembly, 'clamp-assembly'],
    ['fixed jaw', renderFixedJaw, 'clamp-fixed-jaw'],
    ['sliding jaw', renderSlidingJaw, 'clamp-sliding-jaw'],
    ['lever', renderLever, 'clamp-lever']
  ];

  for (const [name, fn, testid] of cases) {
    it(`${name} view is an <svg> with a viewBox and test id`, () => {
      const svg = fn(doc, dims, formatInches);
      expect(svg.tagName.toLowerCase()).toBe('svg');
      expect(svg.getAttribute('viewBox')).toBeTruthy();
      expect(svg.getAttribute('data-testid')).toBe(testid);
    });

    it(`${name} view renders for a long-reach, heavy-bar clamp`, () => {
      const d = calculateClamp({ barThickness: 0.375, barWidth: 1.5, barLength: 24, jawReach: 10 });
      const svg = fn(doc, d, formatInches);
      expect(svg.getAttribute('viewBox').split(' ').every(v => Number.isFinite(Number(v)))).toBe(true);
    });
  }
});

describe('assembly view', () => {
  it('shows the bar, both jaws and the lever', () => {
    const svg = renderAssembly(doc, dims, formatInches);
    expect(svg.querySelector('[data-testid="bar"]')).toBeTruthy();
    expect(svg.querySelector('[data-testid="fixed-jaw"]')).toBeTruthy();
    expect(svg.querySelector('[data-testid="sliding-jaw"]')).toBeTruthy();
    expect(svg.querySelector('[data-testid="lever"]')).toBeTruthy();
  });

  it('labels bar length, reach and opening', () => {
    const text = allText(renderAssembly(doc, dims, formatInches));
    expect(text).toContain('bar 8-1/2"');
    expect(text).toContain('reach 4-3/4"');
    expect(text).toContain('opens 4-5/8"');
  });

  it('bar height tracks the bar length', () => {
    const short = renderAssembly(doc, dims, formatInches);
    const long = renderAssembly(doc, calculateClamp({ ...original, barLength: 16.5 }), formatInches);
    const h = svg => Number(svg.querySelector('[data-testid="bar"]').getAttribute('height'));
    expect(h(long) / h(short)).toBeCloseTo(16.5 / 8.5);
  });
});

describe('jaw details', () => {
  it('fixed jaw labels overall length and mortise', () => {
    const text = allText(renderFixedJaw(doc, dims, formatInches));
    expect(text).toContain('6-1/4"');
    expect(text).toContain('1-1/2"');
    expect(text).toContain('1" × 5/16"');
  });

  it('sliding jaw has a relief hole, mortise and lever slot', () => {
    const svg = renderSlidingJaw(doc, dims, formatInches);
    expect(svg.querySelector('[data-testid="relief-hole"]')).toBeTruthy();
    expect(svg.querySelector('[data-testid="mortise"]')).toBeTruthy();
    expect(svg.querySelector('[data-testid="lever-slot"]')).toBeTruthy();
    expect(allText(svg)).toContain('7/16"');
  });

  it('lever labels its length, width, radii and pivot', () => {
    const svg = renderLever(doc, dims, formatInches);
    const text = allText(svg);
    expect(text).toContain('4-5/16"');
    expect(text).toContain('1-1/8"');
    expect(text).toContain('5/8"');
    expect(text).toContain('R 9/16"');
    expect(text).toContain('R 5/16"');
    expect(text.some(t => /centers 3-7\/16"/.test(t))).toBe(true);
    expect(text.some(t => /1\/8" behind and 1\/16" above/.test(t))).toBe(true);
    expect(svg.querySelector('[data-testid="pivot-hole"]')).toBeTruthy();
    expect(svg.querySelector('[data-testid="cam-circle"]')).toBeTruthy();
    expect(svg.querySelector('[data-testid="tail-circle"]')).toBeTruthy();
  });
});

describe('cam lever drawing', () => {
  it('lever outline is two arcs joined by straight tangent edges', () => {
    const svg = renderLever(doc, dims, formatInches);
    const dAttr = svg.querySelector('[data-testid="lever"] path').getAttribute('d');
    expect(dAttr).toMatch(/A 9 9 0 1 1/);     // R 9/16" head at 16 units per inch
    expect(dAttr).toMatch(/A 5 5 0 0 1/);     // R 5/16" handle end
    expect(dAttr.match(/L /g).length).toBe(1);
    expect(dAttr.trim().endsWith('Z')).toBe(true);
  });

  it('the pivot hole sits 1/8" behind and 1/16" above the head center', () => {
    const svg = renderLever(doc, dims, formatInches);
    const hole = svg.querySelector('[data-testid="pivot-hole"]');
    const cam = svg.querySelector('[data-testid="cam-circle"]');
    expect(Number(cam.getAttribute('cx')) - Number(hole.getAttribute('cx'))).toBeCloseTo(2);
    expect(Number(cam.getAttribute('cy')) - Number(hole.getAttribute('cy'))).toBeCloseTo(1);
    expect(Number(cam.getAttribute('r'))).toBeCloseTo(9);
  });

  it('sliding jaw and assembly show the lever at rest and a swung ghost', () => {
    for (const fn of [renderSlidingJaw, renderAssembly]) {
      const svg = fn(doc, dims, formatInches);
      const rest = svg.querySelector('[data-testid="lever"]');
      const swung = svg.querySelector('[data-testid="lever-swung"]');
      expect(rest).toBeTruthy();
      expect(swung).toBeTruthy();
      expect(rest.getAttribute('transform')).toContain('rotate(0)');
      expect(swung.getAttribute('transform')).toContain(`rotate(${-dims.camSwing})`);
      // Both rotate about the jaw's pivot point
      const pivot = `translate(${dims.pivotX * 16}, ${dims.pivotY * 16})`;
      expect(rest.getAttribute('transform')).toContain(pivot);
      expect(swung.getAttribute('transform')).toContain(pivot);
    }
  });

  it('sliding jaw view labels the pivot location and the clamped state', () => {
    const text = allText(renderSlidingJaw(doc, dims, formatInches));
    expect(text).toContain('5/8"');
    expect(text).toContain('1/2"');
    expect(text.some(t => new RegExp(`handle down ${dims.camSwing}°`).test(t))).toBe(true);
  });

  it('assembly leaves room below the jaw for the swung handle', () => {
    const svg = renderAssembly(doc, dims, formatInches);
    const [x, y, w, h] = svg.getAttribute('viewBox').split(' ').map(Number);
    const slideTop = dims.barLength - dims.slidingHeight;
    for (const deg of [0, dims.camSwing]) {
      const [tx, ty] = leverToJaw(dims, [-dims.centerDistance, 0], deg);
      expect(y + h).toBeGreaterThan((slideTop + dims.pivotY + ty + dims.tailRadius) * 16);
      expect(x + w).toBeGreaterThan((dims.slidingOffset + dims.pivotX + tx + dims.tailRadius) * 16);
    }
  });
});
