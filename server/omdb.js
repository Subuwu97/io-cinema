const fs=require('node:fs/promises'),path=require('node:path');
const clean=v=>!v||v==='N/A'?'':String(v).slice(0,12000);
function mapMetadata(data){return{title:clean(data.Title),description:clean(data.Plot),year:parseInt(data.Year)||null,rating:clean(data.Rated),genres:clean(data.Genre).split(',').map(s=>s.trim()).filter(Boolean),imdbId:data.imdbID,omdb:{imdbId:data.imdbID,imdbRating:clean(data.imdbRating),runtime:clean(data.Runtime),director:clean(data.Director),actors:clean(data.Actors),writer:clean(data.Writer),country:clean(data.Country),language:clean(data.Language),totalSeasons:parseInt(data.totalSeasons)||null,source:'OMDb'}};}
function createClient({getKey,fetchImpl=fetch}){const cache=new Map();let lastRequest=0;return async params=>{const key=getKey();if(!key)throw Error('Add your OMDb API key in Settings first');const url=new URL('https://www.omdbapi.com/');for(const[k,v]of Object.entries({...params,apikey:key,r:'json'}))url.searchParams.set(k,String(v));const cacheKey=JSON.stringify([key,params]),old=cache.get(cacheKey);if(old&&old.until>Date.now())return old.data;let response;try{const delay=Math.max(0,350-(Date.now()-lastRequest));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));lastRequest=Date.now();response=await fetchImpl(url,{signal:AbortSignal.timeout(12000),redirect:'error'});}catch{throw Error('Could not reach OMDb. Try again later');}if(!response.ok)throw Error('OMDb is temporarily unavailable');const text=await response.text();if(text.length>2*1024*1024)throw Error('OMDb response is too large');let data;try{data=JSON.parse(text);}catch{throw Error('Invalid OMDb response');}if(data.Response==='False'){if(/key/i.test(data.Error||''))throw Error('OMDb rejected the API key');if(/limit/i.test(data.Error||''))throw Error('OMDb request limit reached');throw Error('No matching OMDb title was found');}if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(cacheKey,{until:Date.now()+10*60000,data});return data;};}
async function posterBytes(value,fetchImpl){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port||!['m.media-amazon.com','ia.media-imdb.com','images-na.ssl-images-amazon.com'].includes(url.hostname))throw Error('Unsupported poster host');const res=await fetchImpl(url,{signal:AbortSignal.timeout(12000),redirect:'error'});if(!res.ok||Number(res.headers.get('content-length')||0)>8*1024*1024)throw Error('Poster unavailable');const chunks=[];let size=0;for await(const chunk of res.body){size+=chunk.length;if(size>8*1024*1024)throw Error('Poster too large');chunks.push(chunk);}const data=Buffer.concat(chunks);const png=data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));if(!png&&!(data[0]===255&&data[1]===216&&data[2]===255))throw Error('Invalid poster format');return{data,extension:png?'png':'jpg'};}
function registerOMDb(app,{requireAdmin,secrets,getLibrary,rescan,publicOrigin=()=>'',fetchImpl=fetch}){
 const key=()=>secrets.get().omdbApiKey||process.env.OMDB_API_KEY||'';const request=createClient({getKey:key,fetchImpl});const safe=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(e=>{if(!res.headersSent)res.status(400).json({error:e.message});});const origin=(req,res)=>{if(req.headers.origin&&!new Set([`${req.protocol}://${req.get('host')}`,publicOrigin()]).has(req.headers.origin)){res.sendStatus(403);return false;}return true;};
 app.get('/api/omdb/settings',(req,res)=>{if(!requireAdmin(req,res))return;res.set('Cache-Control','no-store').json({configured:!!key(),environment:!!process.env.OMDB_API_KEY});});
 app.post('/api/omdb/settings',safe(async(req,res)=>{if(!requireAdmin(req,res)||!origin(req,res))return;const value=req.body?.apiKey;if(value!==undefined&&(typeof value!=='string'||value&&!/^[a-zA-Z0-9]{6,64}$/.test(value)))return res.status(400).json({error:'Enter a valid OMDb API key'});const current=secrets.get();if(req.body?.clearKey===true)delete current.omdbApiKey;else if(value)current.omdbApiKey=value;secrets.save(current);res.json({configured:!!key()});}));
 app.get('/api/omdb/search',safe(async(req,res)=>{if(!requireAdmin(req,res))return;const q=String(req.query.q||'').trim(),type=req.query.type==='movie'?'movie':'series';if(!q||q.length>200)return res.status(400).json({error:'Enter a title or IMDb ID'});const data=await request(/^tt\d{7,10}$/.test(q)?{i:q,plot:'full'}:{s:q,type});res.json({results:data.Search||[data],attribution:'Metadata from OMDb / IMDb'});}));
 app.get('/api/omdb/title/:id',safe(async(req,res)=>{if(!requireAdmin(req,res))return;if(!/^tt\d{7,10}$/.test(req.params.id))return res.sendStatus(400);const data=await request({i:req.params.id,plot:'full'});res.json({...data,Poster:undefined,posterAvailable:!!clean(data.Poster),attribution:'Metadata from OMDb / IMDb'});}));
 async function importTitle(showId,options,refresh=true){
  if(!/^tt\d{7,10}$/.test(options.imdbId||''))throw Error('Choose a valid IMDb ID');
  const library=getLibrary(),show=library.getShow(showId),dir=library.getShowDir(showId);
  if(!show||!dir)throw Error('Place this title inside its own folder before importing metadata');
  const expected=library.cache.movies.some(s=>s.id===show.id)?'movie':'series',data=await request({i:options.imdbId,plot:'full'});
  if(data.Type!==expected)throw Error('Choose a matching '+expected+' result');
  const folder=await fs.realpath(dir),infoPath=path.join(folder,'info.json');let existing={};
  try{if((await fs.lstat(infoPath)).isSymbolicLink())throw Error('symlink');existing=JSON.parse(await fs.readFile(infoPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('Existing info.json could not be read safely');}
  const incoming=mapMetadata(data),merged={...existing};
  for(const[k,v]of Object.entries(incoming))if(k==='omdb'||k==='imdbId'||options.replace===true||existing[k]==null||existing[k]===''||Array.isArray(existing[k])&&!existing[k].length)merged[k]=v;
  const temporary=infoPath+'.omdb-tmp';await fs.writeFile(temporary,JSON.stringify(merged,null,2)+'\n',{flag:'wx'});
  try{if(Object.keys(existing).length)await fs.writeFile(path.join(folder,'info.before-omdb.json'),JSON.stringify(existing,null,2)+'\n');await fs.rename(temporary,infoPath);}catch{await fs.unlink(temporary).catch(()=>{});throw Error('Could not save title metadata');}
  let posterSaved=false,warning='';
  if(options.poster!==false&&clean(data.Poster))try{let covered=false;for(const name of ['cover.jpg','cover.png','cover.webp'])try{await fs.access(path.join(folder,name));covered=true;}catch{}if(!covered){const image=await posterBytes(data.Poster,fetchImpl);await fs.writeFile(path.join(folder,'cover.'+image.extension),image.data,{flag:'wx'});posterSaved=true;}}catch{warning='Metadata saved; the poster could not be downloaded.';}
  if(refresh)await rescan();return{ok:true,posterSaved,warning,title:getLibrary().getShow(showId)||show};
 }
 app.post('/api/omdb/import/:id',safe(async(req,res)=>{if(!requireAdmin(req,res)||!origin(req,res))return;res.json(await importTitle(req.params.id,req.body||{}));}));
 let job={running:false,phase:'idle',total:0,processed:0,matched:0,skipped:0,failed:0,review:[],errors:[],cancelRequested:false};
 const normalize=value=>String(value||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g,'');
 const snapshot=()=>JSON.parse(JSON.stringify(job));
 async function runBulk(items,options){
  job={running:true,phase:'matching',total:items.length,processed:0,matched:0,skipped:0,failed:0,review:[],errors:[],cancelRequested:false,currentTitle:''};
  try{for(const item of items){if(job.cancelRequested)break;job.currentTitle=item.title;try{
   if(item.omdb&&!options.refreshExisting){job.skipped++;continue;}
   let imdbId=item.imdbId;
   if(!imdbId){const type=getLibrary().cache.movies.some(s=>s.id===item.id)?'movie':'series',year=String(item.year||item.title.match(/\((19|20)\d{2}\)/)?.[0].slice(1,-1)||'').slice(0,4),title=item.title.replace(/\s*\((19|20)\d{2}\)\s*$/,'');const found=await request({s:title,type,...(year?{y:year}:{})});const matches=(found.Search||[]).filter(r=>r.Type===type&&normalize(r.Title)===normalize(title)&&(!year||String(r.Year).startsWith(year)));
    if(matches.length!==1){job.skipped++;if(job.review.length<200)job.review.push({id:item.id,title:item.title,reason:'No unique exact match. Review this title manually.'});continue;}imdbId=matches[0].imdbID;
   }
   await importTitle(item.id,{imdbId,replace:options.replace===true,poster:true},false);job.matched++;
  }catch(error){job.failed++;if(job.errors.length<100)job.errors.push({title:item.title,error:error.message});if(/key|limit|reach OMDb|temporarily unavailable/i.test(error.message)){job.phase='stopped';job.error=error.message;break;}}finally{job.processed++;}
   await new Promise(resolve=>setTimeout(resolve,350));
  }
  if(job.matched){job.phase='rescanning';await rescan();}
  job.phase=job.cancelRequested?'cancelled':job.error?'stopped':'finished';
  }catch{job.phase='failed';job.error='Bulk metadata job failed. Check server folder permissions.';}finally{job.running=false;job.currentTitle='';}
 }
 app.get('/api/omdb/bulk',(req,res)=>{if(!requireAdmin(req,res))return;res.set('Cache-Control','no-store').json(snapshot());});
 app.post('/api/omdb/bulk',safe(async(req,res)=>{if(!requireAdmin(req,res)||!origin(req,res))return;if(job.running)return res.status(409).json({error:'A metadata job is already running'});if(!key())return res.status(400).json({error:'Save your OMDb API key first'});const items=[...getLibrary().cache.anime,...getLibrary().cache.movies];if(!items.length)return res.status(400).json({error:'Scan your movie and TV library first. No titles are indexed yet.'});if(items.length>5000)return res.status(400).json({error:'Bulk matching is limited to 5,000 titles per job'});runBulk(items,req.body||{});res.json(snapshot());}));
 app.post('/api/omdb/bulk/cancel',(req,res)=>{if(!requireAdmin(req,res)||!origin(req,res))return;job.cancelRequested=true;res.json(snapshot());});

 return{request,importTitle,runBulk,status:snapshot};
}
module.exports={registerOMDb,createClient,mapMetadata,posterBytes};
