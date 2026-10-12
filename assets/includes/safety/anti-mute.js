"use strict";
// Sending permissions and account restrictions cannot be repaired by opening
// another listener. Preserve the caller's error and the existing connection.
module.exports = function(api) {
  return async function safeSend(send,args) {
    return send.apply(api,args);
  };
};
