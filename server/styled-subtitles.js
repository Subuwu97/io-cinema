const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
function createStyledSubtitles({directory,assService,stat}){
 const pending=new Map();
 return async function prepare(file,index){
  const info=await stat(file),key=crypto.createHash('sha256').update(file+'|'+info.mtimeMs+'|'+index).digest('hex');
  const relative='styled-subs/'+key,folder=path.join(directory,relative);
  const result={subtitleFile:relative+'/track.ass',subtitleFonts:relative,subtitleCwd:directory};
  try{await fs.access(path.join(folder,'ready'));return result;}catch{}
  if(pending.has(key))return pending.get(key);
  const job=(async()=>{const manifest=await assService.manifest(file,index);await fs.mkdir(folder,{recursive:true});
   await fs.writeFile(path.join(folder,'track.ass'),await assService.extract(file,index));
   for(const font of manifest.fonts)await fs.writeFile(path.join(folder,'font-'+font+'.ttf'),await assService.extract(file,font,true));
   await fs.writeFile(path.join(folder,'ready'),'1');return result;
  })().finally(()=>pending.delete(key));pending.set(key,job);return job;
 };
}
module.exports={createStyledSubtitles};
