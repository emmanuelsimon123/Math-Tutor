// ============================================================
// CONFIG
// Change WORKER_BASE_URL to match your Cloudflare Worker deployment URL.
// See worker/README.md for setup instructions.
// ============================================================
const WORKER_BASE_URL = "https://ai-math-tutor-worker.emmanuel-simon.workers.dev";
const WORKER_URL = WORKER_BASE_URL + "/solve";
const AUTH_URL   = WORKER_BASE_URL + "/auth";

// ============================================================
// DOM REFERENCES
// ============================================================
const loginOverlay          = document.getElementById("login-overlay");
const loginForm             = document.getElementById("login-form");
const loginPassword         = document.getElementById("login-password");
const loginError            = document.getElementById("login-error");
const appContainer          = document.getElementById("app-container");
const loadingOverlay        = document.getElementById("loading-overlay");
const darkToggleBtn         = document.getElementById("dark-toggle");
const chat                  = document.getElementById("chat");
const form                  = document.getElementById("chat-form");
const userInput             = document.getElementById("user-input");
const sendButton            = document.getElementById("send-button");
const clearButton           = document.getElementById("clear-button");
const downloadButton        = document.getElementById("download-button");
const statusDiv             = document.getElementById("status");
const fileInput             = document.getElementById("image-file-input");
const uploadButton          = document.getElementById("image-upload-btn");
const imagePreviewContainer = document.getElementById("image-preview-container");
const imagePreviewImg       = document.getElementById("image-preview");
const removeImageButton     = document.getElementById("remove-image-btn");

// ============================================================
// DARK MODE
// ============================================================
function applyDarkMode(dark) {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  localStorage.setItem("mathTutorTheme", dark ? "dark" : "light");
  darkToggleBtn.textContent = dark ? "\u2600\uFE0F" : "\uD83C\uDF19";
  darkToggleBtn.title = dark ? "Switch to light mode" : "Switch to dark mode";
  darkToggleBtn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
}

// Initialise theme: prefer saved setting, otherwise follow system preference.
(function initTheme() {
  const saved = localStorage.getItem("mathTutorTheme");
  if (saved) {
    applyDarkMode(saved === "dark");
  } else {
    applyDarkMode(window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
})();

darkToggleBtn.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  applyDarkMode(!isDark);
});

// ============================================================
// AUTH / LOGIN
// ============================================================
// The class password is intentionally stored in sessionStorage so that students
// don't have to re-enter it on every page refresh within the same tab.
// sessionStorage is automatically cleared when the tab is closed and is not
// accessible from other origins, making it an acceptable choice for this
// low-sensitivity, school-classroom use case.
let storedPassword = sessionStorage.getItem("mathTutorPassword") || "";

async function attemptLogin(password) {
  try {
    const response = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    if (response.ok) {
      storedPassword = password;
      sessionStorage.setItem("mathTutorPassword", password);
      loginOverlay.style.display = "none";
      if (loadingOverlay) loadingOverlay.style.display = "none";
      appContainer.style.display = "";
      restoreChatHistory();
      userInput.focus();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const pw = loginPassword.value.trim();
  if (!pw) return;
  loginError.textContent = "";
  const success = await attemptLogin(pw);
  if (!success) {
    loginError.textContent = "Incorrect password. Please try again.";
    loginPassword.value = "";
    loginPassword.focus();
  }
});

// Auto-login if a password was saved in this browser session.
// Show a loading overlay instead of a blank page.
if (storedPassword) {
  if (loadingOverlay) loadingOverlay.style.display = "flex";
  loginOverlay.style.display = "none";
  attemptLogin(storedPassword).then(success => {
    if (!success) {
      sessionStorage.removeItem("mathTutorPassword");
      storedPassword = "";
      if (loadingOverlay) loadingOverlay.style.display = "none";
      loginOverlay.style.display = "flex";
    }
  });
}

// ============================================================
// CHAT HISTORY PERSISTENCE
// ============================================================
const MAX_HISTORY = 20;
let messages = [];

function saveChatHistory() {
  try {
    sessionStorage.setItem("mathTutorMessages", JSON.stringify(messages));
  } catch {
    // Storage quota exceeded — silently continue.
  }
}

function restoreChatHistory() {
  try {
    const stored = sessionStorage.getItem("mathTutorMessages");
    if (!stored) return;
    const saved = JSON.parse(stored);
    if (!Array.isArray(saved) || saved.length === 0) return;
    messages = saved;
    // Clear the default welcome message and re-render saved conversation.
    while (chat.firstChild) chat.removeChild(chat.firstChild);
    messages.forEach(msg => renderMessageBubble(msg.role, msg.content));
  } catch {
    // Corrupted storage — start fresh.
  }
}

// ============================================================
// KATEX
// ============================================================
const KATEX_DELIMITERS = [
  { left: "$$", right: "$$",   display: true  },
  { left: "$",  right: "$",    display: false },
  { left: "\\[", right: "\\]", display: true  },
  { left: "\\(", right: "\\)", display: false }
];

function applyKatex(el) {
  if (typeof renderMathInElement === "function") {
    renderMathInElement(el, { delimiters: KATEX_DELIMITERS, throwOnError: false });
  }
}

// ============================================================
// GRAPH UTILITIES
// ============================================================
let graphCounter = 0;

// ============================================================
// TRIANGLE DIAGRAM UTILITIES
// ============================================================

/**
 * Parses a [TRIANGLE: ...] tag body into a key/value parameter object.
 * Example input: "a=1, b=√3, c=2, A=30°, B=60°, C=90°"
 * Returns: { a: "1", b: "√3", c: "2", A: "30°", B: "60°", C: "90°" }
 */
function parseTriangleParams(raw) {
  const params = {};
  for (const pair of raw.split(",")) {
    const m = pair.trim().match(/^([a-zA-Z]+)\s*=\s*(.+)$/);
    if (m) params[m[1]] = m[2].trim();
  }
  return params;
}

/**
 * Parses a triangle parameter value to a number.
 * Handles plain numbers, √n, m√n, and simple fractions like 1/2.
 * Returns NaN if the value cannot be parsed numerically.
 */
function parseTriangleNum(s) {
  if (!s) return NaN;
  s = String(s).replace(/°$/, "").trim();
  // m√n  (e.g. "2√3", "√2", "3√5")
  const sqrtMatch = s.match(/^(\d*\.?\d*)√(\d+\.?\d*)$/);
  if (sqrtMatch) {
    const coefficient = sqrtMatch[1] ? parseFloat(sqrtMatch[1]) : 1;
    return coefficient * Math.sqrt(parseFloat(sqrtMatch[2]));
  }
  // Simple fraction (e.g. "1/2")
  const fracMatch = s.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) return parseFloat(fracMatch[1]) / parseFloat(fracMatch[2]);
  return parseFloat(s);
}

/**
 * Builds an inline SVG element representing a labeled right triangle.
 *
 * Geometric convention (matches standard geometry textbooks):
 *   - C is the right-angle vertex (marked with a square corner symbol)
 *   - A and B are the two acute-angle vertices
 *   - a = side BC (the leg opposite angle A)
 *   - b = side AC (the leg opposite angle B)
 *   - c = side AB (the hypotenuse, opposite the right angle C)
 *
 * For visual clarity, C is placed at the bottom-left, A at the bottom-right,
 * and B at the top-left, so the right angle is in the lower-left corner.
 *
 * @param {Object} params - keys: a, b, c (side labels), A, B, C (angle labels)
 * @returns {SVGElement}
 */
function drawTriangleSVG(params) {
  const aNum = parseTriangleNum(params.a);
  const bNum = parseTriangleNum(params.b);

  const SVG_W = 280;
  const SVG_H = 200;
  const PAD   = 44; // space around triangle for labels

  const drawW = SVG_W - 2 * PAD; // 192 px available
  const drawH = SVG_H - 2 * PAD; // 112 px available

  let aPx, bPx; // pixel lengths of the two legs
  if (!isNaN(aNum) && !isNaN(bNum) && aNum > 0 && bNum > 0) {
    const scale = Math.min(drawW / bNum, drawH / aNum);
    aPx = aNum * scale;
    bPx = bNum * scale;
  } else if (!isNaN(aNum) && aNum > 0 && isNaN(bNum)) {
    // Only vertical leg known — fill available height and use a reasonable width
    aPx = drawH;
    bPx = drawW;
  } else if (!isNaN(bNum) && bNum > 0 && isNaN(aNum)) {
    // Only horizontal leg known — fill available width and use a reasonable height
    aPx = drawH;
    bPx = drawW;
  } else {
    // No numeric side info — draw a sensible default shape
    aPx = drawH * 0.7;
    bPx = drawW * 0.8;
  }

  // Centre the drawing within the canvas
  const xOff = PAD + (drawW - bPx) / 2;
  const yOff = PAD + (drawH - aPx) / 2;

  // Vertex coordinates (SVG y increases downward)
  const vC = { x: xOff,        y: yOff + aPx }; // right-angle vertex (bottom-left)
  const vA = { x: xOff + bPx,  y: yOff + aPx }; // bottom-right
  const vB = { x: xOff,        y: yOff        }; // top-left

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width",   SVG_W);
  svg.setAttribute("height",  SVG_H);
  svg.setAttribute("viewBox", `0 0 ${SVG_W} ${SVG_H}`);
  svg.setAttribute("class",   "triangle-svg");

  // Triangle outline
  const poly = document.createElementNS(svgNS, "polygon");
  poly.setAttribute("points", `${vC.x},${vC.y} ${vA.x},${vA.y} ${vB.x},${vB.y}`);
  poly.setAttribute("fill",         "none");
  poly.setAttribute("stroke",       "currentColor");
  poly.setAttribute("stroke-width", "2");
  svg.appendChild(poly);

  // Right-angle square marker at C
  const sq = 10;
  const sqPath = document.createElementNS(svgNS, "path");
  sqPath.setAttribute("d",
    `M ${vC.x},${vC.y - sq} L ${vC.x + sq},${vC.y - sq} L ${vC.x + sq},${vC.y}`);
  sqPath.setAttribute("fill",         "none");
  sqPath.setAttribute("stroke",       "currentColor");
  sqPath.setAttribute("stroke-width", "1.5");
  svg.appendChild(sqPath);

  // Helper — append a <text> element
  function addText(x, y, text, anchor, fill) {
    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x",                x);
    t.setAttribute("y",                y);
    t.setAttribute("text-anchor",      anchor || "middle");
    t.setAttribute("dominant-baseline","auto");
    t.setAttribute("font-family",      "monospace");
    t.setAttribute("font-size",        "13");
    if (fill) t.setAttribute("fill", fill);
    t.textContent = text;
    svg.appendChild(t);
  }

  // Side labels
  if (params.a) {
    // Side a = BC: left vertical leg — label to the left
    addText(vC.x - 8, (vC.y + vB.y) / 2, `a = ${params.a}`, "end");
  }
  if (params.b) {
    // Side b = AC: bottom horizontal leg — label below
    addText((vC.x + vA.x) / 2, vC.y + 18, `b = ${params.b}`, "middle");
  }
  if (params.c) {
    // Side c = AB: hypotenuse — label offset perpendicular to the line
    const midX = (vA.x + vB.x) / 2;
    const midY = (vA.y + vB.y) / 2;
    const dx = vB.x - vA.x;
    const dy = vB.y - vA.y;
    const len = Math.hypot(dx, dy);
    const perpX = (-dy / len) * 18;
    const perpY = ( dx / len) * 18;
    addText(midX + perpX, midY + perpY + 5, `c = ${params.c}`, "middle");
  }

  // Angle labels (rendered in blue to distinguish from side labels)
  if (params.A) {
    // Angle A at bottom-right vertex — label slightly up and left
    addText(vA.x - 14, vA.y - 8, params.A, "end", "#2563eb");
  }
  if (params.B) {
    // Angle B at top-left vertex — label slightly right and down
    addText(vB.x + 8, vB.y + 18, params.B, "start", "#2563eb");
  }
  if (params.C) {
    // Angle C at bottom-left (right-angle) vertex — label next to the square
    addText(vC.x + 16, vC.y - 16, params.C, "start", "#2563eb");
  }

  return svg;
}

// ============================================================
// SHAPE DIAGRAM UTILITIES
// ============================================================

/**
 * Parses a [SHAPE: ...] tag body into a key/value parameter object.
 * Example input: "type=polygon, sides=6, label=Regular Hexagon"
 * Returns: { type: "polygon", sides: "6", label: "Regular Hexagon" }
 */
function parseShapeParams(raw) {
  const params = {};
  // Support values with spaces (e.g. label=Regular Hexagon)
  for (const pair of raw.split(",")) {
    const m = pair.trim().match(/^([a-zA-Z_]+)\s*=\s*(.+)$/);
    if (m) params[m[1].trim()] = m[2].trim();
  }
  return params;
}

/**
 * Shared SVG setup helper — creates a 280×200 SVG element.
 */
function makeSVG() {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width",   "280");
  svg.setAttribute("height",  "200");
  svg.setAttribute("viewBox", "0 0 280 200");
  svg.setAttribute("class",   "shape-svg");
  return { svg, svgNS };
}

/**
 * Appends a <text> element to an SVG.
 */
function svgText(svgNS, svg, x, y, text, anchor, opts) {
  const t = document.createElementNS(svgNS, "text");
  t.setAttribute("x", x);
  t.setAttribute("y", y);
  t.setAttribute("text-anchor", anchor || "middle");
  t.setAttribute("dominant-baseline", "auto");
  t.setAttribute("font-family", "monospace");
  t.setAttribute("font-size", (opts && opts.fontSize) || "13");
  if (opts && opts.fill) t.setAttribute("fill", opts.fill);
  t.textContent = text;
  svg.appendChild(t);
}

/**
 * Draws a regular N-sided polygon SVG.
 * Vertices are evenly spaced around a center point; first vertex points up.
 *
 * @param {number} n      - Number of sides (3–10)
 * @param {string} label  - Shape name to display (e.g. "Regular Hexagon")
 * @returns {SVGElement}
 */
function drawRegularPolygonSVG(n, label) {
  const { svg, svgNS } = makeSVG();
  const cx = 140, cy = 95, r = 72;

  const points = [];
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }

  const poly = document.createElementNS(svgNS, "polygon");
  poly.setAttribute("points", points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" "));
  poly.setAttribute("fill", "none");
  poly.setAttribute("stroke", "currentColor");
  poly.setAttribute("stroke-width", "2");
  svg.appendChild(poly);

  // Vertex labels (A, B, C, …)
  const letters = "ABCDEFGHIJ";
  points.forEach((p, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    const lx = cx + (r + 14) * Math.cos(angle);
    const ly = cy + (r + 14) * Math.sin(angle);
    svgText(svgNS, svg, lx.toFixed(1), (ly + 4).toFixed(1), letters[i], "middle");
  });

  // Shape name label at the bottom
  const displayLabel = label || `Regular ${n}-gon`;
  svgText(svgNS, svg, 140, 192, displayLabel, "middle", { fontSize: "11" });

  return svg;
}

/**
 * Draws a circle SVG with a radius line and labels.
 *
 * @param {Object} params - keys: r (radius label), label
 * @returns {SVGElement}
 */
function drawCircleSVG(params) {
  const { svg, svgNS } = makeSVG();
  const cx = 140, cy = 96, r = 72;

  const circle = document.createElementNS(svgNS, "circle");
  circle.setAttribute("cx", cx);
  circle.setAttribute("cy", cy);
  circle.setAttribute("r",  r);
  circle.setAttribute("fill",         "none");
  circle.setAttribute("stroke",       "currentColor");
  circle.setAttribute("stroke-width", "2");
  svg.appendChild(circle);

  // Center dot
  const dot = document.createElementNS(svgNS, "circle");
  dot.setAttribute("cx", cx);
  dot.setAttribute("cy", cy);
  dot.setAttribute("r",  3);
  dot.setAttribute("fill", "currentColor");
  svg.appendChild(dot);

  // Radius line from center to right edge
  const line = document.createElementNS(svgNS, "line");
  line.setAttribute("x1", cx);
  line.setAttribute("y1", cy);
  line.setAttribute("x2", cx + r);
  line.setAttribute("y2", cy);
  line.setAttribute("stroke",       "currentColor");
  line.setAttribute("stroke-width", "1.5");
  svg.appendChild(line);

  // Center label
  svgText(svgNS, svg, cx - 6, cy - 6, "O", "middle", { fontSize: "12" });

  // Radius label
  const rLabel = params.r ? `r = ${params.r}` : "r";
  svgText(svgNS, svg, cx + r / 2, cy - 8, rLabel, "middle", { fontSize: "12" });

  // Shape name
  const displayLabel = params.label || "Circle";
  svgText(svgNS, svg, 140, 192, displayLabel, "middle", { fontSize: "11" });

  return svg;
}

/**
 * Draws a rectangle SVG with width/height labels.
 *
 * @param {Object} params - keys: width, height, label
 * @returns {SVGElement}
 */
function drawRectangleSVG(params) {
  const { svg, svgNS } = makeSVG();

  const rw = 180, rh = 110;
  const rx = (280 - rw) / 2;   // 50
  const ry = (200 - rh) / 2;   // 45

  const rect = document.createElementNS(svgNS, "rect");
  rect.setAttribute("x",      rx);
  rect.setAttribute("y",      ry);
  rect.setAttribute("width",  rw);
  rect.setAttribute("height", rh);
  rect.setAttribute("fill",         "none");
  rect.setAttribute("stroke",       "currentColor");
  rect.setAttribute("stroke-width", "2");
  svg.appendChild(rect);

  // Corner labels
  const corners = [
    { x: rx - 8,      y: ry - 6,       label: "A", anchor: "end"    },
    { x: rx + rw + 8, y: ry - 6,       label: "B", anchor: "start"  },
    { x: rx + rw + 8, y: ry + rh + 14, label: "C", anchor: "start"  },
    { x: rx - 8,      y: ry + rh + 14, label: "D", anchor: "end"    },
  ];
  corners.forEach(c => svgText(svgNS, svg, c.x, c.y, c.label, c.anchor));

  // Width label (below bottom edge)
  const wLabel = params.width ? `width = ${params.width}` : "width";
  svgText(svgNS, svg, 140, ry + rh + 30, wLabel, "middle", { fontSize: "12" });

  // Height label (to the left of left edge, rotated)
  const hLabel = params.height ? `height = ${params.height}` : "height";
  const hText = document.createElementNS(svgNS, "text");
  hText.setAttribute("x",                rx - 16);
  hText.setAttribute("y",                ry + rh / 2);
  hText.setAttribute("text-anchor",      "middle");
  hText.setAttribute("dominant-baseline","middle");
  hText.setAttribute("font-family",      "monospace");
  hText.setAttribute("font-size",        "12");
  hText.setAttribute("transform",        `rotate(-90, ${rx - 16}, ${ry + rh / 2})`);
  hText.textContent = hLabel;
  svg.appendChild(hText);

  // Shape name
  const displayLabel = params.label || "Rectangle";
  svgText(svgNS, svg, 140, 196, displayLabel, "middle", { fontSize: "11" });

  return svg;
}

/**
 * Draws a line SVG with arrowheads on both ends to indicate infinite extent.
 *
 * @returns {SVGElement}
 */
function drawLineSVG() {
  const { svg, svgNS } = makeSVG();

  // Arrowhead marker definition
  const defs = document.createElementNS(svgNS, "defs");
  const makeMarker = (id, refX) => {
    const marker = document.createElementNS(svgNS, "marker");
    marker.setAttribute("id",          id);
    marker.setAttribute("markerWidth",  "8");
    marker.setAttribute("markerHeight", "8");
    marker.setAttribute("refX",        refX);
    marker.setAttribute("refY",        "3");
    marker.setAttribute("orient",      "auto");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d",    "M0,0 L0,6 L8,3 Z");
    path.setAttribute("fill", "currentColor");
    marker.appendChild(path);
    return marker;
  };
  defs.appendChild(makeMarker("arrowRight", "8"));
  defs.appendChild(makeMarker("arrowLeft",  "0"));
  svg.appendChild(defs);

  const line = document.createElementNS(svgNS, "line");
  line.setAttribute("x1", 20);
  line.setAttribute("y1", 100);
  line.setAttribute("x2", 260);
  line.setAttribute("y2", 100);
  line.setAttribute("stroke",            "currentColor");
  line.setAttribute("stroke-width",      "2");
  line.setAttribute("marker-end",        "url(#arrowRight)");
  line.setAttribute("marker-start",      "url(#arrowLeft)");
  svg.appendChild(line);

  // Two named points on the line
  [[90, "A"], [190, "B"]].forEach(([x, lbl]) => {
    const tick = document.createElementNS(svgNS, "line");
    tick.setAttribute("x1", x);  tick.setAttribute("y1", 93);
    tick.setAttribute("x2", x);  tick.setAttribute("y2", 107);
    tick.setAttribute("stroke", "currentColor"); tick.setAttribute("stroke-width", "1.5");
    svg.appendChild(tick);
    svgText(svgNS, svg, x, 86, lbl, "middle");
  });

  svgText(svgNS, svg, 140, 130, "Line AB", "middle", { fontSize: "12" });
  svgText(svgNS, svg, 140, 192, "Line (extends infinitely)", "middle", { fontSize: "11" });

  return svg;
}

/**
 * Draws a point SVG — a small filled dot with a label.
 *
 * @returns {SVGElement}
 */
function drawPointSVG() {
  const { svg, svgNS } = makeSVG();

  const dot = document.createElementNS(svgNS, "circle");
  dot.setAttribute("cx",   140);
  dot.setAttribute("cy",   96);
  dot.setAttribute("r",    5);
  dot.setAttribute("fill", "currentColor");
  svg.appendChild(dot);

  svgText(svgNS, svg, 140, 80, "P", "middle");
  svgText(svgNS, svg, 140, 130, "Point P", "middle", { fontSize: "12" });
  svgText(svgNS, svg, 140, 192, "Point (zero dimensions)", "middle", { fontSize: "11" });

  return svg;
}

/**
 * Draws a rhombus SVG (diamond orientation).
 *
 * @param {Object} params - keys: side, label
 * @returns {SVGElement}
 */
function drawRhombusSVG(params) {
  const { svg, svgNS } = makeSVG();

  const cx = 140, cy = 96;
  const hw = 100, hh = 68; // half-width and half-height

  const points = [
    { x: cx,      y: cy - hh }, // top
    { x: cx + hw, y: cy      }, // right
    { x: cx,      y: cy + hh }, // bottom
    { x: cx - hw, y: cy      }, // left
  ];

  const poly = document.createElementNS(svgNS, "polygon");
  poly.setAttribute("points", points.map(p => `${p.x},${p.y}`).join(" "));
  poly.setAttribute("fill",         "none");
  poly.setAttribute("stroke",       "currentColor");
  poly.setAttribute("stroke-width", "2");
  svg.appendChild(poly);

  // Vertex labels
  const labels = [
    { p: points[0], lbl: "A", anchor: "middle", dy: -8 },
    { p: points[1], lbl: "B", anchor: "start",  dy:  4 },
    { p: points[2], lbl: "C", anchor: "middle", dy: 18 },
    { p: points[3], lbl: "D", anchor: "end",    dy:  4 },
  ];
  labels.forEach(({ p, lbl, anchor, dy }) => {
    svgText(svgNS, svg, p.x, p.y + dy, lbl, anchor);
  });

  // Side label
  if (params.side) {
    svgText(svgNS, svg, cx + hw / 2 + 8, cy - hh / 2, `s = ${params.side}`, "start", { fontSize: "12" });
  }

  // Shape name
  const displayLabel = params.label || "Rhombus";
  svgText(svgNS, svg, 140, 192, displayLabel, "middle", { fontSize: "11" });

  return svg;
}

/**
 * Routes a parsed SHAPE params object to the correct drawing function.
 *
 * @param {Object} params - Parsed key/value pairs from [SHAPE: ...] tag
 * @returns {SVGElement}
 */
function drawShapeSVG(params) {
  const type = (params.type || "").toLowerCase();
  switch (type) {
    case "circle":
      return drawCircleSVG(params);
    case "rectangle":
      return drawRectangleSVG(params);
    case "rhombus":
      return drawRhombusSVG(params);
    case "square": {
      // Render as a regular 4-sided polygon with a "Square" label
      const svg = drawRegularPolygonSVG(4, params.label || (params.side ? `Square (side = ${params.side})` : "Square"));
      return svg;
    }
    case "line":
      return drawLineSVG();
    case "point":
      return drawPointSVG();
    case "polygon": {
      const n = parseInt(params.sides, 10);
      if (!isNaN(n) && n >= 3 && n <= 10) {
        return drawRegularPolygonSVG(n, params.label || `Regular ${n}-gon`);
      }
      // Fall back to a hexagon if sides is missing/invalid
      return drawRegularPolygonSVG(6, params.label || "Regular Polygon");
    }
    default:
      // Unknown type — draw a generic hexagon as a fallback
      return drawRegularPolygonSVG(6, params.label || type || "Shape");
  }
}

// Default canvas dimensions used when an SVG has no intrinsic width/height.
const DEFAULT_CANVAS_WIDTH  = 400;
const DEFAULT_CANVAS_HEIGHT = 300;

// Allowlist of safe characters for graph expressions.
// This prevents passing arbitrary code to functionPlot's eval-like parser.
const SAFE_EXPRESSION_RE = /^[a-zA-Z0-9+\-*/^()._,\s]*$/;

function isSafeExpression(expr) {
  return SAFE_EXPRESSION_RE.test(expr);
}

/**
 * Returns a Promise that resolves when the functionPlot library is available.
 * Polls every 50 ms, up to maxWait ms.
 */
function waitForFunctionPlot(maxWait = 5000) {
  return new Promise((resolve, reject) => {
    if (typeof functionPlot === "function") { resolve(); return; }
    const start = Date.now();
    const interval = setInterval(() => {
      if (typeof functionPlot === "function") {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > maxWait) {
        clearInterval(interval);
        reject(new Error("Function Plot library failed to load"));
      }
    }, 50);
  });
}

// ============================================================
// SAFE MARKDOWN RENDERING
// Converts **bold**, *italic*, `code`, and \n newlines to DOM nodes.
// No innerHTML is used, making it XSS-safe.
// ============================================================
function parseInlineFormatting(text, container) {
  const inlineRegex = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`/g;
  let lastIndex = 0;
  let match;
  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    if (match[1] !== undefined) {
      const strong = document.createElement("strong");
      strong.textContent = match[1];
      container.appendChild(strong);
    } else if (match[2] !== undefined) {
      const em = document.createElement("em");
      em.textContent = match[2];
      container.appendChild(em);
    } else if (match[3] !== undefined) {
      const code = document.createElement("code");
      code.textContent = match[3];
      container.appendChild(code);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function renderFormattedText(text, container) {
  const lines = text.split("\n");
  lines.forEach((line, idx) => {
    if (idx > 0) container.appendChild(document.createElement("br"));
    parseInlineFormatting(line, container);
  });
}

// ============================================================
// MESSAGE RENDERING
// ============================================================

/**
 * Appends a chat bubble to the chat section and returns the bubble element.
 * Handles user messages (plain text + optional image) and assistant messages
 * (safe markdown, KaTeX, interactive graphs).
 */
function renderMessageBubble(role, content) {
  const messageEl = document.createElement("div");
  messageEl.className = "message " + role;

  const bubbleEl = document.createElement("div");
  bubbleEl.className = "message-bubble";

  if (role === "assistant") {
    const textContent = (typeof content === "string") ? content : "";
    renderAssistantContent(bubbleEl, textContent);
  } else {
    // User message: content may be a plain string or an array (text + image).
    if (Array.isArray(content)) {
      content.forEach(part => {
        if (part.type === "image_url" && part.image_url && part.image_url.url) {
          const img = document.createElement("img");
          img.src = part.image_url.url;
          img.className = "chat-image";
          img.alt = "Uploaded image";
          bubbleEl.appendChild(img);
        } else if (part.type === "text" && part.text) {
          const textSpan = document.createElement("span");
          textSpan.textContent = part.text;
          bubbleEl.appendChild(textSpan);
        }
      });
    } else {
      bubbleEl.textContent = content;
    }
  }

  messageEl.appendChild(bubbleEl);
  chat.appendChild(messageEl);
  chat.scrollTop = chat.scrollHeight;
  return bubbleEl;
}

/**
 * Renders an assistant response into bubbleEl.
 * Handles [GRAPH: ...], [TRIANGLE: ...], and [SHAPE: ...] tags, KaTeX, and safe markdown.
 */
function renderAssistantContent(bubbleEl, content) {
  // Collect all special tags ([GRAPH: ...], [TRIANGLE: ...], [SHAPE: ...]) in document order.
  const tagRegex = /\[(GRAPH|TRIANGLE|SHAPE):\s*(.+?)\]/g;
  const tags = [];
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    tags.push({
      type:      match[1],       // "GRAPH", "TRIANGLE", or "SHAPE"
      fullMatch: match[0],
      raw:       match[2].trim(),
      index:     match.index
    });
  }

  if (tags.length > 0) {
    bubbleEl.classList.add("has-graph");
    let lastIndex = 0;

    tags.forEach(tag => {
      // Text segment before this tag
      const textBefore = content.slice(lastIndex, tag.index);
      if (textBefore.trim()) {
        const textEl = document.createElement("div");
        renderFormattedText(textBefore, textEl);
        applyKatex(textEl);
        bubbleEl.appendChild(textEl);
      }

      if (tag.type === "GRAPH") {
        // ── Graph tag ──────────────────────────────────────────────────────────
        // Parse "expression | param1=default:min:max | ..."
        const parts = tag.raw.split("|").map(s => s.trim());
        const expression = parts[0];

        // Validate expression against allowlist before passing to functionPlot
        if (!isSafeExpression(expression)) {
          const errorEl = document.createElement("div");
          errorEl.className = "graph-error";
          errorEl.textContent = "This graph couldn\u2019t be displayed \u2014 the expression contains unexpected characters. Only letters, numbers, and basic math operators (+, -, *, /, ^) are allowed.";
          bubbleEl.appendChild(errorEl);
          lastIndex = tag.index + tag.fullMatch.length;
          return;
        }

        const params = [];
        for (let p = 1; p < parts.length; p++) {
          const paramMatch = parts[p].match(/^(\w+)=(-?[\d.]+):(-?[\d.]+):(-?[\d.]+)$/);
          if (paramMatch) {
            params.push({
              name:    paramMatch[1],
              default: parseFloat(paramMatch[2]),
              min:     parseFloat(paramMatch[3]),
              max:     parseFloat(paramMatch[4])
            });
          }
        }

        // Label above the graph
        const labelEl = document.createElement("div");
        labelEl.className = "graph-label";
        labelEl.textContent = "y = " + expression;
        bubbleEl.appendChild(labelEl);

        // Graph container
        const graphId = "graph-" + Date.now() + "-" + (graphCounter++);
        const graphDiv = document.createElement("div");
        graphDiv.className = "graph-container";
        graphDiv.id = graphId;
        graphDiv.dataset.expression = expression;
        graphDiv.dataset.params = JSON.stringify(params);
        bubbleEl.appendChild(graphDiv);

        // Slider controls (only when parameters exist)
        if (params.length > 0) {
          const slidersDiv = document.createElement("div");
          slidersDiv.className = "graph-sliders";
          slidersDiv.dataset.graphId = graphId;

          params.forEach(param => {
            const row = document.createElement("div");
            row.className = "graph-slider-row";

            const label = document.createElement("label");
            label.textContent = param.name;
            row.appendChild(label);

            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = param.min;
            slider.max = param.max;
            slider.step = 0.1;
            slider.value = param.default;
            slider.dataset.paramName = param.name;
            row.appendChild(slider);

            const valueDisplay = document.createElement("span");
            valueDisplay.className = "slider-value";
            valueDisplay.textContent = param.default;
            row.appendChild(valueDisplay);

            slidersDiv.appendChild(row);
          });

          bubbleEl.appendChild(slidersDiv);
        }
      } else if (tag.type === "TRIANGLE") {
        // ── Triangle diagram tag ───────────────────────────────────────────────
        const triParams = parseTriangleParams(tag.raw);
        const container = document.createElement("div");
        container.className = "triangle-container";
        const svgEl = drawTriangleSVG(triParams);
        container.appendChild(svgEl);
        bubbleEl.appendChild(container);
      } else if (tag.type === "SHAPE") {
        // ── Shape diagram tag ──────────────────────────────────────────────────
        const shapeParams = parseShapeParams(tag.raw);
        const container = document.createElement("div");
        container.className = "triangle-container";
        const svgEl = drawShapeSVG(shapeParams);
        container.appendChild(svgEl);
        bubbleEl.appendChild(container);
      }

      lastIndex = tag.index + tag.fullMatch.length;
    });

    // Text segment after the last tag
    const textAfter = content.slice(lastIndex);
    if (textAfter.trim()) {
      const textEl = document.createElement("div");
      renderFormattedText(textAfter, textEl);
      applyKatex(textEl);
      bubbleEl.appendChild(textEl);
    }
  } else {
    // No special tags — render with safe markdown and KaTeX
    renderFormattedText(content, bubbleEl);
    applyKatex(bubbleEl);
  }

  // Render any function-plot graphs after the elements are in the DOM so
  // Function Plot can measure container dimensions correctly.
  if (bubbleEl.classList.contains("has-graph")) {
    waitForFunctionPlot().then(() => {
      requestAnimationFrame(() => {
        bubbleEl.querySelectorAll(".graph-container").forEach(container => {
          const expression = container.dataset.expression || "";
          let params = [];
          // Wrap JSON.parse in try/catch so malformed data doesn't crash the app.
          try {
            params = JSON.parse(container.dataset.params || "[]");
          } catch {
            params = [];
          }

          const isTrig = /\b(sin|cos|tan)\b/.test(expression);
          const xDomain = isTrig ? [-2 * Math.PI, 2 * Math.PI] : [-10, 10];
          const scope = {};
          params.forEach(p => { scope[p.name] = p.default; });

          function renderGraph() {
            try {
              while (container.firstChild) container.removeChild(container.firstChild);
              functionPlot({
                target: "#" + container.id,
                width: container.offsetWidth || 400,
                height: 300,
                grid: true,
                xAxis: { domain: xDomain },
                data: [{ fn: expression, graphType: "polyline", scope: Object.assign({}, scope) }]
              });
            } catch {
              while (container.firstChild) container.removeChild(container.firstChild);
              const errorEl = document.createElement("div");
              errorEl.className = "graph-error";
              errorEl.textContent = "This graph couldn\u2019t be displayed \u2014 try asking the tutor to rephrase the equation.";
              container.appendChild(errorEl);
            }
          }

          renderGraph();

          // Hook up sliders
          const slidersDiv = container.nextElementSibling;
          if (slidersDiv && slidersDiv.classList.contains("graph-sliders")) {
            slidersDiv.querySelectorAll("input[type='range']").forEach(slider => {
              slider.addEventListener("input", () => {
                scope[slider.dataset.paramName] = parseFloat(slider.value);
                const valueDisplay = slider.nextElementSibling;
                if (valueDisplay) valueDisplay.textContent = parseFloat(slider.value).toFixed(1);
                renderGraph();
              });
            });
          }
        });
      });
    }).catch(() => {
      bubbleEl.querySelectorAll(".graph-container").forEach(container => {
        const errorEl = document.createElement("div");
        errorEl.className = "graph-error";
        errorEl.textContent = "The graphing library is still loading. Please try asking again in a moment.";
        container.appendChild(errorEl);
      });
    });
  }
}

// ============================================================
// STREAMING HELPERS
// ============================================================

/**
 * Creates a placeholder streaming bubble with a typing indicator.
 * Returns { messageEl, bubbleEl }.
 */
function createStreamingBubble() {
  const messageEl = document.createElement("div");
  messageEl.className = "message assistant";

  const bubbleEl = document.createElement("div");
  bubbleEl.className = "message-bubble";

  const indicator = document.createElement("span");
  indicator.className = "typing-indicator";
  indicator.setAttribute("aria-label", "Tutor is typing");
  for (let i = 0; i < 3; i++) {
    indicator.appendChild(document.createElement("span"));
  }
  bubbleEl.appendChild(indicator);

  messageEl.appendChild(bubbleEl);
  chat.appendChild(messageEl);
  chat.scrollTop = chat.scrollHeight;
  return { messageEl, bubbleEl };
}

/**
 * Updates the streaming bubble with raw accumulated text (no KaTeX yet).
 */
function updateStreamingBubble(bubbleEl, text) {
  // Remove typing indicator if still present
  const indicator = bubbleEl.querySelector(".typing-indicator");
  if (indicator) bubbleEl.removeChild(indicator);
  // Show raw text during streaming (formatted render happens on finalise)
  while (bubbleEl.firstChild) bubbleEl.removeChild(bubbleEl.firstChild);
  bubbleEl.textContent = text;
  chat.scrollTop = chat.scrollHeight;
}

/**
 * Replaces raw streaming text with fully-formatted content (markdown + KaTeX + graphs).
 */
function finalizeStreamingBubble(bubbleEl, content) {
  while (bubbleEl.firstChild) bubbleEl.removeChild(bubbleEl.firstChild);
  renderAssistantContent(bubbleEl, content);
  chat.scrollTop = chat.scrollHeight;
}

// ============================================================
// SUGGESTION CHIPS
// ============================================================
const SUGGESTION_CHIPS = [
  "How do I solve quadratic equations?",
  "What is the Pythagorean theorem?",
  "Explain fractions",
  "Graph y = sin(x)"
];

function buildSuggestionChips() {
  const container = document.createElement("div");
  container.className = "suggestion-chips";
  container.setAttribute("aria-label", "Suggested questions");

  SUGGESTION_CHIPS.forEach(text => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "suggestion-chip";
    chip.textContent = text;
    chip.addEventListener("click", () => {
      userInput.value = text;
      // Trigger auto-resize
      userInput.style.height = "auto";
      userInput.style.height = Math.min(userInput.scrollHeight, 200) + "px";
      form.requestSubmit();
    });
    container.appendChild(chip);
  });

  return container;
}

// ============================================================
// CHAT RESET
// ============================================================
function resetChat() {
  messages = [];
  sessionStorage.removeItem("mathTutorMessages");
  currentImage = null;
  imagePreviewImg.src = "";
  imagePreviewContainer.style.display = "none";

  while (chat.firstChild) chat.removeChild(chat.firstChild);

  // Welcome message
  const welcomeEl = document.createElement("div");
  welcomeEl.className = "message assistant";
  const welcomeBubble = document.createElement("div");
  welcomeBubble.className = "message-bubble";
  welcomeBubble.textContent =
    "Hi! I\u2019m your math tutor. Ask me a math question, and I\u2019ll help guide you step by step instead of just giving the answer.";
  welcomeEl.appendChild(welcomeBubble);
  chat.appendChild(welcomeEl);

  // Suggestion chips below the welcome message
  chat.appendChild(buildSuggestionChips());

  statusDiv.textContent = "";
  statusDiv.classList.remove("error");
}

clearButton.addEventListener("click", resetChat);

// ============================================================
// SUBSCRIPT MODE
// ============================================================
const SUBSCRIPT_MAP = {
  "0": "\u2080", "1": "\u2081", "2": "\u2082", "3": "\u2083", "4": "\u2084",
  "5": "\u2085", "6": "\u2086", "7": "\u2087", "8": "\u2088", "9": "\u2089"
};

let subscriptMode = false;
const subscriptButton = document.getElementById("subscript-toggle");

subscriptButton.addEventListener("click", () => {
  subscriptMode = !subscriptMode;
  subscriptButton.classList.toggle("active", subscriptMode);
  userInput.focus();
});

// ============================================================
// MATH TOOLBAR
// ============================================================
document.getElementById("math-toolbar").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-insert]");
  if (!button) return;

  const insertText = button.dataset.insert;
  const cursorOffset = button.dataset.cursorOffset ? parseInt(button.dataset.cursorOffset, 10) : 0;
  const start = userInput.selectionStart;
  const end = userInput.selectionEnd;

  userInput.value = userInput.value.slice(0, start) + insertText + userInput.value.slice(end);

  const newCursor = start + insertText.length + cursorOffset;
  userInput.setSelectionRange(newCursor, newCursor);
  userInput.focus();
  // Trigger auto-resize after toolbar insert
  userInput.dispatchEvent(new Event("input"));
});

// ============================================================
// TEXTAREA AUTO-RESIZE
// ============================================================
userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 200) + "px";
});

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
userInput.addEventListener("keydown", (event) => {
  // Subscript mode: intercept number keys (0-9)
  if (subscriptMode && SUBSCRIPT_MAP[event.key]) {
    event.preventDefault();
    const start = userInput.selectionStart;
    const end = userInput.selectionEnd;
    const sub = SUBSCRIPT_MAP[event.key];
    userInput.value = userInput.value.slice(0, start) + sub + userInput.value.slice(end);
    userInput.setSelectionRange(start + sub.length, start + sub.length);
    subscriptMode = false;
    subscriptButton.classList.remove("active");
    return;
  }
  // Ctrl+Enter / Cmd+Enter to submit
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
});

// ============================================================
// IMAGE UPLOAD
// ============================================================
let currentImage = null; // { dataUrl: string, type: string } | null

function handleImageFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    statusDiv.textContent = "Please upload a valid image file (PNG, JPG, GIF, WebP).";
    statusDiv.classList.add("error");
    return;
  }
  const maxSize = 5 * 1024 * 1024; // 5 MB
  if (file.size > maxSize) {
    statusDiv.textContent = "Image is too large. Please use an image under 5 MB.";
    statusDiv.classList.add("error");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    currentImage = { dataUrl: e.target.result, type: file.type };
    imagePreviewImg.src = e.target.result;
    imagePreviewContainer.style.display = "flex";
    statusDiv.textContent = "";
    statusDiv.classList.remove("error");
  };
  reader.readAsDataURL(file);
}

// File picker via hidden <input>
uploadButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) {
    handleImageFile(fileInput.files[0]);
    fileInput.value = ""; // Reset so the same file can be re-selected
  }
});

// Remove preview
removeImageButton.addEventListener("click", () => {
  currentImage = null;
  imagePreviewImg.src = "";
  imagePreviewContainer.style.display = "none";
});

// Drag and drop onto the textarea
userInput.addEventListener("dragover", (e) => {
  e.preventDefault();
  userInput.classList.add("drag-over");
});

userInput.addEventListener("dragleave", () => {
  userInput.classList.remove("drag-over");
});

userInput.addEventListener("drop", (e) => {
  e.preventDefault();
  userInput.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) handleImageFile(file);
});

// Paste from clipboard (Ctrl+V / Cmd+V)
userInput.addEventListener("paste", (e) => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      e.preventDefault();
      handleImageFile(item.getAsFile());
      return;
    }
  }
});

// ============================================================
// DOWNLOAD CHAT
// ============================================================

/**
 * Serializes an SVG element to a PNG data URL using an offscreen canvas.
 * Returns a Promise that resolves with the data URL string.
 */
function svgToPngDataUrl(svgElement) {
  return new Promise((resolve) => {
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svgElement);
    // Ensure xmlns attribute is present so the browser can parse the SVG as an image.
    if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgString = svgString.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width || DEFAULT_CANVAS_WIDTH;
      canvas.height = img.height || DEFAULT_CANVAS_HEIGHT;
      const ctx = canvas.getContext("2d");
      // White background so transparent SVG areas look clean.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(svgUrl);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      resolve(null);
    };
    img.src = svgUrl;
  });
}

/**
 * Captures every .graph-container in the chat as a PNG data URL.
 * Returns a Promise that resolves with a Map<graphContainerId, pngDataUrl>.
 */
async function captureGraphImages() {
  const graphMap = new Map();
  const containers = Array.from(chat.querySelectorAll(".graph-container"));
  await Promise.all(containers.map(async (container) => {
    const svgEl = container.querySelector("svg");
    if (svgEl) {
      const dataUrl = await svgToPngDataUrl(svgEl);
      if (dataUrl) graphMap.set(container.id, dataUrl);
    }
  }));
  return graphMap;
}

/**
 * Escapes a string for safe inclusion in HTML text content.
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Builds a self-contained HTML export of the current conversation.
 * @param {Map<string, string>} graphMap  Map of graph container id → PNG data URL.
 * @returns {string}  Full HTML document as a string.
 */
function buildExportHtml(graphMap) {
  // Track which graph containers map to messages; we scan the DOM to resolve
  // [GRAPH: ...] tags in assistant messages to the right captured image.
  const graphContainerIds = Array.from(chat.querySelectorAll(".graph-container")).map(el => el.id);
  let graphIdxCursor = 0;

  const timestamp = new Date().toLocaleString();

  const messageBubbles = messages.map(msg => {
    const isUser = msg.role === "user";
    const bubbleClass = isUser ? "bubble user-bubble" : "bubble assistant-bubble";

    let innerHtml = "";

    if (isUser) {
      if (Array.isArray(msg.content)) {
        msg.content.forEach(part => {
          if (part.type === "text" && part.text) {
            innerHtml += `<p>${escapeHtml(part.text)}</p>`;
          } else if (part.type === "image_url" && part.image_url && part.image_url.url) {
            innerHtml += `<img src="${part.image_url.url}" alt="Uploaded image" class="chat-img" />`;
          }
        });
      } else {
        innerHtml += `<p>${escapeHtml(typeof msg.content === "string" ? msg.content : "")}</p>`;
      }
    } else {
      // Assistant message: replace [GRAPH: ...], [TRIANGLE: ...], and [SHAPE: ...] tags.
      const rawText = typeof msg.content === "string" ? msg.content : "";
      const specialTagRegex = /\[(GRAPH|TRIANGLE|SHAPE):\s*(.+?)\]/g;
      let lastIdx = 0;
      let sMatch;
      while ((sMatch = specialTagRegex.exec(rawText)) !== null) {
        // Text before this tag
        if (sMatch.index > lastIdx) {
          innerHtml += `<p>${escapeHtml(rawText.slice(lastIdx, sMatch.index)).replace(/\n/g, "<br>")}</p>`;
        }
        if (sMatch[1] === "GRAPH") {
          // Replace with captured PNG if available, otherwise show label
          const containerId = graphContainerIds[graphIdxCursor] || null;
          const pngDataUrl = containerId ? graphMap.get(containerId) : null;
          if (pngDataUrl) {
            // Split on '|' to extract the expression before any optional slider parameters.
            const expr = escapeHtml(sMatch[2].trim().split("|")[0].trim());
            innerHtml += `<figure class="graph-figure"><img src="${pngDataUrl}" alt="Graph of ${expr}" class="graph-img" /><figcaption>y = ${expr}</figcaption></figure>`;
          } else {
            innerHtml += `<p><em>[Graph: ${escapeHtml(sMatch[2].trim())}]</em></p>`;
          }
          graphIdxCursor++;
        } else if (sMatch[1] === "TRIANGLE") {
          // Inline the SVG directly into the export HTML
          try {
            const triParams = parseTriangleParams(sMatch[2].trim());
            const svgEl = drawTriangleSVG(triParams);
            const serializer = new XMLSerializer();
            let svgString = serializer.serializeToString(svgEl);
            if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
              svgString = svgString.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
            }
            innerHtml += `<div class="triangle-figure">${svgString}</div>`;
          } catch {
            innerHtml += `<p><em>[Triangle: ${escapeHtml(sMatch[2].trim())}]</em></p>`;
          }
        } else if (sMatch[1] === "SHAPE") {
          // Inline the shape SVG directly into the export HTML
          try {
            const shapeParams = parseShapeParams(sMatch[2].trim());
            const svgEl = drawShapeSVG(shapeParams);
            const serializer = new XMLSerializer();
            let svgString = serializer.serializeToString(svgEl);
            if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
              svgString = svgString.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
            }
            innerHtml += `<div class="triangle-figure">${svgString}</div>`;
          } catch {
            innerHtml += `<p><em>[Shape: ${escapeHtml(sMatch[2].trim())}]</em></p>`;
          }
        }
        lastIdx = sMatch.index + sMatch[0].length;
      }
      // Remaining text after the last tag
      if (lastIdx < rawText.length) {
        innerHtml += `<p>${escapeHtml(rawText.slice(lastIdx)).replace(/\n/g, "<br>")}</p>`;
      }
    }

    const label = isUser ? "You" : "Math Tutor";
    return `<div class="message-row ${isUser ? "user-row" : "assistant-row"}">
  <div class="role-label">${label}</div>
  <div class="${bubbleClass}">${innerHtml}</div>
</div>`;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>AI Math Tutor &mdash; Conversation Export</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #f3f4f6;
    color: #111827;
    padding: 24px 16px 48px;
    line-height: 1.6;
  }
  h1 {
    text-align: center;
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 24px;
    color: #1e3a8a;
  }
  .chat-export {
    max-width: 760px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .message-row {
    display: flex;
    flex-direction: column;
    max-width: 80%;
  }
  .user-row { align-self: flex-end; align-items: flex-end; }
  .assistant-row { align-self: flex-start; align-items: flex-start; }
  .role-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
    color: #6b7280;
  }
  .bubble {
    border-radius: 16px;
    padding: 10px 14px;
    word-break: break-word;
  }
  .user-bubble {
    background: #2563eb;
    color: #ffffff;
    border-bottom-right-radius: 4px;
  }
  .assistant-bubble {
    background: #f9fafb;
    color: #111827;
    border: 1px solid #e5e7eb;
    border-bottom-left-radius: 4px;
  }
  .bubble p { margin: 4px 0; }
  .bubble p:first-child { margin-top: 0; }
  .bubble p:last-child { margin-bottom: 0; }
  .chat-img {
    display: block;
    max-width: 100%;
    max-height: 300px;
    border-radius: 8px;
    margin-top: 6px;
  }
  .graph-figure {
    margin: 8px 0;
    text-align: center;
  }
  .graph-img {
    display: block;
    max-width: 100%;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
  }
  .triangle-figure {
    display: inline-block;
    margin: 8px 0;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 6px;
    background: #f9fafb;
  }
  .triangle-figure svg { display: block; }
  figcaption {
    font-size: 0.8rem;
    color: #6b7280;
    margin-top: 4px;
  }
  footer {
    text-align: center;
    margin-top: 40px;
    font-size: 0.8rem;
    color: #9ca3af;
  }
</style>
</head>
<body>
<h1>AI Math Tutor &mdash; Conversation Export</h1>
<div class="chat-export">
${messageBubbles.join("\n")}
</div>
<footer>Exported on ${escapeHtml(timestamp)}</footer>
</body>
</html>`;
}

downloadButton.addEventListener("click", async () => {
  if (messages.length === 0) {
    statusDiv.textContent = "No conversation to download yet.";
    statusDiv.classList.add("error");
    return;
  }

  // Capture all graph SVGs as PNG data URLs before building the HTML.
  const graphMap = await captureGraphImages();

  const html = buildExportHtml(graphMap);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "math-tutor-chat.html";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ============================================================
// FORM SUBMIT (with streaming support)
// ============================================================
form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = userInput.value.trim();
  const hasImage = !!currentImage;

  if (!text && !hasImage) {
    statusDiv.textContent = "Please enter a math question or attach an image.";
    statusDiv.classList.add("error");
    return;
  }

  // Build message content — vision format when an image is attached.
  let userContent;
  if (hasImage) {
    userContent = [
      { type: "image_url", image_url: { url: currentImage.dataUrl } }
    ];
    if (text) {
      userContent.unshift({ type: "text", text });
    }
  } else {
    userContent = text;
  }

  // Remove suggestion chips once the user sends their first message
  const chipsContainer = chat.querySelector(".suggestion-chips");
  if (chipsContainer) chat.removeChild(chipsContainer);

  // Render user message bubble
  renderMessageBubble("user", userContent);
  messages.push({ role: "user", content: userContent });
  saveChatHistory();

  // Clear input state
  userInput.value = "";
  userInput.style.height = "auto";
  currentImage = null;
  imagePreviewImg.src = "";
  imagePreviewContainer.style.display = "none";

  statusDiv.textContent = "Tutor is thinking\u2026";
  statusDiv.classList.remove("error");
  sendButton.disabled = true;
  clearButton.disabled = true;
  downloadButton.disabled = true;
  sendButton.textContent = "Sending\u2026";

  // Cap history sent to the API
  const trimmedMessages = messages.slice(-MAX_HISTORY);

  // Create the streaming bubble (typing indicator)
  const { bubbleEl } = createStreamingBubble();

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: storedPassword, messages: trimmedMessages, stream: true })
    });

    if (!response.ok) {
      let errMsg = "Something went wrong.";
      try {
        const errData = await response.json();
        errMsg = errData.error || errMsg;
      } catch {
        // Ignore parse errors
      }
      throw new Error(errMsg);
    }

    const contentType = response.headers.get("Content-Type") || "";
    let answer = "";

    if (contentType.includes("text/event-stream") && response.body) {
      // ── Streaming path ────────────────────────────────────────────────────
      // Parse Server-Sent Events from the Groq streaming response.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Keep the last (potentially incomplete) line

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break outer;
          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices && parsed.choices[0] &&
              parsed.choices[0].delta && parsed.choices[0].delta.content
              ? parsed.choices[0].delta.content : "";
            if (token) {
              answer += token;
              updateStreamingBubble(bubbleEl, answer);
            }
          } catch {
            // Skip malformed SSE chunks
          }
        }
      }
    } else {
      // ── Non-streaming fallback (JSON response) ────────────────────────────
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error("Invalid server response.");
      }
      answer = data.answer || "I\u2019m sorry, I couldn\u2019t generate a response.";
    }

    if (!answer) answer = "I\u2019m sorry, I couldn\u2019t generate a response.";

    // Final render: apply markdown, KaTeX, and graph rendering
    finalizeStreamingBubble(bubbleEl, answer);
    messages.push({ role: "assistant", content: answer });
    saveChatHistory();
    statusDiv.textContent = "Done.";

  } catch (error) {
    // Remove the incomplete streaming bubble on error
    if (bubbleEl.parentElement) chat.removeChild(bubbleEl.parentElement);
    statusDiv.textContent = "Error: " + error.message;
    statusDiv.classList.add("error");
    renderMessageBubble("assistant", "Sorry \u2014 something went wrong. Please try again.");
  } finally {
    sendButton.disabled = false;
    clearButton.disabled = false;
    downloadButton.disabled = false;
    sendButton.textContent = "Send";
    userInput.focus();
  }
});

// ============================================================
// INITIALISE
// ============================================================
resetChat();
