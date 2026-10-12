const chalk = require("chalk");
const gradient = require("gradient-string");
const con = require("./../config.json");

function getThemeColors() {
  const theme = con.DESIGN.Theme;
  let subcolor, main, error, secondary, tertiary, html;

  switch (theme.toLowerCase()) {
    case "blue":
      main = gradient("yellow", "lime", "green"); // cra
      subcolor = gradient("#243aff", "#4687f0", "#5800d4"); // co
      secondary = chalk.blueBright; // cb
      tertiary = chalk.bold.hex("#3467eb"); // cv
      error = chalk.hex("#ff0000").bold;
      html = ["#1702CF", "#11019F ", "#1401BF"];
      break;
    case "fiery":
      main = gradient("orange", "orange", "yellow");
      subcolor = gradient("#fc2803", "#fc6f03", "#fcba03");
      secondary = chalk.hex("#fff308");
      tertiary = chalk.bold.hex("#fc3205");
      error = chalk.red.bold;
      html = ["#CE2F16", "#fe8916", "#ff952a"];
      break;
    case "red":
      main = gradient("yellow", "lime", "green");
      subcolor = gradient("red", "orange");
      secondary = chalk.hex("#ff0000");
      tertiary = chalk.bold.hex("#ff0000");
      error = chalk.red.bold;
      html = ["#ff0000", "#ff4747", "#ff0026"];
      break;
    case "aqua":
      main = gradient("#6883f7", "#8b9ff7", "#b1bffc");
      subcolor = gradient("#0030ff", "#4e6cf2");
      secondary = chalk.hex("#3056ff");
      tertiary = chalk.bold.hex("#0332ff");
      error = chalk.blueBright;
      html = ["#2e5fff", "#466deb", "#1BD4F5"];
      break;
    case "pink":
      main = gradient("purple", "pink");
      subcolor = gradient("#d94fff", "purple");
      secondary = chalk.hex("#6a00e3");
      tertiary = chalk.bold.hex("#6a00e3");
      error = gradient("purple", "pink");
      html = ["#ab68ed", "#ea3ef0", "#c93ef0"];
      break;
    case "retro":
      main = gradient("orange", "purple");
      subcolor = gradient.retro;
      secondary = chalk.hex("#ffce63");
      tertiary = chalk.bold.hex("#3c09ab");
      error = gradient("#d94fff", "purple");
      html = ["#7d02bf", "#FF6F6F", "#E67701"];
      break;
    case "sunlight":
      main = gradient("#f5bd31", "#f5e131");
      subcolor = gradient("orange", "#ffff00", "#ffe600");
      secondary = chalk.hex("#faf2ac");
      tertiary = chalk.bold.hex("#ffe600");
      error = gradient("#f5bd31", "#f5e131");
      html = ["#ffae00", "#ffbf00", "#ffdd00"];
      break;
    case "teen":
      main = gradient("#81fcf8", "#853858");
      subcolor = gradient.teen;
      secondary = chalk.hex("#a1d5f7");
      tertiary = chalk.bold.hex("#ad0042");
      error = gradient("#00a9c7", "#853858");
      html = ["#29D5FB", "#9CFBEF", "#fa7f7f"];
      break;
    case "summer":
      main = gradient("#fcff4d", "#4de1ff");
      subcolor = gradient.summer;
      secondary = chalk.hex("#ffff00");
      tertiary = chalk.bold.hex("#fff700");
      error = gradient("#fcff4d", "#4de1ff");
      html = ["#f7f565", "#16FAE3", "#16D1FA"];
      break;
    case "flower":
      main = gradient("yellow", "yellow", "#81ff6e");
      subcolor = gradient.pastel;
      secondary = gradient("#47ff00", "#47ff75");
      tertiary = chalk.bold.hex("#47ffbc");
      error = gradient("blue", "purple", "yellow", "#81ff6e");
      html = ["#16B6FA", "#FB7248", "#13FF9C"];
      break;
    case "ghost":
      main = gradient("#0a658a", "#0a7f8a", "#0db5aa");
      subcolor = gradient.mind;
      secondary = chalk.blueBright;
      tertiary = chalk.bold.hex("#1390f0");
      error = gradient("#0a658a", "#0a7f8a", "#0db5aa");
      html = ["#076889", "#0798C7", "#95d0de"];
      break;
    case "hacker":
      main = chalk.hex("#4be813");
      subcolor = gradient("#47a127", "#0eed19", "#27f231");
      secondary = chalk.hex("#22f013");
      tertiary = chalk.bold.hex("#0eed19");
      error = chalk.hex("#4be813");
      html = ["#049504", "#0eed19", "#01D101"];
      break;
    case "purple":
      main = chalk.hex("#7a039e");
      subcolor = gradient("#243aff", "#4687f0", "#5800d4");
      secondary = chalk.hex("#6033f2");
      tertiary = chalk.bold.hex("#5109eb");
      error = chalk.hex("#7a039e");
      html = ["#380478", "#5800d4", "#4687f0"];
      break;
    case "rainbow":
      main = chalk.hex("#0cb3eb");
      subcolor = gradient.rainbow;
      secondary = chalk.hex("#ff3908");
      tertiary = chalk.bold.hex("#f708ff");
      error = chalk.hex("#ff8400");
      html = ["#E203B2", "#06DBF7", "#F70606"];
      break;
    case "orange":
      main = chalk.hex("#ff8400");
      subcolor = gradient("#ff8c08", "#ffad08", "#f5bb47");
      secondary = chalk.hex("#ebc249");
      tertiary = chalk.bold.hex("#ff8c08");
      error = chalk.hex("#ff8400");
      html = ["#ff8c08", "#ffad08", "#f5bb47"];
      break;
    default:
      main = gradient("yellow", "lime", "green");
      subcolor = gradient("#243aff", "#4687f0", "#5800d4");
      secondary = chalk.blueBright;
      tertiary = chalk.bold.hex("#3467eb");
      error = chalk.red.bold;
      html = ["#1702CF", "#11019F ", "#1401BF"];
      break;
  }
  return { main, subcolor, error, secondary, tertiary, html };
}

// ===========================================================================
// CONSOLE RENDERER
// Every previously exported function is preserved so existing call sites keep
// working; the formatting underneath is aligned, timestamped and boxed.
// ===========================================================================

const W = 64;                                   // box width
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - stripAnsi(String(s)).length));
const stripAnsi = (s) => String(s).replace(/\x1B\[[0-9;]*m/g, '');

const C = {
  dim:   chalk.hex('#4b5563'),
  rule:  chalk.hex('#312e81'),
  label: chalk.hex('#818cf8'),
  ok:    chalk.hex('#10b981'),
  warn:  chalk.hex('#f59e0b'),
  err:   chalk.hex('#f43f5e'),
  info:  chalk.hex('#22d3ee'),
  text:  chalk.hex('#e2e8f0'),
};

const TAGS = {
  SYSTEM:   C.label('◆'),
  DATABASE: C.info('▣'),
  COMMAND:  C.label('▸'),
  EVENT:    C.info('◈'),
  ERROR:    C.err('✖'),
  WARN:     C.warn('▲'),
  OK:       C.ok('✔'),
};

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return C.dim(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
}

function line(tag, text, colour) {
  const icon = TAGS[tag] || C.label('·');
  const name = (colour || C.label)(pad(tag, 9));
  console.log(`${stamp()} ${icon} ${name} ${C.text(text)}`);
}

// ---- decorative helpers -------------------------------------------------
function rule(label) {
  if (!label) return console.log(C.rule('─'.repeat(W)));
  const l = ` ${label} `;
  const left = Math.max(0, Math.floor((W - l.length) / 2));
  console.log(C.rule('─'.repeat(left)) + C.label(l) + C.rule('─'.repeat(Math.max(0, W - left - l.length))));
}

function box(title, rows) {
  console.log(C.rule('╭' + '─'.repeat(W - 2) + '╮'));
  if (title) {
    console.log(C.rule('│ ') + C.label(pad(title.toUpperCase(), W - 4)) + C.rule('│'));
    console.log(C.rule('├' + '─'.repeat(W - 2) + '┤'));
  }
  for (const [k, v] of rows) {
    const key = C.dim(pad(k, 18));
    const val = C.text(String(v).slice(0, W - 24));
    console.log(C.rule('│ ') + key + pad(val, W - 22) + C.rule('│'));
  }
  console.log(C.rule('╰' + '─'.repeat(W - 2) + '╯'));
}

function bar(done, total, label) {
  const width = 28;
  const pct = total ? done / total : 0;
  const full = Math.round(pct * width);
  const filled = C.label('█'.repeat(full));
  const empty = C.dim('░'.repeat(width - full));
  const txt = `${String(done).padStart(3)}/${total}`;
  process.stdout.write(`\r${stamp()} ${TAGS.COMMAND} ${C.label(pad(label || 'LOADING', 9))} ${filled}${empty} ${C.text(txt)}`);
  if (done >= total) process.stdout.write('\n');
}

module.exports = {
  getThemeColors,
  colors: C,
  rule,
  box,
  bar,

  // ---- original API, reformatted ----
  log: (text, type) => {
    const t = String(type || 'SYSTEM').toUpperCase();
    if (t === 'WARN')       return line('WARN', text, C.warn);
    if (t === 'ERROR')      return line('ERROR', text, C.err);
    if (t === 'LOAD')       return line('DATABASE', text, C.info);
    return line(TAGS[t] ? t : 'SYSTEM', text);
  },

  error: (text, type) => line('ERROR', `${type ? '[' + type + '] ' : ''}${text}`, C.err),
  err:   (text, type) => line('ERROR', `${type ? '[' + type + '] ' : ''}${text}`, C.err),
  warn:  (text, type) => line('WARN',  `${type ? '[' + type + '] ' : ''}${text}`, C.warn),

  loader: (data, option) => {
    const o = String(option || '').toLowerCase();
    if (o === 'error')   return line('ERROR', data, C.err);
    if (o === 'warning' || o === 'warn') return line('WARN', data, C.warn);
    return line('SYSTEM', data);
  },

  ok:   (text) => line('OK', text, C.ok),
  info: (text) => line('EVENT', text, C.info),
};
