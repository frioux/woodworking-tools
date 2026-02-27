/**
 * Galbert's Rocker Model — UI orchestration
 *
 * Wires form inputs → physics model → animated SVG rendering.
 * Manages animation loop, URL deep linking, and play/pause controls.
 */

import { buildRockerModel } from "./rocker-math.js";
import { renderScene, renderInfoPanel } from "./rocker-diagrams.js";

/* ------------------------------------------------------------------ */
/*  DOM references                                                    */
/* ------------------------------------------------------------------ */

const CHAIR_IDS = ["radius", "seat-height", "seat-depth", "chair-weight"];
const SITTER_IDS = ["sitter-weight", "sitter-height", "sitter-gender"];
const ALL_IDS = [...CHAIR_IDS, ...SITTER_IDS];

// URL query-string short keys
const URL_KEYS = {
  "radius": "r",
  "seat-height": "sh",
  "seat-depth": "sd",
  "chair-weight": "cw",
  "sitter-weight": "sw",
  "sitter-height": "sth",
  "sitter-gender": "sg",
};

/* ------------------------------------------------------------------ */
/*  State                                                             */
/* ------------------------------------------------------------------ */

let currentModel = null;
let animationId = null;
let animationStart = null;
let playing = false;
let urlTimeout = null;

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
  update(false);
  restartAnimation();
}

/* ------------------------------------------------------------------ */
/*  Rendering                                                         */
/* ------------------------------------------------------------------ */

function renderDiagram(theta) {
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
  const theta = currentModel.angleAt(elapsed);
  renderDiagram(theta);
  animationId = requestAnimationFrame(animationFrame);
}

function startAnimation() {
  if (!currentModel) {
    return;
  }
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
    renderDiagram(0);
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
    chairWeight: vals["chair-weight"],
    sitterWeight: vals["sitter-weight"],
    sitterHeight: vals["sitter-height"],
    sitterGender: vals["sitter-gender"],
  });

  renderInfo();
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
/*  Init                                                              */
/* ------------------------------------------------------------------ */

function init() {
  loadFromURL();

  // Wire all inputs
  for (const id of ALL_IDS) {
    const el = document.getElementById(id);
    el.addEventListener("input", () => {
      update();
      restartAnimation();
    });
  }

  wireSteppers();

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
