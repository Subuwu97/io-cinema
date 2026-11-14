const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process');const {promisify}=require('node:util');const run=promisify(execFile);
const {isWithin}=require('./path-safety');
const AUDIO=new Set(['.mp3','.m4a','.aac','.flac','.wav','.ogg','.opus','.webm']);
const id=value=>crypto.createHash('sha256').update(value).digest('hex').slice(0,32);
function fallbackTags(file,root){const rel=path.relative(root,file),parts=rel.split(path.sep);return{title:path.basename(file,path.extname(file)).replace(/^\d+[ ._-]+/,''),artist:parts.length>2?parts[parts.length-3]:'Unknown artist',album:parts.length>1?parts[parts.length-2]:'Singles',track:Number(path.basename(file).match(/^\d+/)?.[0]||0),disc:1,duration:0};}
let probeMissing=false;
async function readTags(file,root){const fallback=fallbackTags(file,root);if(probeMissing)return fallback;try{const {stdout}=await run('ffprobe',['-v','quiet','-show_entries','format=duration:format_tags=title,artist,album,album_artist,track,disc,genre,date:stream=codec_type:stream_disposition=attached_pic','-of','json',file],{timeout:8000,maxBuffer:128*1024,windowsHide:true});const parsed=JSON.parse(stdout),data=parsed.format||{},tags=Object.fromEntries(Object.entries(data.tags||{}).map(([k,v])=>[k.toLowerCase(),v]));const text=k=>String(tags[k]||'').trim().slice(0,400);return{...fallback,title:text('title')||fallback.title,artist:text('artist')||text('album_artist')||fallback.artist,album:text('album')||fallback.album,albumArtist:text('album_artist')||text('artist')||fallback.artist,genre:text('genre'),year:text('date').slice(0,4),track:parseInt(tags.track)||fallback.track,disc:parseInt(tags.disc)||1,duration:Number(data.duration)||0,hasCover:(parsed.streams||[]).some(stream=>stream.disposition?.attached_pic===1)};}catch(error){if(error.code==='ENOENT')probeMissing=true;return fallback;}}
class MusicLibrary{
 constructor({root='',probe=readTags}={}){this.root=root;this.probe=probe;this.tracks=new Map();this.albums=new Map();this.cache=new Map();this.scanning=false;this.error='';this.generation=0;this.truncated=false;}
 async scan(){
  if(this.scanning)return;
  ++this.generation;this.scanning=true;this.error='';this.truncated=false;
  this.progress={phase:'finding files',discovered:0,processed:0,skipped:0};
  try{
   if(!this.root){this.tracks.clear();this.albums.clear();return;}
   const root=await fs.realpath(this.root),files=[];this.realRoot=root;
   const walk=async(dir,depth=0)=>{
    if(depth>24||files.length>=20000){this.truncated=true;return;}
    let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch{this.progress.skipped++;return;}
    for(const entry of entries){
     if(entry.isSymbolicLink()||entry.name.startsWith('.'))continue;
     const file=path.join(dir,entry.name);
     if(entry.isDirectory())await walk(file,depth+1);
     else if(entry.isFile()&&AUDIO.has(path.extname(file).toLowerCase())){files.push(file);this.progress.discovered=files.length;}
     if(files.length>=20000){this.truncated=true;break;}
    }
   };
   await walk(root);
   if(!files.length){if(this.progress.skipped)throw Error('unreadable');this.tracks.clear();this.albums.clear();return;}
   const tracks=new Map(),albums=new Map(),covers=new Map(),usedKeys=new Set();this.tracks=tracks;this.albums=albums;
   const add=async(real,tags)=>{
    const folder=path.dirname(real),albumId=id(root+'\0'+folder+'\0'+tags.album+'\0'+(tags.albumArtist||tags.artist)),trackId=id(root+'\0'+path.relative(root,real)),old=tracks.get(trackId);
    if(old&&old.albumId!==albumId){const previous=albums.get(old.albumId);if(previous){previous.tracks=previous.tracks.filter(t=>t!==trackId);if(!previous.tracks.length)albums.delete(old.albumId);}}
    tracks.set(trackId,{...tags,id:trackId,albumId,format:path.extname(real).slice(1).toUpperCase(),file:real});
    if(!albums.has(albumId)){
     if(!covers.has(folder)){let cover=null;for(const name of ['cover.jpg','folder.jpg','cover.png','folder.png','cover.webp'])try{const candidate=await fs.realpath(path.join(folder,name));if(isWithin(root,candidate)){cover=candidate;break;}}catch{}covers.set(folder,cover);}
     if(!albums.has(albumId))albums.set(albumId,{id:albumId,title:tags.album,artist:tags.albumArtist||tags.artist,year:tags.year||'',cover:covers.get(folder),embedded:tags.hasCover?real:null,tracks:[]});
    }
    const album=albums.get(albumId);if(!album.tracks.includes(trackId))album.tracks.push(trackId);if(tags.hasCover&&!album.embedded)album.embedded=real;
   };
   // Make songs playable before slow NAS tag probes finish.
   this.progress.phase='indexing songs';const safeFiles=[];
   for(const file of files)try{const real=await fs.realpath(file);if(!isWithin(root,real)){this.progress.skipped++;continue;}safeFiles.push(real);await add(real,fallbackTags(real,root));}catch{this.progress.skipped++;}
   this.progress.phase='reading tags';let cursor=0;
   await Promise.all(Array.from({length:Math.min(4,safeFiles.length)},async()=>{
    while(cursor<safeFiles.length){const real=safeFiles[cursor++];try{const stat=await fs.stat(real),key=`${real}:${stat.size}:${stat.mtimeMs}`;const tags=this.cache.get(key)||await this.probe(real,root);this.cache.set(key,tags);usedKeys.add(key);await add(real,tags);}catch{this.progress.skipped++;}finally{this.progress.processed++;}}
   }));
   this.cache=new Map([...this.cache].filter(([key])=>usedKeys.has(key)));
  }catch{this.error='Music folder could not be scanned. Check that it is mounted on this server and readable by the Cinema service.';}
  finally{this.scanning=false;this.progress.phase=this.error?'failed':'finished';if(!this.error&&!this.tracks.size)this.error='No supported audio files found. Check the server folder and its subfolders.';}
 }
 json(){return{configured:!!this.root,scanning:this.scanning,error:this.error,progress:this.progress||null,truncated:this.truncated,tracks:[...this.tracks.values()].map(({file,...t})=>t).sort((a,b)=>a.disc-b.disc||a.track-b.track||a.title.localeCompare(b.title)),albums:[...this.albums.values()].map(({cover,embedded,...a})=>({...a,cover:cover||embedded?`/api/music/cover/${a.id}`:null})).sort((a,b)=>a.artist.localeCompare(b.artist)||a.title.localeCompare(b.title))};}
 async safeFile(file){if(!file||!this.realRoot)return null;try{const real=await fs.realpath(file);return isWithin(this.realRoot,real)&& (await fs.stat(real)).isFile()?real:null;}catch{return null;}}
}
function registerMusic(app,{requireAuth,requireAdmin,dataDir,publicOrigin=()=>''}){
 const artwork=new Map(),pendingArtwork=new Map();
 let autoLyrics=false;const lyricsClient=require('./lyrics-provider').createLyricsClient({cacheDir:path.join(dataDir,'lyrics-cache')});
 const settings=path.join(dataDir,'music-settings.json');const lib=new MusicLibrary();let ready=fs.readFile(settings,'utf8').then(text=>{const saved=JSON.parse(text);lib.root=String(saved.root||'');autoLyrics=saved.autoLyrics===true;}).catch(()=>{});let started=false;
 const safe=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(()=>{if(!res.headersSent)res.status(500).json({error:'Music request failed'});});
 app.get('/api/music',safe(async(req,res)=>{if(!requireAuth(req,res))return;await ready;if(!started){started=true;lib.scan();}res.set('Cache-Control','no-store').json({...lib.json(),autoLyrics});}));
 app.get('/api/music/settings',safe(async(req,res)=>{if(!requireAdmin(req,res))return;await ready;res.json({root:lib.root,autoLyrics});}));
 const origin=(req,res)=>{if(req.headers.origin&&!new Set([`${req.protocol}://${req.get('host')}`,publicOrigin()]).has(req.headers.origin)){res.sendStatus(403);return false;}return true;};
 app.post('/api/music/settings',safe(async(req,res)=>{if(!requireAdmin(req,res)||!origin(req,res))return;await ready;if(lib.scanning&&req.body?.root!==undefined&&req.body.root!==lib.root)return res.status(409).json({error:'Wait for the current scan to finish'});const root=req.body?.root??lib.root;if(req.body?.autoLyrics!==undefined&&typeof req.body.autoLyrics!=='boolean')return res.sendStatus(400);if(typeof root!=='string'||root.length>4096)return res.status(400).json({error:'Enter a music folder'});if(root&&!path.isAbsolute(root))return res.status(400).json({error:'Use a full folder path on the server'});if(root){try{if(!(await fs.stat(root)).isDirectory())throw Error();}catch{return res.status(400).json({error:'The server cannot read that folder'});}}await fs.writeFile(settings+'.tmp',JSON.stringify({root,autoLyrics:req.body.autoLyrics??autoLyrics}),{mode:0o600});await fs.rename(settings+'.tmp',settings);const changed=root!==lib.root;lib.root=root;autoLyrics=req.body.autoLyrics??autoLyrics;if(changed){lib.tracks.clear();lib.albums.clear();lib.cache.clear();}if(req.body.root!==undefined&&!lib.scanning){started=true;lib.scan();}res.json({ok:true,scanning:lib.scanning,autoLyrics});}));
 app.post('/api/music/rescan',safe(async(req,res)=>{if(!requireAdmin(req,res)||!origin(req,res))return;await ready;started=true;lib.scan();res.json({ok:true});}));
 app.get('/api/music/track/:id',safe(async(req,res)=>{if(!requireAuth(req,res))return;const track=lib.tracks.get(req.params.id),file=await lib.safeFile(track?.file);if(!file)return res.sendStatus(404);res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');res.sendFile(file);}));
 app.get('/api/music/lyrics-search',safe(async(req,res)=>{if(!requireAuth(req,res))return;await ready;if(!autoLyrics)return res.status(400).json({error:'Enable automatic lyrics in Music library settings first.'});res.set('Cache-Control','private, no-store').json({results:await lyricsClient.search(String(req.query.q||''))});}));
 app.get('/api/music/lyrics/:id',safe(async(req,res)=>{if(!requireAuth(req,res))return;const track=lib.tracks.get(req.params.id),source=await lib.safeFile(track?.file);if(!source)return res.sendStatus(404);const base=source.slice(0,-path.extname(source).length);let file=null;for(const extension of ['.lrc','.LRC']){file=await lib.safeFile(base+extension);if(file)break;}res.set('Cache-Control','private, no-store');if(!file){await ready;if(!autoLyrics)return res.json({available:false,text:'',message:'Automatic lyrics are disabled. Enable LRCLIB in Music library settings, or open a local LRC file.'});const duration=track.duration||Number(req.query?.duration);return res.json(await lyricsClient.lookup({...track,duration},{refresh:req.query?.refresh==='1'}));}if((await fs.stat(file)).size>512*1024)return res.status(413).json({error:'Lyrics file is too large'});const bytes=await fs.readFile(file);const text=bytes[0]===255&&bytes[1]===254?bytes.subarray(2).toString('utf16le'):bytes.toString('utf8').replace(/^\uFEFF/,'');res.json({available:true,text,source:'Local LRC'});}));
 app.get('/api/music/cover/:id',safe(async(req,res)=>{if(!requireAuth(req,res))return;const album=lib.albums.get(req.params.id);const file=await lib.safeFile(album?.cover);res.set('Cache-Control','private, max-age=300');res.set('X-Content-Type-Options','nosniff');if(file)return res.sendFile(file);const source=await lib.safeFile(album?.embedded);if(!source)return res.sendStatus(404);const key=lib.generation+':'+album.id;try{if(!artwork.has(key)){if(!pendingArtwork.has(key)){const task=run('ffmpeg',['-v','error','-protocol_whitelist','file,pipe','-i',source,'-map','0:v:0','-frames:v','1','-vf','scale=600:-2','-f','image2pipe','-vcodec','mjpeg','pipe:1'],{timeout:15000,maxBuffer:4*1024*1024,encoding:'buffer',windowsHide:true}).then(({stdout})=>{if(artwork.size>=50)artwork.delete(artwork.keys().next().value);artwork.set(key,stdout);}).finally(()=>pendingArtwork.delete(key));pendingArtwork.set(key,task);}await pendingArtwork.get(key);}res.type('jpg').send(artwork.get(key));}catch{res.sendStatus(404);} }));
 return lib;
}
module.exports={MusicLibrary,registerMusic,fallbackTags,readTags};
