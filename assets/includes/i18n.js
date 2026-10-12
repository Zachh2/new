'use strict';
const { AsyncLocalStorage } = require('async_hooks');
const fs = require('fs');
const path = require('path');
const state = require('./threadState');
const personality = require('./personality');
const context = new AsyncLocalStorage();
const catalog = require('../languages/messages.json');
const extra = require('../languages/extra-locales.json');
const common = require('../languages/common-locales.json');
const feature = require('../languages/feature-locales.json');
const technical = require('../languages/technical-locales.json');
const essentials = require('../languages/essentials-locales.json');
const middle = require('../languages/middle-locales.json');
const later = require('../languages/later-locales.json');
const upper = require('../languages/upper-locales.json');
const finalLocales = require('../languages/final-locales.json');
const metadata = require('../languages/metadata-locales.json');
const descriptions = require('../languages/command-descriptions.json');
const missingTagalogDescriptions = {
  ban: 'Permanenteng i-ban ang miyembro ng grupo; kailangan ng bot ng admin access.',
  language: 'Palitan ang wika ng GC.',
  pending: 'Tingnan at aprubahan ang mga pending na GC.',
  xp: 'Sistema ng EXP na naka-sync sa usersData.json.'
};
const sources = new Map(Object.entries(catalog).map(([id, item]) => [item.source || item.en, id]));
const dictionaries = {};
const categoryNames = {
  tl: { group: 'Grupo', utility: 'Kasangkapan', utilities: 'Mga kasangkapan', developer: 'Developer', media: 'Midya', economy: 'Ekonomiya', system: 'Sistema', message: 'Mensahe', game: 'Laro', fun: 'Libangan', tool: 'Kasangkapan', music: 'Musika', image: 'Larawan', other: 'Iba pa', admin: 'Admin', 'edit-img': 'Pag-edit ng larawan', 'edit-image': 'Pag-edit ng larawan', chatbots: 'Chatbot' },
  ilo: { group: 'Grupo', utility: 'Ramramit', utilities: 'Ramramit', developer: 'Mangaramid', media: 'Midia', economy: 'Ekonomia', system: 'Sistema', message: 'Mensahe', game: 'Ay-ayam', fun: 'Paglinglingayan', tool: 'Ramramit', music: 'Musika', image: 'Ladawan', other: 'Dadduma pay', admin: 'Admin', 'edit-img': 'Panangurnos ti ladawan', 'edit-image': 'Panangurnos ti ladawan', chatbots: 'Chatbot' },
  ceb: { group: 'Grupo', utility: 'Himan', utilities: 'Mga himan', developer: 'Tig-develop', media: 'Midya', economy: 'Ekonomiya', system: 'Sistema', message: 'Mensahe', game: 'Dula', fun: 'Kalingawan', tool: 'Himan', music: 'Musika', image: 'Hulagway', other: 'Uban pa', admin: 'Admin', 'edit-img': 'Pag-edit sa hulagway', 'edit-image': 'Pag-edit sa hulagway', chatbots: 'Chatbot' },
  hil: { group: 'Grupo', utility: 'Kasangkapan', utilities: 'Mga kasangkapan', developer: 'Tig-develop', media: 'Midya', economy: 'Ekonomiya', system: 'Sistema', message: 'Mensahe', game: 'Hampang', fun: 'Kalingawan', tool: 'Kasangkapan', music: 'Musika', image: 'Laragway', other: 'Iban pa', admin: 'Admin', 'edit-img': 'Pag-edit sang laragway', 'edit-image': 'Pag-edit sang laragway', chatbots: 'Chatbot' }
};
function localized(id, lang) {
  const column = { ilo: 0, ceb: 1, hil: 2 }[lang];
  return column === undefined ? undefined : (common[id] || feature[id] || technical[id] || essentials[id] || middle[id] || later[id] || upper[id] || finalLocales[id] || metadata[id])?.[column];
}
function language(threadID = context.getStore()?.threadID) {
  if (threadID != null) { const saved = state.get(threadID).language; if (saved) return saved; }
  return global.config?.language === 'tl' ? 'tl' : 'en';
}
function run(threadID, task) { return context.run({ threadID: String(threadID) }, task); }
function bind(fn) {
  const current = context.getStore();
  return current && typeof fn === 'function' ? function (...args) { return context.run(current, () => fn.apply(this, args)); } : fn;
}
function t(id, values = [], lang = language()) {
  const entry = catalog[id];
  if (!entry) throw new Error('Missing translation: ' + id);
  return String(localized(id, lang) || extra[id]?.[lang] || entry[lang] || entry.en).replace(/\{(\d+)\}/g, (match, n) => n < values.length ? String(values[n]) : match);
}
function translate(source, lang = language()) {
  if (typeof source !== 'string') return source;
  const category = categoryNames[lang]?.[source.trim().toLowerCase()];
  if (category) return category;
  const id = sources.get(source);
  return id ? (localized(id, lang) || extra[id]?.[lang] || catalog[id][lang] || catalog[id].en) : source;
}
function commandDescription(command, threadID) {
  const lang = language(threadID);
  const original = command?.config?.description || 'No description';
  const choice = { ilo: 0, ceb: 1, hil: 2 }[lang];
  const aliases = { adown: 'autodl', autorep: 'autoreply', bratex: 'brat', cmd: 'command', note: 'notes', sharecontact: 'shareContact', sim: 'simv3', spotify: 'spt', 'xp-event': 'xp' };
  const name = aliases[command?.config?.name] || command?.config?.name;
  if (choice !== undefined && descriptions[name]?.[choice]) return descriptions[name][choice];
  if (lang === 'tl' && missingTagalogDescriptions[name]) return missingTagalogDescriptions[name];
  return translate(original, lang);
}
function dictionary(lang) {
  if (!dictionaries[lang]) {
    const dict = {};
    for (const line of fs.readFileSync(path.join(__dirname, '../languages', lang + '.lang'), 'utf8').split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const at = line.indexOf('=');
      if (at > 0) dict[line.slice(0, at).trim()] = line.slice(at + 1).replace(/\\n/g, '\n');
    }
    dictionaries[lang] = dict;
  }
  return dictionaries[lang];
}
function percent(source, values) {
  return String(source).replace(/%(\d+)/g, (match, n) => n > 0 && n <= values.length ? String(values[n - 1]) : match);
}
function system(section, key, ...values) {
  const lookup = section + '.' + key;
  return percent(dictionary(language())[lookup] || dictionary('en')[lookup] || lookup, values);
}
function commandText(command, threadID) {
  return (key, ...values) => {
    const lang = language(threadID), dicts = command?.languages || {};
    const source = dicts[lang]?.[key] ?? dicts.en?.[key] ?? '';
    return percent(translate(source, lang), values);
  };
}
function prompt(question, threadID) {
  const instructions = {
    tl: 'Sagutin sa Tagalog ang tanong. Panatilihin ang code, pangalan, URL at eksaktong sipi kung kailangan.',
    en: 'Answer the question in English. Preserve code, names, URLs and exact quotations where needed.',
    ilo: 'Sungbatan ti saludsod iti Ilocano. Taginayonen ti code, nagan, URL ken eksakto a naisurat no kasapulan.',
    ceb: 'Tubaga ang pangutana sa Cebuano. Hupti ang code, mga ngalan, URL ug eksaktong kinutlo kon gikinahanglan.',
    hil: 'Sabta ang pamangkot sa Hiligaynon. Tipigi ang code, mga ngalan, URL kag eksakto nga kinutlo kon kinahanglan.'
  };
  return (instructions[language(threadID)] || instructions.en) + '\n' + personality.instruction(threadID) + '\n\n' + question;
}
// Preserve the chat context when a shared queue invokes a callback later.
function installApi(api) {
  if (api.__threadLanguage) return api;
  for (const name of Object.keys(api)) {
    if (typeof api[name] !== 'function') continue;
    const original = api[name];
    api[name] = function (...args) {
      if ((name === 'sendMessage' || name === 'editMessage') && args[0]) {
        const threadID = name === 'sendMessage' ? args[1] : (/^\d+$/.test(String(args[2])) ? args[2] : context.getStore()?.threadID);
        const lang = language(threadID);
        if (typeof args[0] === 'string') args[0] = translate(args[0], lang);
        else if (typeof args[0] === 'object' && typeof args[0].body === 'string')
          args[0] = { ...args[0], body: translate(args[0].body, lang) };
        args[0] = personality.decorate(args[0], threadID, name === 'editMessage' ? args[1] : args[3]);
      }
      return original.apply(this, args.map(arg => typeof arg === 'function' ? bind(arg) : arg));
    };
  }
  api.__threadLanguage = true;
  return api;
}
module.exports = { language, run, bind, t, translate, commandDescription, system, commandText, prompt, installApi };
