const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
function createLyricsClient({cacheDir,fetchImpl=fetch,now=Date.now,spacingMs=750}){
 const memory=new Map(),pending=new Map();let tail=Promise.resolve(),last=0,cooldown=0;
 async function lookup(track){
  const duration=Number(track.duration);if(!track.title||!track.artist||/^unknown artist$/i.test(track.artist)||!Number.isFinite(duration)||duration<1||duration>3600)return{available:false,message:'Finish reading track tags, or use a matching local LRC file.'};
  const signature={track_name:track.title,artist_name:track.artist,album_name:track.album||'',duration:Math.round(duration)};const key=createHash('sha256').update(JSON.stringify(signature)).digest('hex');
  const existing=memory.get(key);if(existing?.expires>now())return existing.value;
  if(cacheDir)try{const file=path.join(cacheDir,key+'.json');if((await fs.stat(file)).size<600000){const stored=JSON.parse(await fs.readFile(file,'utf8'));if(stored.expires>now()){memory.set(key,stored);return stored.value;}}}catch{}
  if(pending.has(key))return pending.get(key);
  if(pending.size>=20)return{available:false,message:'Lyrics lookup is busy. Try again shortly.'};
  const job=tail.catch(()=>{}).then(async()=>{
   if(cooldown>now())return{available:false,message:'Lyrics provider is busy. Try again later.'};
   const wait=Math.max(0,spacingMs-(now()-last));if(wait)await new Promise(r=>setTimeout(r,wait));last=now();
   const url=new URL('https://lrclib.net/api/get');for(const[k,v]of Object.entries(signature))url.searchParams.set(k,String(v));
   let response;try{response=await fetchImpl(url,{headers:{'User-Agent':'Mythic Reverie v0.3.2 (https://github.com/Subuwu97/io-cinema)'},signal:AbortSignal.timeout(10000),redirect:'error'});}catch{return{available:false,message:'Automatic lyrics could not be reached. Local LRC files still work.'};}
   if(response.status===429||response.status===503){const retry=response.headers.get('retry-after'),seconds=Number(retry),delay=retry&&Number.isFinite(seconds)?seconds*1000:retry?Date.parse(retry)-now():60000;cooldown=now()+Math.max(1000,Number.isFinite(delay)?delay:60000)+500;return{available:false,message:'Lyrics provider asked us to wait. Try again later.'};}
   let value;
   if(response.status===404)value={available:false,message:'No matching synced lyrics were found.'};
   else if(!response.ok)return{available:false,message:'Automatic lyrics are temporarily unavailable.'};
   else{if(Number(response.headers.get('content-length')||0)>512*1024)return{available:false,message:'Lyrics response was too large.'};const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>512*1024)return{available:false,message:'Lyrics response was too large.'};chunks.push(chunk);}let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return{available:false,message:'Lyrics provider returned an unreadable response.'};}
    const matches=normalize(data.trackName||data.name)===normalize(track.title)&&normalize(data.artistName)===normalize(track.artist)&&Number.isFinite(Number(data.duration))&&Math.abs(Number(data.duration)-duration)<=2.5;
    if(!matches)value={available:false,message:'Lyrics matched a different recording. Use a local LRC file for this version.'};
    else if(data.instrumental)value={available:false,instrumental:true,source:'LRCLIB',message:'This recording is listed as instrumental.'};
    else if(typeof data.syncedLyrics==='string'&&data.syncedLyrics.length<=512*1024&&/\[\d{1,3}:\d{2}/.test(data.syncedLyrics))value={available:true,text:data.syncedLyrics,source:'LRCLIB',providerId:Number.isInteger(data.id)?data.id:null};
    else value={available:false,source:'LRCLIB',message:'No timed lyrics are available for this recording. Use a local LRC file.'};
   }
   const stored={expires:now()+(value.available?30*86400000:6*3600000),value};if(memory.size>=500)memory.delete(memory.keys().next().value);memory.set(key,stored);if(cacheDir)try{await fs.mkdir(cacheDir,{recursive:true});await fs.writeFile(path.join(cacheDir,key+'.json'),JSON.stringify(stored),{mode:0o600});}catch{}return value;
  });tail=job;pending.set(key,job);try{return await job;}finally{pending.delete(key);}
 }
 return{lookup};
}
module.exports={createLyricsClient};
