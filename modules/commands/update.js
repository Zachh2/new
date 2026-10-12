const i18n = require('../../includes/i18n');

module.exports.config = {
  name: 'update',
  version: '1.1.0',
  hasPermssion: 0,
  credits: 'CHIA BOT',
  description: 'Show the two-minute update notice',
  descriptionKey: "cmd.update.description",
  usePrefix: true,
  commandCategory: 'system',
  usages: '',
  cooldowns: 5
};

const notices = {
  tl: { message: 'Mag-a-update sa loob ng 2 minuto. Pakihintay.', time: 'Tantiyang oras', footer: 'Pakihintay muna' },
  en: { message: 'Updating in 2 mins, please wait.', time: 'Estimated time', footer: 'Please wait' },
  ilo: { message: 'Ag-update iti uneg ti 2 a minuto. Urayem man.', time: 'Nabayag a tiempo', footer: 'Urayem man' },
  ceb: { message: 'Mag-update sulod sa 2 minutos. Palihug paghulat.', time: 'Gibanabanang oras', footer: 'Palihug paghulat' },
  hil: { message: 'Mag-update sa sulod sang 2 ka minuto. Palihog hulat.', time: 'Ginabana-bana nga oras', footer: 'Palihog hulat' }
};

module.exports.run = async function ({ api, event }) {
  const notice = notices[i18n.language(event.threadID)] || notices.en;
  const body = [
    '╭┈ ❒ [ UPDATE ⏳ ]',
    `├ 🔄 ${notice.message}`,
    `├ ⏱️ ${notice.time}: 02:00`,
    `╰┈➤ ${notice.footer}`
  ].join('\n');
  try { api.setMessageReaction('⏳', event.messageID, () => {}, true); } catch (_) {}
  try {
    return await api.sendMessage(body, event.threadID, event.messageID);
  } catch (error) {
    try { api.setMessageReaction('❌', event.messageID, () => {}, true); } catch (_) {}
    throw error;
  }
};
