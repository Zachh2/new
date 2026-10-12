// ===========================================================================
// utils/boot.js — console boot sequence
// Purely presentational: nothing here touches bot behaviour.
// ===========================================================================
const chalk = require("chalk");

const W = 66;
const strip = (s) => String(s).replace(/\x1B\[[0-9;]*m/g, "");
const pad = (s, n) => String(s) + " ".repeat(Math.max(0, n - strip(s).length));
const center = (s, n) => {
  const len = strip(s).length;
  const l = Math.max(0, Math.floor((n - len) / 2));
  return " ".repeat(l) + s + " ".repeat(Math.max(0, n - len - l));
};

const C = {
  edge: chalk.hex("#312e81"),
  a:    chalk.hex("#6366f1"),
  b:    chalk.hex("#22d3ee"),
  c:    chalk.hex("#d946ef"),
  dim:  chalk.hex("#4b5563"),
  text: chalk.hex("#e2e8f0"),
  ok:   chalk.hex("#10b981"),
  warn: chalk.hex("#f59e0b"),
  err:  chalk.hex("#f43f5e"),
};

// original block lettering, drawn with half-block glyphs
const LETTERS = {
  Z: ["███", "  █", " █ ", "█  ", "███"],
  A: ["█▀█", "█ █", "███", "█ █", "█ █"],
  C: ["███", "█  ", "█  ", "█  ", "███"],
  H: ["█ █", "█ █", "███", "█ █", "█ █"],
  O: ["███", "█ █", "█ █", "█ █", "███"],
  R: ["██ ", "█ █", "██ ", "█ █", "█ █"],
  E: ["███", "█  ", "██ ", "█  ", "███"],
  " ": ["  ", "  ", "  ", "  ", "  "],
};

function wordmark(text) {
  const rows = ["", "", "", "", ""];
  for (const ch of text.toUpperCase()) {
    const g = LETTERS[ch] || LETTERS[" "];
    for (let i = 0; i < 5; i++) rows[i] += g[i] + " ";
  }
  // vertical gradient across the five rows
  const shades = [C.a, C.a, C.b, C.b, C.c];
  return rows.map((r, i) => shades[i](r));
}

function banner(name, version) {
  console.log();
  for (const row of wordmark(name)) console.log("  " + row);
  console.log("  " + C.dim("v" + version + "  ·  facebook messenger bot"));
  console.log();
}

function box(title, rows) {
  console.log(C.edge("╭" + "─".repeat(W - 2) + "╮"));
  if (title) {
    console.log(C.edge("│") + C.a(center(title.toUpperCase(), W - 2)) + C.edge("│"));
    console.log(C.edge("├" + "─".repeat(W - 2) + "┤"));
  }
  for (const [k, v, tone] of rows) {
    const val = (tone || C.text)(String(v));
    console.log(
      C.edge("│ ") + C.dim(pad(k, 20)) + pad(val, W - 24) + C.edge(" │")
    );
  }
  console.log(C.edge("╰" + "─".repeat(W - 2) + "╯"));
}

// live progress bar, redrawn in place
function progress(label, done, total, extra) {
  const width = 30;
  const pct = total ? done / total : 1;
  const full = Math.round(pct * width);
  const bar = C.a("━".repeat(full)) + C.dim("━".repeat(width - full));
  const tail = extra ? C.dim("  " + String(extra).slice(0, 22)) : "";
  process.stdout.write(
    `\r  ${C.b("▸")} ${C.text(pad(label, 10))} ${bar} ${C.dim(String(done).padStart(3) + "/" + total)}${tail}   `
  );
  if (done >= total) process.stdout.write("\n");
}

function ready(rows) {
  console.log();
  console.log(C.edge("╭" + "─".repeat(W - 2) + "╮"));
  console.log(C.edge("│") + C.ok(center("● ONLINE", W - 2)) + C.edge("│"));
  console.log(C.edge("├" + "─".repeat(W - 2) + "┤"));
  for (const [k, v, tone] of rows) {
    console.log(C.edge("│ ") + C.dim(pad(k, 20)) + pad((tone || C.text)(String(v)), W - 24) + C.edge(" │"));
  }
  console.log(C.edge("╰" + "─".repeat(W - 2) + "╯"));
  console.log();
}

function rule(label) {
  if (!label) return console.log(C.edge("─".repeat(W)));
  const l = ` ${label} `;
  const left = Math.max(0, Math.floor((W - l.length) / 2));
  console.log(C.edge("─".repeat(left)) + C.a(l) + C.edge("─".repeat(Math.max(0, W - left - l.length))));
}

module.exports = { banner, box, progress, ready, rule, colors: C };
