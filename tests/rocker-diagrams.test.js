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
    const g = renderChairProfile(doc, model, 0, { showDetails: true });
    const circles = g.querySelectorAll('circle');
    // CoG + contact = 2
    expect(circles.length).toBeGreaterThanOrEqual(2);
  });

  it('hides the centre of gravity until details are requested', () => {
    const plain = renderChairProfile(doc, model, 0);
    expect(plain.querySelector('[data-testid="cog"]')).toBeNull();
    expect(plain.querySelector('[data-testid="radius-center"]').getAttribute('aria-pressed')).toBe('false');

    const detailed = renderChairProfile(doc, model, 0, { showDetails: true });
    expect(detailed.querySelector('[data-testid="cog"]')).toBeTruthy();
    expect(detailed.querySelector('[data-testid="radius-center"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('labels the centre of gravity in full', () => {
    const g = renderChairProfile(doc, model, 0, { showDetails: true });
    const texts = g.querySelectorAll('text');
    const cogText = Array.from(texts).find(t => t.textContent === 'Center of gravity');
    expect(cogText).toBeTruthy();
  });

  it('marks the rocker contact point on the floor without a label', () => {
    const g = renderChairProfile(doc, model, 0.1);
    const contact = g.querySelector('[data-testid="contact-point"]');
    expect(contact).toBeTruthy();
    expect(contact.querySelector('text')).toBeNull();
    // The dot sits on the floor at x = R·θ (world inches)
    const dot = contact.querySelector('circle');
    expect(parseFloat(dot.getAttribute('cx'))).toBeCloseTo(42 * 0.1 * 4, 5);
    expect(parseFloat(dot.getAttribute('cy'))).toBe(0);
  });

  it('drops a plumb line from the centre of gravity to the floor', () => {
    const g = renderChairProfile(doc, model, 0.1, { showDetails: true });
    const cog = g.querySelector('[data-testid="cog"]');
    const plumb = cog.querySelector('line');
    const circle = cog.querySelector('circle');
    expect(plumb.getAttribute('x1')).toBe(plumb.getAttribute('x2'));
    expect(plumb.getAttribute('x1')).toBe(circle.getAttribute('cx'));
    expect(parseFloat(plumb.getAttribute('y2'))).toBe(0);
  });

  it('shows only the marker and a hint until details are requested', () => {
    const g = renderChairProfile(doc, model, 0);
    const rc = g.querySelector('[data-testid="radius-center"]');
    expect(rc.querySelector('[data-testid="radius-line"]')).toBeNull();
    const texts = Array.from(rc.querySelectorAll('text')).map(t => t.textContent);
    expect(texts).toEqual(['tap for details']);
    // The crosshair marker itself is still drawn
    expect(rc.querySelectorAll('line').length).toBe(2);
  });

  it('marks the rocker radius centre directly above the contact point', () => {
    const theta = 0.2;
    const g = renderChairProfile(doc, model, theta, { showDetails: true });
    const rc = g.querySelector('[data-testid="radius-center"]');
    expect(rc).toBeTruthy();
    const texts = Array.from(rc.querySelectorAll('text')).map(t => t.textContent);
    expect(texts.some(t => /radius center/i.test(t))).toBe(true);
    expect(texts).toContain('R = 42 in');
    expect(texts).toContain('tap to hide details');
    const radiusLine = rc.querySelector('[data-testid="radius-line"]');
    expect(radiusLine).toBeTruthy();
    expect(parseFloat(radiusLine.getAttribute('x2'))).toBeCloseTo(42 * theta * 4, 5);
    expect(parseFloat(radiusLine.getAttribute('y2'))).toBe(0);

    // The centre marker circle sits at (R·θ, R) in world inches → SVG (x·4, −y·4)
    const circle = rc.querySelector('circle');
    expect(parseFloat(circle.getAttribute('cx'))).toBeCloseTo(42 * theta * 4, 5);
    expect(parseFloat(circle.getAttribute('cy'))).toBeCloseTo(-42 * 4, 5);
  });

  it('draws a dotted centreline from the rocker to the seat, labelled ℄', () => {
    const g = renderChairProfile(doc, model, 0);
    const cl = g.querySelector('[data-testid="centerline"]');
    expect(cl).toBeTruthy();
    const ln = cl.querySelector('line');
    expect(ln.getAttribute('stroke-dasharray')).toBeTruthy();
    // At θ = 0 the centreline is vertical at x = 0, from the floor (arc
    // bottom) up to the seat.
    expect(parseFloat(ln.getAttribute('x1'))).toBeCloseTo(0, 5);
    expect(parseFloat(ln.getAttribute('x2'))).toBeCloseTo(0, 5);
    const ys = [parseFloat(ln.getAttribute('y1')), parseFloat(ln.getAttribute('y2'))].sort((a, b) => a - b);
    expect(ys[1]).toBeCloseTo(0, 5);                        // rocker surface / floor
    expect(ys[0]).toBeCloseTo(-defaults.seatHeight * 4, 5); // seat
    expect(cl.querySelector('text').textContent).toBe('\u2104');
  });

  it('rotates the centreline with the chair', () => {
    // Positive θ rocks the chair forward (the rolling body rotates
    // clockwise), so the seat end of the centreline lies ahead of the
    // rocker end; negative θ rocks it back and the seat end lies aft.
    const ends = (theta) => {
      const ln = renderChairProfile(doc, model, theta).querySelector('[data-testid="centerline"] line');
      return [parseFloat(ln.getAttribute('x1')), parseFloat(ln.getAttribute('x2'))]; // [rocker, seat]
    };
    const [fwdBot, fwdTop] = ends(0.2);
    expect(fwdTop).toBeGreaterThan(fwdBot + 1);
    const [backBot, backTop] = ends(-0.2);
    expect(backTop).toBeLessThan(backBot - 1);
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

  it('sitter leans back further as the backrest reclines', () => {
    // The torso should rest against the backrest, so a more reclined
    // backrest moves the head further aft (more negative SVG x) and the
    // head must stay in front of (not behind) the backrest line.
    const headX = (backrestAngle) => {
      const m = buildRockerModel({ ...defaults, backrestAngle });
      const g = renderChairProfile(doc, m, 0);
      const head = g.querySelector('[data-testid="stick-head"]');
      return parseFloat(head.getAttribute('cx'));
    };
    const x90 = headX(90);
    const x100 = headX(100);
    const x120 = headX(120);
    expect(x100).toBeLessThan(x90 - 1);
    expect(x120).toBeLessThan(x100 - 1);

    // At 90° the backrest is vertical at the rear seat edge; the head
    // (including its radius) must sit in front of it.
    const m90 = buildRockerModel({ ...defaults, backrestAngle: 90 });
    const g90 = renderChairProfile(doc, m90, 0);
    const head90 = g90.querySelector('[data-testid="stick-head"]');
    const cx = parseFloat(head90.getAttribute('cx'));
    const r = parseFloat(head90.getAttribute('r'));
    const backrestX = -(defaults.seatDepth / 2) * 4; // SCALE = 4
    expect(cx - r).toBeGreaterThanOrEqual(backrestX - 0.01);
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
/*  Posture poses                                                     */
/* ------------------------------------------------------------------ */
describe('posture poses', () => {
  const attr = (posture, selector, name) => {
    const m = buildRockerModel({ ...defaults, posture });
    const g = renderChairProfile(doc, m, 0);
    return parseFloat(g.querySelector(selector).getAttribute(name));
  };

  it('legs forward swings the feet forward', () => {
    const neutralFoot = attr('neutral', '[data-testid="stick-lower-leg"]', 'x2');
    const forwardFoot = attr('legsForward', '[data-testid="stick-lower-leg"]', 'x2');
    expect(forwardFoot).toBeGreaterThan(neutralFoot + 4 * 4); // > 4 inches
  });

  it('leaning forward tips the head forward of the neutral position', () => {
    const neutralHead = attr('neutral', '[data-testid="stick-head"]', 'cx');
    const forwardHead = attr('leaningForward', '[data-testid="stick-head"]', 'cx');
    expect(forwardHead).toBeGreaterThan(neutralHead + 4 * 4);
  });

  it('arms back puts the hands behind the shoulders', () => {
    const shoulderX = attr('armsBack', '[data-testid="stick-upper-arm"]', 'x1');
    const handX = attr('armsBack', '[data-testid="stick-forearm"]', 'x2');
    const neutralHandX = attr('neutral', '[data-testid="stick-forearm"]', 'x2');
    expect(handX).toBeLessThan(shoulderX);
    expect(neutralHandX).toBeGreaterThan(shoulderX);
  });

  it('reclined slides the hips and knees forward', () => {
    const neutralKnee = attr('neutral', '[data-testid="stick-lower-leg"]', 'x1');
    const reclinedKnee = attr('reclined', '[data-testid="stick-lower-leg"]', 'x1');
    expect(reclinedKnee).toBeCloseTo(neutralKnee + 3 * 4, 5);
  });

  it('reclined still keeps the head in front of the backrest', () => {
    const m = buildRockerModel({ ...defaults, posture: 'reclined', backrestAngle: 90 });
    const g = renderChairProfile(doc, m, 0);
    const head = g.querySelector('[data-testid="stick-head"]');
    const cx = parseFloat(head.getAttribute('cx'));
    const r = parseFloat(head.getAttribute('r'));
    expect(cx - r).toBeGreaterThanOrEqual(-(defaults.seatDepth / 2) * 4 - 0.1);
  });

  it('unknown or custom postures draw the neutral pose', () => {
    const neutral = renderChairProfile(doc, buildRockerModel({ ...defaults, posture: 'neutral' }), 0);
    const custom = renderChairProfile(doc, buildRockerModel({ ...defaults, posture: 'custom' }), 0);
    expect(custom.innerHTML).toBe(neutral.innerHTML);
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

  it('keeps the same viewBox when the radius changes', () => {
    // The image size must stay static as the radius is adjusted so the
    // data table below the diagram does not jump around.
    const vb = (radius) =>
      renderScene(doc, buildRockerModel({ ...defaults, radius }), 0).getAttribute('viewBox');
    expect(vb(30)).toBe(vb(42));
    expect(vb(42)).toBe(vb(55));
  });

  it('keeps the same viewBox at different tilt angles', () => {
    const vb0 = renderScene(doc, model, 0).getAttribute('viewBox');
    const vb1 = renderScene(doc, model, 0.2).getAttribute('viewBox');
    expect(vb0).toBe(vb1);
  });

  it('grows the viewBox to keep a very large radius centre in view', () => {
    const big = buildRockerModel({ ...defaults, radius: 90, seatHeight: 17 });
    const vb = renderScene(doc, big, 0).getAttribute('viewBox').split(' ').map(Number);
    // vbY is -top * SCALE; top must be above the arc centre at y = radius.
    expect(-vb[1] / 4).toBeGreaterThan(90);
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

  it('passes the details option through to the chair profile', () => {
    expect(renderScene(doc, model, 0).querySelector('[data-testid="cog"]')).toBeNull();
    expect(renderScene(doc, model, 0, { showDetails: true }).querySelector('[data-testid="cog"]')).toBeTruthy();
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

  it('reports the natural tilt direction to match the drawing', () => {
    // A CoG well ahead of seat centre rolls the chair forward (positive
    // θ in rockerGeometry); well behind rolls it back.
    const fwd = buildRockerModel({ ...defaults, cogOffsetX: 6 });
    expect(fwd.thetaEq).toBeGreaterThan(0);
    expect(renderInfoPanel(doc, fwd).textContent).toMatch(/Natural tilt[^°]*°\s*\(fwd\)/);
    const back = buildRockerModel({ ...defaults, cogOffsetX: -6 });
    expect(back.thetaEq).toBeLessThan(0);
    expect(renderInfoPanel(doc, back).textContent).toMatch(/Natural tilt[^°]*°\s*\(back\)/);
    // The magnitude is shown unsigned; the word carries the direction
    expect(renderInfoPanel(doc, back).textContent).toMatch(/Natural tilt\d+\.\d°/);
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
