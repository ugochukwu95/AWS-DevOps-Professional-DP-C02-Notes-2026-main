const path = require("path");

const BRAND = {
  name: "Ugo",
  handle: "@ugo4632",
  score: 793,
  deckTitle: "DOP-C02: Amazon CloudWatch",
};

const C = {
  bg: "0F1B2D",
  panel: "16263F",
  panel2: "1D3150",
  rule: "263B5E",
  orange: "FF9900",
  white: "FFFFFF",
  text: "D5DEEA",
  muted: "8394AD",
  green: "2ECC71",
  greenDark: "123A2A",
  red: "FF5C5C",
  blue: "3FA9F5",
  purple: "A66CFF",
  teal: "1ABC9C",
};

const FONT = "Helvetica Neue";
const W = 13.333;
const H = 7.5;
const M = 0.6;
const CW = W - 2 * M;

const icon = (name) => path.join(__dirname, "assets", "icons", `${name}.png`);
const photo = (name) => path.join(__dirname, "assets", "photos", `${name}.jpg`);

function createHelpers(pptx) {
  pptx.defineSlideMaster({
    title: "BASE",
    background: { color: C.bg },
    objects: [
      { line: { x: M, y: 6.98, w: CW, h: 0, line: { color: C.rule, width: 0.75 } } },
      {
        text: {
          text: `${BRAND.name}  |  ${BRAND.handle}  |  ${BRAND.deckTitle}`,
          options: { x: W - M - 6, y: 7.02, w: 6, h: 0.3, fontFace: FONT, fontSize: 10, color: C.muted, align: "right", margin: 0 },
        },
      },
    ],
    slideNumber: { x: M, y: 7.02, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 10, color: C.muted, margin: 0 },
  });

  const text = (s, value, o = {}) =>
    s.addText(value, { fontFace: FONT, color: C.text, fontSize: 14, margin: 0, valign: "top", ...o });

  const rect = (s, o) =>
    s.addShape(pptx.ShapeType.rect, { line: { type: "none" }, ...o });

  const round = (s, o) =>
    s.addShape(pptx.ShapeType.roundRect, { rectRadius: 0.08, line: { type: "none" }, ...o });

  // pptx lines cannot have a negative height; draw upward lines as flipped boxes.
  const arrow = (s, x, y, w, h = 0, color = C.orange) =>
    s.addShape(pptx.ShapeType.line, {
      x, y: h < 0 ? y + h : y, w, h: Math.abs(h), flipV: h < 0,
      line: { color, width: 2, endArrowType: "triangle" },
    });

  const pill = (s, label, x, y, o = {}) => {
    const w = o.w || 0.16 * label.length + 0.5;
    round(s, { x, y, w, h: o.h || 0.38, fill: { color: o.fill || C.orange }, rectRadius: 0.19 });
    text(s, label, {
      x, y, w, h: o.h || 0.38, align: "center", valign: "middle",
      fontSize: o.fontSize || 11, bold: true, color: o.color || C.bg, charSpacing: 1,
    });
    return w;
  };

  const slide = (notes) => {
    const s = pptx.addSlide({ masterName: "BASE" });
    if (notes) s.addNotes(notes);
    return s;
  };

  const header = (s, kicker, title, o = {}) => {
    rect(s, { x: M, y: 0.5, w: 0.08, h: 0.95, fill: { color: o.accent || C.orange } });
    text(s, kicker.toUpperCase(), { x: M + 0.3, y: 0.48, w: CW - 0.3, h: 0.32, fontSize: 12, bold: true, color: o.accent || C.orange, charSpacing: 3 });
    text(s, title, { x: M + 0.3, y: 0.82, w: CW - 0.3, h: 0.65, fontSize: 30, bold: true, color: C.white, valign: "middle" });
  };

  // Card with optional icon, accent bar, title and body (string or array of bullet strings).
  const card = (s, o) => {
    const { x, y, w, h } = o;
    const accent = o.accent || C.orange;
    round(s, { x, y, w, h, fill: { color: o.fill || C.panel }, line: o.border ? { color: o.border, width: 1.5 } : { type: "none" } });
    rect(s, { x, y: y + 0.18, w: 0.06, h: h - 0.36, fill: { color: accent } });
    let tx = x + 0.3;
    let ty = y + 0.22;
    if (o.icon) {
      const sz = o.iconSize || 0.6;
      s.addImage({ path: icon(o.icon), x: tx, y: ty, w: sz, h: sz });
      if (o.iconLeft) {
        tx += sz + 0.2;
      } else {
        ty += sz + 0.15;
      }
    }
    const tw = x + w - tx - 0.25;
    if (o.title) {
      text(s, o.title, { x: tx, y: ty, w: tw, h: o.titleH || 0.4, fontSize: o.titleSize || 17, bold: true, color: o.titleColor || C.white, valign: "middle" });
      ty += (o.titleH || 0.4) + 0.08;
    }
    if (o.body) {
      const bodyY = o.icon && o.iconLeft ? Math.max(ty, y + 0.22 + (o.iconSize || 0.6) + 0.12) : ty;
      const bx = o.icon && o.iconLeft ? x + 0.3 : tx;
      const runs = Array.isArray(o.body)
        ? o.body.map((b) => ({ text: b, options: { bullet: { indent: 14 }, breakLine: true } }))
        : o.body;
      text(s, runs, {
        x: bx, y: bodyY, w: x + w - bx - 0.25, h: y + h - bodyY - 0.15,
        fontSize: o.bodySize || 13, color: C.text, paraSpaceAfter: 4, lineSpacingMultiple: 1.05,
      });
    }
  };

  // Horizontal flow of icon nodes connected by arrows.
  const flow = (s, nodes, o) => {
    const n = nodes.length;
    const gap = o.gap || 0.55;
    const nw = (o.w - gap * (n - 1)) / n;
    const nh = o.h || 1.5;
    nodes.forEach((nd, i) => {
      const x = o.x + i * (nw + gap);
      round(s, { x, y: o.y, w: nw, h: nh, fill: { color: nd.fill || C.panel }, line: nd.border ? { color: nd.border, width: 1.5 } : { type: "none" } });
      let ly = o.y + 0.15;
      if (nd.icon) {
        s.addImage({ path: icon(nd.icon), x: x + nw / 2 - 0.3, y: o.y + 0.18, w: 0.6, h: 0.6 });
        ly = o.y + 0.85;
      }
      text(s, nd.label, { x: x + 0.08, y: ly, w: nw - 0.16, h: nh - (ly - o.y) - 0.08, align: "center", valign: nd.icon ? "top" : "middle", fontSize: o.fontSize || 13, bold: true, color: C.white });
      if (i < n - 1) arrow(s, x + nw + 0.08, o.y + nh / 2, gap - 0.16);
    });
  };

  const tip = (s, label, value, y = 6.2, o = {}) => {
    round(s, { x: M, y, w: CW, h: o.h || 0.58, fill: { color: o.fill || "2A2312" }, line: { color: o.color || C.orange, width: 1 } });
    text(s, [
      { text: `${label}  `, options: { bold: true, color: o.color || C.orange } },
      { text: value, options: { color: C.white } },
    ], { x: M + 0.25, y, w: CW - 0.5, h: o.h || 0.58, fontSize: 14, valign: "middle" });
  };

  const photoBackdrop = (s, name, transparency = 25) => {
    s.addImage({ path: photo(name), x: 0, y: 0, w: W, h: H });
    rect(s, { x: 0, y: 0, w: W, h: H, fill: { color: C.bg, transparency } });
  };

  const section = (num, title, subtitle, photoName, notes) => {
    const s = pptx.addSlide();
    s.background = { color: C.bg };
    if (notes) s.addNotes(notes);
    photoBackdrop(s, photoName, 20);
    rect(s, { x: 0, y: 0, w: 8.2, h: H, fill: { color: C.bg, transparency: 20 } });
    rect(s, { x: 0, y: 0, w: 0.25, h: H, fill: { color: C.orange } });
    text(s, String(num).padStart(2, "0"), { x: 0.9, y: 1.6, w: 4, h: 2.0, fontSize: 130, bold: true, color: C.orange });
    text(s, "SECTION", { x: 0.95, y: 1.3, w: 4, h: 0.4, fontSize: 14, bold: true, color: C.white, charSpacing: 6 });
    text(s, title, { x: 0.9, y: 3.7, w: 11, h: 1.0, fontSize: 52, bold: true, color: C.white });
    text(s, subtitle, { x: 0.95, y: 4.75, w: 10, h: 0.9, fontSize: 20, color: C.text });
    text(s, `${BRAND.name}  |  ${BRAND.handle}`, { x: W - M - 4, y: 7.02, w: 4, h: 0.3, fontSize: 10, color: C.text, align: "right" });
    return s;
  };

  const LETTERS = ["A", "B", "C", "D"];

  const optionGrid = (s, options, o = {}) => {
    const gx = 0.3;
    const gy = 0.25;
    const ow = (CW - gx) / 2;
    const oh = o.h || 1.3;
    const top = o.y || 3.45;
    options.forEach((opt, i) => {
      const x = M + (i % 2) * (ow + gx);
      const y = top + Math.floor(i / 2) * (oh + gy);
      round(s, { x, y, w: ow, h: oh, fill: { color: C.panel }, line: { color: C.rule, width: 1 } });
      s.addShape(pptx.ShapeType.ellipse, { x: x + 0.22, y: y + oh / 2 - 0.3, w: 0.6, h: 0.6, fill: { color: C.orange }, line: { type: "none" } });
      text(s, LETTERS[i], { x: x + 0.22, y: y + oh / 2 - 0.3, w: 0.6, h: 0.6, align: "center", valign: "middle", fontSize: 20, bold: true, color: C.bg });
      text(s, opt, { x: x + 1.0, y: y + 0.1, w: ow - 1.2, h: oh - 0.2, valign: "middle", fontSize: 15, color: C.white });
    });
  };

  const question = (q, i, total) => {
    const s = slide(q.notesQ);
    pill(s, `EXAM QUESTION ${i} / ${total}`, M, 0.5, { w: 2.9 });
    pill(s, "PAUSE THE VIDEO AND ANSWER", M + 3.1, 0.5, { w: 3.6, fill: C.red, color: C.white });
    text(s, q.topic.toUpperCase(), { x: W - M - 4, y: 0.5, w: 4, h: 0.38, align: "right", valign: "middle", fontSize: 12, bold: true, color: C.muted, charSpacing: 2 });
    round(s, { x: M, y: 1.15, w: CW, h: 2.05, fill: { color: C.panel2 } });
    text(s, q.scenario, { x: M + 0.35, y: 1.25, w: CW - 0.7, h: 1.85, fontSize: 18, color: C.white, valign: "middle", lineSpacingMultiple: 1.1 });
    optionGrid(s, q.options);
    return s;
  };

  const answer = (q, i) => {
    const s = slide(q.notesA);
    pill(s, `ANSWER ${i}`, M, 0.5, { w: 1.7, fill: C.green });
    text(s, q.topic.toUpperCase(), { x: W - M - 4, y: 0.5, w: 4, h: 0.38, align: "right", valign: "middle", fontSize: 12, bold: true, color: C.muted, charSpacing: 2 });

    round(s, { x: M, y: 1.1, w: CW, h: 2.35, fill: { color: C.greenDark }, line: { color: C.green, width: 2 } });
    s.addShape(pptx.ShapeType.ellipse, { x: M + 0.3, y: 1.35, w: 0.75, h: 0.75, fill: { color: C.green }, line: { type: "none" } });
    text(s, LETTERS[q.correct], { x: M + 0.3, y: 1.35, w: 0.75, h: 0.75, align: "center", valign: "middle", fontSize: 26, bold: true, color: C.bg });
    if (q.icons) {
      q.icons.forEach((ic, k) => s.addImage({ path: icon(ic), x: W - M - 0.85 - k * 0.75, y: 1.3, w: 0.6, h: 0.6 }));
    }
    text(s, q.options[q.correct], { x: M + 1.3, y: 1.3, w: CW - 1.6 - (q.icons ? q.icons.length * 0.75 : 0), h: 0.9, fontSize: 20, bold: true, color: C.white, valign: "middle" });
    text(s, [
      { text: "Why it wins:  ", options: { bold: true, color: C.green } },
      { text: q.why, options: { color: C.text } },
    ], { x: M + 1.3, y: 2.25, w: CW - 1.6, h: 1.1, fontSize: 15, lineSpacingMultiple: 1.05 });

    text(s, "WHY THE OTHER OPTIONS ARE TRAPS", { x: M, y: 3.7, w: CW, h: 0.35, fontSize: 12, bold: true, color: C.red, charSpacing: 3 });
    const traps = q.options.map((opt, k) => ({ opt, k })).filter((t) => t.k !== q.correct);
    const gx = 0.25;
    const tw = (CW - gx * 2) / 3;
    traps.forEach((t, j) => {
      const x = M + j * (tw + gx);
      round(s, { x, y: 4.15, w: tw, h: 2.6, fill: { color: C.panel }, line: { color: "4A2A33", width: 1 } });
      s.addShape(pptx.ShapeType.ellipse, { x: x + 0.22, y: 4.33, w: 0.5, h: 0.5, fill: { color: C.red }, line: { type: "none" } });
      text(s, LETTERS[t.k], { x: x + 0.22, y: 4.33, w: 0.5, h: 0.5, align: "center", valign: "middle", fontSize: 16, bold: true, color: C.white });
      text(s, t.opt, { x: x + 0.85, y: 4.28, w: tw - 1.0, h: 0.65, fontSize: 11.5, color: C.muted, italic: true, valign: "middle" });
      text(s, q.traps[t.k], { x: x + 0.22, y: 5.02, w: tw - 0.44, h: 1.6, fontSize: 15, color: C.white, lineSpacingMultiple: 1.05 });
    });
    return s;
  };

  return { slide, text, rect, round, arrow, pill, header, card, flow, tip, photoBackdrop, section, question, answer };
}

module.exports = { BRAND, C, FONT, W, H, M, CW, icon, photo, createHelpers };
