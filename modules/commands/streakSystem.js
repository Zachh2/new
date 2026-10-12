"use strict";
// Compatibility shim. The main listener owns streak observation now.
// This does not write root usersData.json or create another notification path.
module.exports.updateStreak = async function(api,event) {
  return require('../../includes/smartGroups').observeActivity(event);
};
