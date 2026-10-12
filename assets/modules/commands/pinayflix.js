const __l = require("../../includes/i18n");

module.exports.config = {
  name: "pinayflix",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Zycke",
  description: "Send Katorsex videos",
  usePrefix: true,
  commandCategory: "media",
  usages: "[page]",
  cooldowns: 5
};


module.exports.handleReply = async function({
  api,
  event,
  handleReply
}) {

const axios = require("axios");
const fs = global.nodemodule["fs-extra"];
const path = require("path");


const {
 threadID,
 messageID,
 body,
 senderID
} = event;



if(senderID != handleReply.author) return;



const choice = parseInt(body);



if(
isNaN(choice) ||
choice < 1 ||
choice > handleReply.data.length
){

return api.sendMessage(
`❌ Choose only 1-${handleReply.data.length}`,
threadID,
messageID
);

}



const pick = handleReply.data[choice - 1];



api.sendMessage(
"⏳ Downloading video...",
threadID,
async(err,info)=>{


if(err)return;



try{


const videoURL = pick.downloadUrl;



console.log(
"VIDEO URL:",
videoURL
);



if(!videoURL){

return api.editMessage(
"❌ No video link found.",
info.messageID,
threadID
);

}




const file = path.join(
__dirname,
"cache",
`kator_${Date.now()}.mp4`
);





const response = await axios({

url: videoURL,

method:"GET",

responseType:"stream",

maxRedirects:10,

headers:{
"User-Agent":
"Mozilla/5.0",
"Referer":
"https://katorsex.me/"
},

timeout:120000

});




const writer =
fs.createWriteStream(file);



response.data.pipe(writer);




writer.on(
"finish",
()=>{


api.editMessage(
"✅ Sending video...",
info.messageID,
threadID
);



api.sendMessage(
{

body:
`🎬 ${pick.title}`,

attachment:
fs.createReadStream(file)

},

threadID,

()=>{

try{
fs.unlinkSync(file);
}
catch(e){}

},

messageID

);



}

);



writer.on(
"error",
(err)=>{


console.log(err);


api.editMessage(
"❌ Download error.",
info.messageID,
threadID
);


}

);



}
catch(e){


console.log(e);


api.editMessage(
"❌ Failed to get video.",
info.messageID,
threadID
);


}



});


};






module.exports.run = async function({
api,
event,
args
}){


const axios = require("axios");


const {
threadID,
messageID,
senderID
}=event;



const page =
args[0] || 1;



api.sendMessage(
"⏳ Loading Katorsex...",
threadID,
async(err,info)=>{


if(err)return;



try{


const res = await axios.get(

`https://betadash-api-swordslush-production.up.railway.app/katorsex?page=${page}`,

{
headers:{
"User-Agent":"Mozilla/5.0"
}
}

);




const data =
res.data.results;




if(!data || data.length === 0){

return api.editMessage(
"❌ No videos found.",
info.messageID,
threadID
);

}




const list =
data.slice(0,5);




let msg =
"🎬 KATORSEX VIDEOS\n\n";




list.forEach(
(item,index)=>{

msg +=
`${index+1}. ${item.title}\n\n`;

}

);



msg +=
"Reply number to download";




api.editMessage(
msg,
info.messageID,
threadID
);




global.client.handleReply.push({

name:this.config.name,

messageID:
info.messageID,

author:
senderID,

data:list

});





}
catch(e){


console.log(e);


api.editMessage(
"❌ API Error.",
info.messageID,
threadID
);


}



});


};