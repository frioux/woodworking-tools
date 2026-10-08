/**
 * Galbert's Rocker Model — UI orchestration
 *
 * Wires form inputs → physics model → animated SVG rendering.
 * Manages the view mode (level / at rest / rocking), animation loop,
 * URL deep linking, and play/pause controls.
 */

import { buildRockerModel, buildFall, POSTURE_PRESETS } from "./rocker-math.js";
import { renderScene, renderInfoPanel } from "./rocker-diagrams.js";

/* ------------------------------------------------------------------ */
/*  DOM references                                                    */
/* ------------------------------------------------------------------ */

const CHAIR_IDS = ["radius", "contact-offset", "seat-height", "seat-depth", "backrest-angle", "chair-weight"];
const SITTER_IDS = ["sitter-weight", "sitter-height", "sitter-gender"];
const POSTURE_IDS = ["posture", "cog-offset-x"];
const ALL_IDS = [...CHAIR_IDS, ...SITTER_IDS, ...POSTURE_IDS];

// URL query-string short keys
const URL_KEYS = {
  "radius": "r",
  "contact-offset": "co",
  "seat-height": "sh",
  "seat-depth": "sd",
  "backrest-angle": "ba",
  "chair-weight": "cw",
  "sitter-weight": "sw",
  "sitter-height": "sth",
  "sitter-gender": "sg",
  "posture": "p",
  "cog-offset-x": "cx",
};

/**
 * How the chair is shown.  Galbert lays a chair out level on its circle,
 * then asks where it comes to rest and how it rocks:
 *   level – the drawing-board view, seat parallel to the floor
 *   rest  – settled at its natural resting tilt
 *   rock  – given a push and left to rock
 */
const VIEW_MODES = ["level", "rest", "rock"];
const VIEW_URL_KEY = "v";

/* ------------------------------------------------------------------ */
/*  State                                                             */
/* ------------------------------------------------------------------ */

let currentModel = null;
let animationId = null;
let animationStart = null;
let playing = false;
let urlTimeout = null;
let currentTheta = 0;
let transitionAmplitude = null;
let currentFall = null; // from buildFall(): the chair is going (or has gone) over
let showDetails = false; // centre of gravity + plumb line, toggled by tapping the radius centre
let viewMode = "level";

/* ------------------------------------------------------------------ */
/*  Input helpers                                                     */
/* ------------------------------------------------------------------ */

function readInputs() {
  const vals = {};
  for (const id of ALL_IDS) {
    const el = document.getElementById(id);
    if (el.type === "number") {
      vals[id] = parseFloat(el.value) || 0;
    } else {
      vals[id] = el.value;
    }
  }
  return vals;
}

function formatFeetInches(totalInches) {
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}' ${inches}"`;
}

function updateHeightDisplay() {
  const display = document.getElementById("sitter-height-display");
  const input = document.getElementById("sitter-height");
  if (display && input) {
    display.textContent = formatFeetInches(parseInt(input.value, 10) || 0);
  }
}

/* ------------------------------------------------------------------ */
/*  Validation                                                        */
/* ------------------------------------------------------------------ */

function clearAllErrors() {
  for (const id of ALL_IDS) {
    const group = document.getElementById(id)?.closest(".form-group");
    if (group) {
      group.classList.remove("has-error");
      const errEl = group.querySelector(".error");
      if (errEl) {
        errEl.textContent = "";
      }
    }
  }
}

function setError(id, msg) {
  const group = document.getElementById(id)?.closest(".form-group");
  if (group) {
    group.classList.add("has-error");
    const errEl = group.querySelector(".error");
    if (errEl) {
      errEl.textContent = msg;
    }
  }
}

function validate(vals) {
  clearAllErrors();
  let ok = true;

  if (vals["radius"] <= 0) {
    setError("radius", "Must be positive");
    ok = false;
  }
  if (vals["seat-height"] <= 0) {
    setError("seat-height", "Must be positive");
    ok = false;
  }
  if (vals["seat-depth"] <= 0) {
    setError("seat-depth", "Must be positive");
    ok = false;
  }
  if (vals["backrest-angle"] < 70 || vals["backrest-angle"] > 135) {
    setError("backrest-angle", "Must be 70–135°");
    ok = false;
  }
  if (vals["seat-height"] >= vals["radius"]) {
    setError("seat-height", "Must be less than radius");
    ok = false;
  }
  if (Math.abs(vals["contact-offset"]) > vals["seat-depth"] / 2) {
    setError("contact-offset", "Must be under the seat");
    ok = false;
  }
  if (vals["sitter-weight"] <= 0) {
    setError("sitter-weight", "Must be positive");
    ok = false;
  }
  if (vals["sitter-height"] <= 0) {
    setError("sitter-height", "Must be positive");
    ok = false;
  }
  return ok;
}

/* ------------------------------------------------------------------ */
/*  URL deep linking                                                  */
/* ------------------------------------------------------------------ */

function buildQueryString() {
  const parts = [];
  for (const id of ALL_IDS) {
    const el = document.getElementById(id);
    const key = URL_KEYS[id];
    parts.push(`${key}=${encodeURIComponent(el.value)}`);
  }
  parts.push(`${VIEW_URL_KEY}=${viewMode}`);
  return "?" + parts.join("&");
}

function pushURL() {
  clearTimeout(urlTimeout);
  urlTimeout = setTimeout(() => {
    const qs = buildQueryString();
    if (window.location.search !== qs) {
      history.pushState(null, "", qs);
    }
  }, 300);
}

function loadFromURL() {
  const params = new URLSearchParams(window.location.search);
  for (const id of ALL_IDS) {
    const key = URL_KEYS[id];
    if (params.has(key)) {
      const el = document.getElementById(id);
      el.value = decodeURIComponent(params.get(key));
    }
  }
  const view = params.get(VIEW_URL_KEY);
  if (VIEW_MODES.includes(view)) {
    viewMode = view;
  }
}

function onPopState() {
  loadFromURL();
  updateHeightDisplay();
  syncPostureFromOffset();
  update(false);
  applyView(0);
}

/* ------------------------------------------------------------------ */
/*  Rendering                                                         */
/* ------------------------------------------------------------------ */

function renderDiagram(theta) {
  renderPose({ theta });
}

/**
 * Draw the chair in a pose: `theta` alone for a chair on its runners, or
 * a full pose from buildFall().poseAt() with its own geometry and a
 * sitter who may be mid-air.  During a fall the picture is sized to fit
 * the end of the fall so the view does not lurch as the chair goes over.
 */
let currentPose = { theta: 0 };

function renderPose(pose) {
  currentPose = pose;
  currentTheta = pose.theta;
  const container = document.getElementById("diagram-container");
  container.innerHTML = "";
  const svg = renderScene(document, currentModel, pose.theta, {
    showDetails,
    geom: pose.geom,
    sitter: pose.sitter,
    fit: currentFall ? [currentFall.finalPose] : undefined,
  });
  container.appendChild(svg);
}

function fallsOver() {
  return Boolean(currentModel && currentModel.fallDirection);
}

function setRockLabel(label) {
  const btn = document.getElementById("view-rock");
  if (btn) {
    btn.textContent = label;
  }
}

function syncViewButtons() {
  for (const mode of VIEW_MODES) {
    const btn = document.getElementById(`view-${mode}`);
    if (btn) {
      btn.setAttribute("aria-pressed", mode === viewMode ? "true" : "false");
    }
  }
}

/**
 * Tapping the rocker radius centre toggles the extra details.  The SVG
 * is rebuilt every frame, so listen on the container and delegate.
 *
 * Use pointerdown rather than click: a click only fires if the press and
 * release land on the same element, and while the animation is running
 * the element under the pointer is replaced many times a second, so
 * clicks were lost mid-rock.  pointerdown fires immediately on whatever
 * is there at the moment of the press.
 */
function wireDetailsToggle() {
  const container = document.getElementById("diagram-container");
  const toggle = () => {
    showDetails = !showDetails;
    if (currentModel) {
      renderPose(currentPose);
    }
  };
  const isMarker = (target) => target?.closest?.('[data-testid="radius-center"]');
  if (window.PointerEvent) {
    container.addEventListener("pointerdown", (e) => {
      // Primary button / first touch only
      if (e.button !== 0 || !e.isPrimary) {
        return;
      }
      if (isMarker(e.target)) {
        e.preventDefault();
        toggle();
      }
    });
  } else {
    container.addEventListener("click", (e) => {
      if (isMarker(e.target)) {
        toggle();
      }
    });
  }
  container.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && isMarker(e.target)) {
      e.preventDefault();
      toggle();
    }
  });
}

function renderInfo() {
  const container = document.getElementById("info-container");
  container.innerHTML = "";
  container.appendChild(renderInfoPanel(document, currentModel));
}

/* ------------------------------------------------------------------ */
/*  Animation loop                                                    */
/* ------------------------------------------------------------------ */

function animationFrame(timestamp) {
  if (!playing || !currentModel) {
    return;
  }
  if (animationStart === null) {
    animationStart = timestamp;
  }
  const elapsed = (timestamp - animationStart) / 1000; // seconds

  if (currentFall) {
    const pose = currentFall.poseAt(elapsed);
    renderPose(pose);
    if (pose.done) {
      // Leave the wreckage on screen; the button offers a replay
      playing = false;
      animationId = null;
      return;
    }
    animationId = requestAnimationFrame(animationFrame);
    return;
  }

  let theta;
  if (transitionAmplitude !== null && currentModel.stable) {
    const envelope = Math.abs(transitionAmplitude) * Math.exp(-4.0 * elapsed);
    // Auto-stop when the oscillation envelope falls below half a degree (~0.009 rad)
    if (envelope < 0.009) {
      renderDiagram(currentModel.thetaEq);
      stopAnimation();
      return;
    }
    // Glide to new equilibrium without rocking: exponential decay, no cosine
    theta = currentModel.thetaEq + Math.sign(transitionAmplitude) * envelope;
  } else {
    theta = currentModel.angleAt(elapsed);
  }

  renderDiagram(theta);
  animationId = requestAnimationFrame(animationFrame);
}

/** Give the chair a push and let it rock about its resting tilt. */
function startRocking() {
  if (!currentModel) {
    return;
  }
  if (fallsOver()) {
    startFall(0);
    return;
  }
  transitionAmplitude = null; // regular play uses model's initialAmplitude
  playing = true;
  animationStart = null;
  setRockLabel("Pause");
  animationId = requestAnimationFrame(animationFrame);
}

/**
 * Let the chair fall over, starting from tilt `fromTheta`.  Plays
 * through to the end on its own; the button then offers a replay.
 */
function startFall(fromTheta) {
  stopAnimation();
  currentFall = buildFall(currentModel, fromTheta);
  if (!currentFall) {
    renderDiagram(currentModel.thetaEq);
    return;
  }
  renderPose(currentFall.poseAt(0));
  playing = true;
  animationStart = null;
  setRockLabel("Replay");
  animationId = requestAnimationFrame(animationFrame);
}

function stopAnimation() {
  playing = false;
  transitionAmplitude = null;
  currentFall = null;
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  setRockLabel(viewMode === "rock" && fallsOver() ? "Replay" : "Rock");
}

/**
 * Let the chair settle from `fromTheta` to its natural resting tilt.
 * The tilt decays toward equilibrium without rocking and the animation
 * stops on its own once it is within ~0.5°.  A chair that cannot rest
 * falls over instead.
 */
function settleFrom(fromTheta) {
  stopAnimation();
  if (!currentModel) {
    return;
  }
  // The chair may have been lying on the floor a moment ago; it can only
  // start from somewhere on its runners.
  fromTheta = Math.max(-currentModel.runnerRearAngle,
    Math.min(currentModel.runnerFrontAngle, fromTheta));
  if (fallsOver() || !currentModel.stable) {
    startFall(fromTheta);
    return;
  }
  const amplitude = fromTheta - currentModel.thetaEq;
  if (Math.abs(amplitude) < 0.009) {
    renderDiagram(currentModel.thetaEq);
    return;
  }
  // Render at the starting position so the animation begins from the correct frame
  renderDiagram(fromTheta);
  transitionAmplitude = amplitude;
  playing = true;
  animationStart = null;
  animationId = requestAnimationFrame(animationFrame);
}

/**
 * Show the chair in the current view mode, starting from tilt
 * `fromTheta` where that matters (settling, falling).
 */
function applyView(fromTheta) {
  syncViewButtons();
  if (!currentModel) {
    stopAnimation();
    return;
  }
  switch (viewMode) {
    case "rest":
      settleFrom(fromTheta);
      break;
    case "rock":
      stopAnimation();
      startRocking();
      break;
    default:
      // On the drawing board: held level, even if it could not stand
      stopAnimation();
      renderDiagram(0);
  }
}

function setViewMode(mode) {
  const prevTheta = currentTheta;
  if (mode === "rock" && viewMode === "rock") {
    // Second press: pause the rock, or replay a fall
    if (playing && !currentFall) {
      stopAnimation();
      return;
    }
    stopAnimation();
    startRocking();
    return;
  }
  viewMode = mode;
  applyView(prevTheta);
  pushURL();
}

/* ------------------------------------------------------------------ */
/*  Main update                                                       */
/* ------------------------------------------------------------------ */

function update(updateURL = true) {
  const vals = readInputs();
  if (!validate(vals)) {
    currentModel = null;
    stopAnimation();
    return;
  }

  currentModel = buildRockerModel({
    radius: vals["radius"],
    seatHeight: vals["seat-height"],
    seatDepth: vals["seat-depth"],
    backrestAngle: vals["backrest-angle"],
    chairWeight: vals["chair-weight"],
    contactOffset: vals["contact-offset"],
    sitterWeight: vals["sitter-weight"],
    sitterHeight: vals["sitter-height"],
    sitterGender: vals["sitter-gender"],
    cogOffsetX: vals["cog-offset-x"],
    posture: vals["posture"],
  });

  renderInfo();
  // Draw a level first frame; the caller decides how to animate from here.
  currentFall = null;
  renderDiagram(0);

  if (updateURL) {
    pushURL();
  }
}

/* ------------------------------------------------------------------ */
/*  Stepper buttons                                                   */
/* ------------------------------------------------------------------ */

function wireSteppers() {
  for (const btn of document.querySelectorAll(".step-btn")) {
    btn.addEventListener("click", () => {
      const input = btn.parentElement.querySelector("input[type=number]");
      if (!input) {
        return;
      }
      if (btn.classList.contains("step-up")) {
        input.stepUp();
      } else {
        input.stepDown();
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Posture ↔ CoG offset wiring                                      */
/* ------------------------------------------------------------------ */

function applyPosture(key) {
  const preset = POSTURE_PRESETS[key];
  if (!preset) {
    return;
  }
  const offsetEl = document.getElementById("cog-offset-x");
  offsetEl.value = preset.cogOffsetX;
}

function syncPostureFromOffset() {
  const offsetVal = parseFloat(document.getElementById("cog-offset-x").value) || 0;
  const match = Object.entries(POSTURE_PRESETS).find(
    ([, p]) => p.cogOffsetX === offsetVal
  );
  const postureEl = document.getElementById("posture");
  postureEl.value = match ? match[0] : "custom";
}

/* ------------------------------------------------------------------ */
/*  Init                                                              */
/* ------------------------------------------------------------------ */

function init() {
  loadFromURL();
  updateHeightDisplay();

  // Sync posture dropdown from the loaded cogOffsetX
  syncPostureFromOffset();

  // Wire all inputs
  // <select> elements fire "change" reliably across all browsers;
  // "input" on <select> is not supported in older Safari / Firefox.
  for (const id of ALL_IDS) {
    const el = document.getElementById(id);
    const evt = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(evt, () => {
      const prevTheta = currentTheta;

      // Posture dropdown → set offset, then update
      if (id === "posture") {
        applyPosture(el.value);
      }
      // Manual offset change → switch posture to Custom
      if (id === "cog-offset-x") {
        syncPostureFromOffset();
      }
      update();
      // Keep showing the chair the same way; when it is at rest, let it
      // roll from where it was to its new resting point.
      applyView(prevTheta);
    });
  }

  wireSteppers();
  wireDetailsToggle();

  document.getElementById("sitter-height").addEventListener("input", updateHeightDisplay);

  // View mode buttons
  for (const mode of VIEW_MODES) {
    const btn = document.getElementById(`view-${mode}`);
    if (btn) {
      btn.addEventListener("click", () => setViewMode(mode));
    }
  }

  // Browser navigation
  window.addEventListener("popstate", onPopState);

  // Initial render in the requested view
  update();
  applyView(0);

  // Set initial URL if none
  if (!window.location.search) {
    const qs = buildQueryString();
    history.replaceState(null, "", qs);
  }
}

init();
