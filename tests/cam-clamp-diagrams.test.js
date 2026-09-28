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

  it('lever labels its length and width', () => {
    const text = allText(renderLever(doc, dims, formatInches));
    expect(text).toContain('4-5/16"');
    expect(text).toContain('1-1/4"');
  });
});
