'use strict';
const fs=require('fs');
const path=require('path');
const file=path.join(process.cwd(),'bot.lock');
module.exports=function(){
 try{
  if(fs.existsSync(file)){
   const age=Date.now()-Number(fs.readFileSync(file,'utf8'));
   if(age<21600000)return false;
  }
  fs.writeFileSync(file,String(Date.now()));
  process.on('exit',()=>{try{fs.unlinkSync(file)}catch(e){}});
  return true;
 }catch(e){return true;}
};
