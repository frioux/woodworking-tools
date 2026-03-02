/**
 * Galbert's Rocker Model — UI orchestration
 *
 * Wires form inputs → physics model → animated SVG rendering.
 * Manages animation loop, URL deep linking, and play/pause controls.
 */

import { buildRockerModel, POSTURE_PRESETS, rockingAngle } from "./rocker-math.js";
import { renderScene, renderInfoPanel } from "./rocker-diagrams.js";

/* ------------------------------------------------------------------ */
/*  DOM references                                                    */
/* ------------------------------------------------------------------ */

const CHAIR_IDS = ["radius", "seat-height", "seat-depth", "backrest-angle", "chair-weight"];
const SITTER_IDS = ["sitter-weight", "sitter-height", "sitter-gender"];
const POSTURE_IDS = ["posture", "cog-offset-x"];
const ALL_IDS = [...CHAIR_IDS, ...SITTER_IDS, ...POSTURE_IDS];

// URL query-string short keys
const URL_KEYS = {
  "radius": "r",
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
}

function onPopState() {
  loadFromURL();
  updateHeightDisplay();
  syncPostureFromOffset();
  update(false);
  restartAnimation();
}

/* ------------------------------------------------------------------ */
/*  Rendering                                                         */
/* ------------------------------------------------------------------ */

function renderDiagram(theta) {
  currentTheta = theta;
  const container = document.getElementById("diagram-container");
  container.innerHTML = "";
  const svg = renderScene(document, currentModel, theta);
  container.appendChild(svg);
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

  let theta;
  if (transitionAmplitude !== null && currentModel.stable) {
    theta = currentModel.thetaEq + rockingAngle(elapsed, transitionAmplitude, currentModel.lEff, currentModel.damping);
    // Auto-stop when the oscillation envelope falls below half a degree (~0.009 rad)
    const omega = 2 * Math.PI / currentModel.period;
    const envelope = Math.abs(transitionAmplitude) * Math.exp(-currentModel.damping * omega * elapsed);
    if (envelope < 0.009) {
      renderDiagram(currentModel.thetaEq);
      stopAnimation();
      return;
    }
  } else {
    theta = currentModel.angleAt(elapsed);
  }

  renderDiagram(theta);
  animationId = requestAnimationFrame(animationFrame);
}

function startAnimation() {
  if (!currentModel) {
    return;
  }
  transitionAmplitude = null; // regular play uses model's initialAmplitude
  playing = true;
  animationStart = null;
  const btn = document.getElementById("play-btn");
  if (btn) {
    btn.textContent = "Pause";
  }
  animationId = requestAnimationFrame(animationFrame);
}

function stopAnimation() {
  playing = false;
  transitionAmplitude = null;
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  const btn = document.getElementById("play-btn");
  if (btn) {
    btn.textContent = "Rock";
  }
}

function restartAnimation() {
  stopAnimation();
  if (currentModel) {
    renderDiagram(currentModel.thetaEq);
  }
}

function togglePlay() {
  if (playing) {
    stopAnimation();
  } else {
    startAnimation();
  }
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
    sitterWeight: vals["sitter-weight"],
    sitterHeight: vals["sitter-height"],
    sitterGender: vals["sitter-gender"],
    cogOffsetX: vals["cog-offset-x"],
  });

  renderInfo();
  renderDiagram(currentModel.thetaEq);

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
/*  Posture / CoG transition animation                               */
/* ------------------------------------------------------------------ */

/**
 * Animate the chair settling from `fromTheta` to the new equilibrium.
 * The chair rocks with decaying oscillations, starting at `fromTheta`,
 * and auto-stops once the oscillation amplitude falls below ~0.5°.
 * Falls back to restartAnimation() when the change is negligible or
 * the model is unstable.
 */
function animatePostureChange(fromTheta) {
  if (!currentModel || !currentModel.stable) {
    restartAnimation();
    return;
  }
  const amplitude = fromTheta - currentModel.thetaEq;
  if (Math.abs(amplitude) < 0.009) {
    restartAnimation();
    return;
  }
  // Render at the starting position so the animation begins from the correct frame
  renderDiagram(fromTheta);
  stopAnimation();
  transitionAmplitude = amplitude;
  playing = true;
  animationStart = null;
  const btn = document.getElementById("play-btn");
  if (btn) {
    btn.textContent = "Pause";
  }
  animationId = requestAnimationFrame(animationFrame);
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

      if (id === "posture" || id === "cog-offset-x") {
        animatePostureChange(prevTheta);
      } else {
        restartAnimation();
      }
    });
  }

  wireSteppers();

  document.getElementById("sitter-height").addEventListener("input", updateHeightDisplay);

  // Play/pause button
  const playBtn = document.getElementById("play-btn");
  if (playBtn) {
    playBtn.addEventListener("click", togglePlay);
  }

  // Browser navigation
  window.addEventListener("popstate", onPopState);

  // Initial render
  update();

  // Set initial URL if none
  if (!window.location.search) {
    const qs = buildQueryString();
    history.replaceState(null, "", qs);
  }
}

init();
