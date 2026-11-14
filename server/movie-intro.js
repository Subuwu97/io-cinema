const fs=require('node:fs');
const path=require('node:path');
const {Transform}=require('node:stream');
const MAX_INTRO_BYTES=1024*1024*1024;
function uploadError(message,status=400){return Object.assign(new Error(message),{status});}
async function receiveIntro(req,file,{maxBytes=MAX_INTRO_BYTES}={}){
 const length=Number(req.headers?.['content-length']);if(Number.isFinite(length)&&length>maxBytes)throw uploadError('Intro exceeds the 1 GB upload limit.',413);
 const temp=file+'.'+require('node:crypto').randomUUID()+'.tmp';let bytes=0,header=Buffer.alloc(0);
 const meter=new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;if(bytes>maxBytes)return callback(uploadError('Intro exceeds the upload limit.',413));if(header.length<12)header=Buffer.concat([header,chunk.subarray(0,12-header.length)]);callback(null,chunk);}});
 const output=fs.createWriteStream(temp,{flags:'wx'});
 try{
  await new Promise((resolve,reject)=>{let settled=false;const cleanup=()=>{req.removeListener('error',fail);req.removeListener('aborted',aborted);};const fail=error=>{if(settled)return;settled=true;cleanup();req.unpipe(meter);meter.unpipe(output);meter.destroy();output.destroy();req.resume();reject(error);};const aborted=()=>fail(uploadError('Upload cancelled before completion.'));req.on('error',fail);req.on('aborted',aborted);meter.on('error',fail);output.on('error',fail);output.on('close',()=>{if(settled)return;settled=true;cleanup();if(!output.writableFinished)return reject(uploadError('Upload was interrupted.'));resolve();});req.pipe(meter).pipe(output);});
  if(header.length<12||header.toString('ascii',4,8)!=='ftyp')throw uploadError('Choose an MP4 video with H.264 video and AAC audio.');
  await fs.promises.rename(temp,file);return{available:true,bytes};
 }catch(error){if(!output.closed)await new Promise(resolve=>output.once('close',resolve));await fs.promises.unlink(temp).catch(()=>{});throw error;}
}
function registerMovieIntro(app,{requireAuth,requireAdmin,dataDir,publicOrigin=()=>''}){
 const file=path.join(dataDir,'movie-intro.mp4');let uploading=false;
 app.get('/api/movie-intro',(req,res)=>{if(!requireAuth(req,res))return;res.set('Cache-Control','no-store').json({available:fs.existsSync(file),maxUploadBytes:MAX_INTRO_BYTES});});
 app.get('/api/movie-intro/media',(req,res)=>{if(!requireAuth(req,res))return;res.set('Cache-Control','private, no-cache');res.sendFile(file,err=>{if(err&&!res.headersSent)res.status(err.statusCode===404?404:500).end();});});
 if(requireAdmin)app.post('/api/movie-intro',async(req,res)=>{
  if(!requireAdmin(req,res))return;
  if(req.headers.origin&&!new Set([`${req.protocol}://${req.get('host')}`,publicOrigin()]).has(req.headers.origin))return res.sendStatus(403);
  if(!/^video\/mp4(?:;|$)/i.test(req.headers['content-type']||''))return res.status(415).json({error:'Choose an MP4 video.'});
  if(uploading)return res.status(409).json({error:'Another intro upload is in progress. Wait for it to finish.'});
  uploading=true;
  try{res.json(await receiveIntro(req,file));}catch(error){req.resume();if(!res.headersSent&&!res.destroyed)res.status(error.status||500).json({error:error.status?error.message:'Could not save the intro. Check server data folder permissions.'});}finally{uploading=false;}
 });
}
module.exports={registerMovieIntro,receiveIntro,MAX_INTRO_BYTES};
