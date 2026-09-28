import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { calculateClamp, formatInches } from '../cam-clamp/cam-clamp-math.js';
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

  it('lever labels its length, width, pivot and cam', () => {
    const svg = renderLever(doc, dims, formatInches);
    const text = allText(svg);
    expect(text).toContain('4-5/16"');
    expect(text).toContain('1-1/4"');
    expect(text).toContain('5/8"');
    expect(text).toContain('pivot 11/16" from nose');
    expect(text).toContain('R 1/2"');
    expect(text.some(t => /rise 3\/16"/.test(t))).toBe(true);
    expect(svg.querySelector('[data-testid="pivot-hole"]')).toBeTruthy();
    expect(svg.querySelector('[data-testid="cam-circle"]')).toBeTruthy();
  });
});

describe('cam lever drawing', () => {
  it('lever outline is an arc-and-taper path, not a rectangle', () => {
    const svg = renderLever(doc, dims, formatInches);
    const path = svg.querySelector('[data-testid="lever"] path');
    const dAttr = path.getAttribute('d');
    expect(dAttr).toMatch(/A 8 8 0 0 1/);      // R 1/2" at 16 units per inch
    expect(dAttr.match(/L /g).length).toBeGreaterThanOrEqual(3);
  });

  it('the cam circle center sits 3/16" ahead of the pivot hole', () => {
    const svg = renderLever(doc, dims, formatInches);
    const hole = svg.querySelector('[data-testid="pivot-hole"]');
    const cam = svg.querySelector('[data-testid="cam-circle"]');
    expect(Number(cam.getAttribute('cx')) - Number(hole.getAttribute('cx'))).toBeCloseTo(3);
    expect(Number(cam.getAttribute('cy'))).toBeCloseTo(Number(hole.getAttribute('cy')));
    expect(Number(cam.getAttribute('r'))).toBeCloseTo(8);
  });

  it('sliding jaw and assembly show the lever at rest and a swung ghost', () => {
    for (const fn of [renderSlidingJaw, renderAssembly]) {
      const svg = fn(doc, dims, formatInches);
      const rest = svg.querySelector('[data-testid="lever"]');
      const swung = svg.querySelector('[data-testid="lever-swung"]');
      expect(rest).toBeTruthy();
      expect(swung).toBeTruthy();
      expect(rest.getAttribute('transform')).toContain('rotate(0)');
      expect(swung.getAttribute('transform')).toContain('rotate(-90)');
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
    expect(text.some(t => /clamped: handle down 90°/.test(t))).toBe(true);
  });

  it('assembly leaves room below the jaw for the swung handle', () => {
    const svg = renderAssembly(doc, dims, formatInches);
    const [, y, , h] = svg.getAttribute('viewBox').split(' ').map(Number);
    const bottom = y + h;
    const hang = (dims.barLength - dims.slidingHeight + dims.pivotY + dims.handleLength) * 16;
    expect(bottom).toBeGreaterThan(hang);
  });
});
