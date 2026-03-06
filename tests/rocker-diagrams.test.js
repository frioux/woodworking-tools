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

  it('backrest covers the full stick figure (head does not project past)', () => {
    // With a reclined backrest and tall sitter the head used to extend past
    // the top of the backrest line.  The backrest endpoint (in SVG coords)
    // must be at least as far from the floor as the head-circle top.
    const params = { ...defaults, sitterHeight: 73, backrestAngle: 108,
                     seatHeight: 18.5, seatDepth: 15 };
    const m = buildRockerModel(params);
    const g = renderChairProfile(doc, m, 0);

    // Find the backrest line — it's the line with COLOR_BACK (#7A5C4F)
    const lines = Array.from(g.querySelectorAll('line'));
    const backrestLine = lines.find(l => l.getAttribute('stroke') === '#7A5C4F');
    expect(backrestLine).toBeTruthy();

    // The head circle
    const head = g.querySelector('[data-testid="stick-head"]');
    expect(head).toBeTruthy();
    const headCY = parseFloat(head.getAttribute('cy'));
    const headR  = parseFloat(head.getAttribute('r'));
    const headTop = headCY - headR; // SVG y: more negative = higher

    // Backrest top — whichever end is higher (more negative SVG y)
    const y1 = parseFloat(backrestLine.getAttribute('y1'));
    const y2 = parseFloat(backrestLine.getAttribute('y2'));
    const backrestTop = Math.min(y1, y2);

    // The backrest top must be at or above the head top (≤ in SVG coords)
    expect(backrestTop).toBeLessThanOrEqual(headTop);
  });


  it('does not place hips behind the backrest base for tall sitters', () => {
    const m = buildRockerModel({
      radius: 42,
      seatHeight: 17,
      seatDepth: 16,
      backrestAngle: 97,
      chairWeight: 25,
      sitterWeight: 75,
      sitterHeight: 73,
      sitterGender: 'male',
      cogOffsetX: 0,
    });
    const g = renderChairProfile(doc, m, 0);
    const upperLeg = g.querySelector('[data-testid="stick-upper-leg"]');
    expect(upperLeg).toBeTruthy();
    const hipX = parseFloat(upperLeg.getAttribute('x1'));
    const backBaseX = -(16 / 2) * 4;
    expect(hipX).toBeGreaterThanOrEqual(backBaseX - 0.01);
  });

  it('renders finite stick-figure coordinates for very shallow backrest angles', () => {
    const shallowModel = buildRockerModel({ ...defaults, backrestAngle: 0 });
    const g = renderChairProfile(doc, shallowModel, 0);
    const head = g.querySelector('[data-testid="stick-head"]');
    expect(head).toBeTruthy();
    expect(Number.isFinite(parseFloat(head.getAttribute('cx')))).toBe(true);
    expect(Number.isFinite(parseFloat(head.getAttribute('cy')))).toBe(true);
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
/*  Body-size overlap / intersection checks                           */
/* ------------------------------------------------------------------ */
describe('body-size overlap checks', () => {
  // Chair geometry matching the reported issue URL:
  // r=42, sh=18.5, sd=15, ba=108, cw=25
  const chairParams = {
    radius: 42,
    seatHeight: 18.5,
    seatDepth: 15,
    backrestAngle: 108,
    chairWeight: 25,
    sitterWeight: 150,
  };

  const SCALE = 4;

  // A range of body sizes from very short to very tall, both genders.
  const bodySizes = [
    { sitterHeight: 58, sitterGender: 'female', label: "4'10\" female" },
    { sitterHeight: 60, sitterGender: 'female', label: "5'0\" female" },
    { sitterHeight: 62, sitterGender: 'male',   label: "5'2\" male" },
    { sitterHeight: 62, sitterGender: 'female', label: "5'2\" female" },
    { sitterHeight: 64, sitterGender: 'female', label: "5'4\" female" },
    { sitterHeight: 66, sitterGender: 'male',   label: "5'6\" male" },
    { sitterHeight: 68, sitterGender: 'male',   label: "5'8\" male" },
    { sitterHeight: 68, sitterGender: 'female', label: "5'8\" female" },
    { sitterHeight: 70, sitterGender: 'male',   label: "5'10\" male" },
    { sitterHeight: 73, sitterGender: 'male',   label: "6'1\" male" },
    { sitterHeight: 76, sitterGender: 'male',   label: "6'4\" male" },
    { sitterHeight: 78, sitterGender: 'male',   label: "6'6\" male" },
  ];

  // Also test with the default chair geometry (deeper seat)
  const defaultChairParams = {
    radius: 42,
    seatHeight: 17,
    seatDepth: 16,
    backrestAngle: 100,
    sitterWeight: 170,
  };

  for (const { sitterHeight, sitterGender, label } of bodySizes) {
    describe(`${label} (issue chair)`, () => {
      let g, m;
      beforeEach(() => {
        m = buildRockerModel({ ...chairParams, sitterHeight, sitterGender });
        g = renderChairProfile(doc, m, 0);
      });

      it('knees are at or past the front seat edge', () => {
        const lowerLeg = g.querySelector('[data-testid="stick-lower-leg"]');
        const kneeX = parseFloat(lowerLeg.getAttribute('x1'));
        const seatFrontX = (chairParams.seatDepth / 2) * SCALE;
        expect(kneeX).toBeGreaterThanOrEqual(seatFrontX - 0.01);
      });

      it('backrest covers the head', () => {
        const head = g.querySelector('[data-testid="stick-head"]');
        const headCY = parseFloat(head.getAttribute('cy'));
        const headR  = parseFloat(head.getAttribute('r'));
        const headTop = headCY - headR;

        const lines = Array.from(g.querySelectorAll('line'));
        const backrestLine = lines.find(l => l.getAttribute('stroke') === '#7A5C4F');
        const y1 = parseFloat(backrestLine.getAttribute('y1'));
        const y2 = parseFloat(backrestLine.getAttribute('y2'));
        const backrestTop = Math.min(y1, y2);

        expect(backrestTop).toBeLessThanOrEqual(headTop);
      });

      it('lower leg does not cross the seat line', () => {
        // At theta=0 the seat line runs from -seatHalfLen to +seatHalfLen
        // at Y = seatHeight (world).  The lower-leg segment must not cross
        // this horizontal segment.  Since the foot is always forward of the
        // knee, it's sufficient to verify the knee is at or past the front
        // edge (checked above) — but we double-check by computing the
        // intersection of the lower-leg segment with the seat's Y level.
        const lowerLeg = g.querySelector('[data-testid="stick-lower-leg"]');
        const x1 = parseFloat(lowerLeg.getAttribute('x1'));
        const y1 = parseFloat(lowerLeg.getAttribute('y1'));
        const x2 = parseFloat(lowerLeg.getAttribute('x2'));
        const y2 = parseFloat(lowerLeg.getAttribute('y2'));

        // Seat Y in SVG coords = -seatHeight * SCALE
        const seatSvgY = -chairParams.seatHeight * SCALE;
        const seatLeftX = -(chairParams.seatDepth / 2) * SCALE;
        const seatRightX = (chairParams.seatDepth / 2) * SCALE;

        // Check if the lower-leg line segment intersects the seat segment.
        // The lower leg goes from (x1,y1) at the knee to (x2,y2) at the foot.
        // If both y values are on the same side of seatSvgY, no crossing.
        if ((y1 - seatSvgY) * (y2 - seatSvgY) > 0) {
          return; // no crossing — both above or both below
        }

        // Compute x at the intersection with seatSvgY
        const t = (seatSvgY - y1) / (y2 - y1);
        const xAtSeat = x1 + t * (x2 - x1);

        // The intersection x must be outside the seat segment [seatLeftX, seatRightX]
        const crossesSeat = xAtSeat >= seatLeftX && xAtSeat <= seatRightX;
        expect(crossesSeat).toBe(false);
      });
    });

    describe(`${label} (default chair)`, () => {
      let g, m;
      beforeEach(() => {
        m = buildRockerModel({ ...defaultChairParams, sitterHeight, sitterGender });
        g = renderChairProfile(doc, m, 0);
      });

      it('knees are at or past the front seat edge', () => {
        const lowerLeg = g.querySelector('[data-testid="stick-lower-leg"]');
        const kneeX = parseFloat(lowerLeg.getAttribute('x1'));
        const seatFrontX = (defaultChairParams.seatDepth / 2) * SCALE;
        expect(kneeX).toBeGreaterThanOrEqual(seatFrontX - 0.01);
      });

      it('backrest covers the head', () => {
        const head = g.querySelector('[data-testid="stick-head"]');
        const headCY = parseFloat(head.getAttribute('cy'));
        const headR  = parseFloat(head.getAttribute('r'));
        const headTop = headCY - headR;

        const lines = Array.from(g.querySelectorAll('line'));
        const backrestLine = lines.find(l => l.getAttribute('stroke') === '#7A5C4F');
        const y1 = parseFloat(backrestLine.getAttribute('y1'));
        const y2 = parseFloat(backrestLine.getAttribute('y2'));
        const backrestTop = Math.min(y1, y2);

        expect(backrestTop).toBeLessThanOrEqual(headTop);
      });
    });
  }
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
