const fs=require('node:fs');
const path=require('node:path');
const {Transform}=require('node:stream');
const MAX_INTRO_BYTES=1024*1024*1024;
function uploadError(message,status=400){return Object.assign(new Error(message),{status});}
function runMedia(command,args,{timeout=120000,signal}={}){return new Promise((resolve,reject)=>{const child=require('node:child_process').execFile(command,args,{windowsHide:true,timeout,maxBuffer:256*1024,signal},(error,stdout)=>error?reject(error):resolve(stdout));require('./ffmpeg').trackLive(child);});}
async function convertMkv(source,destination,{signal}={}){
 let info;try{info=JSON.parse(await runMedia('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',source],{signal}));}catch{throw uploadError('MKV conversion requires working FFmpeg and FFprobe on the server, and a readable video file.');}
 const video=info.streams?.find(s=>s.codec_type==='video'&&!s.disposition?.attached_pic);if(!video)throw uploadError('The MKV contains no video.');
 const args=['-v','error','-nostdin','-y','-protocol_whitelist','file,pipe','-i',source,'-map','0:'+video.index,'-map','0:a:0?','-sn','-dn','-c:v',video.codec_name==='h264'?'copy':'libx264'];if(video.codec_name!=='h264')args.push('-preset','fast','-crf','18','-pix_fmt','yuv420p');args.push('-c:a','aac','-b:a','256k','-movflags','+faststart','-fs',String(2*MAX_INTRO_BYTES),'-f','mp4',destination);
 try{await runMedia('ffmpeg',args,{timeout:20*60*1000,signal});const stat=await fs.promises.stat(destination);if(stat.size>=2*MAX_INTRO_BYTES-1024*1024)throw Error('limit');if(stat.size<12)throw Error('empty');}catch{throw uploadError(signal?.aborted?'Upload conversion cancelled.':'MKV conversion failed. Check FFmpeg support, free disk space, or upload an H.264/AAC MP4.');}
}
async function receiveIntro(req,file,{maxBytes=MAX_INTRO_BYTES,signal}={}){
 const length=Number(req.headers?.['content-length']);if(Number.isFinite(length)&&length>maxBytes)throw uploadError('Intro exceeds the 1 GB upload limit.',413);
 const temp=file+'.'+require('node:crypto').randomUUID()+'.tmp',converted=temp+'.mp4';let bytes=0,header=Buffer.alloc(0);
 const meter=new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;if(bytes>maxBytes)return callback(uploadError('Intro exceeds the upload limit.',413));if(header.length<12)header=Buffer.concat([header,chunk.subarray(0,12-header.length)]);callback(null,chunk);}});
 const output=fs.createWriteStream(temp,{flags:'wx'});
 try{
  await new Promise((resolve,reject)=>{let settled=false;const cleanup=()=>{req.removeListener('error',fail);req.removeListener('aborted',aborted);};const fail=error=>{if(settled)return;settled=true;cleanup();req.unpipe(meter);meter.unpipe(output);meter.destroy();output.destroy();req.resume();reject(error);};const aborted=()=>fail(uploadError('Upload cancelled before completion.'));req.on('error',fail);req.on('aborted',aborted);meter.on('error',fail);output.on('error',fail);output.on('close',()=>{if(settled)return;settled=true;cleanup();if(!output.writableFinished)return reject(uploadError('Upload was interrupted.'));resolve();});req.pipe(meter).pipe(output);});
  const mp4=header.length>=12&&header.toString('ascii',4,8)==='ftyp',mkv=header.length>=4&&header.readUInt32BE(0)===0x1a45dfa3;
  if(!mp4&&!mkv)throw uploadError('Choose an MP4 or MKV video.');
  if(mkv)await convertMkv(temp,converted,{signal});if(signal?.aborted)throw uploadError('Upload cancelled.');
  await fs.promises.rename(mkv?converted:temp,file);if(mkv)await fs.promises.unlink(temp).catch(()=>{});return{available:true,bytes,converted:mkv};
 }catch(error){if(!output.closed)await new Promise(resolve=>output.once('close',resolve));await fs.promises.unlink(temp).catch(()=>{});await fs.promises.unlink(converted).catch(()=>{});throw error;}
}
function registerMovieIntro(app,{requireAuth,requireAdmin,dataDir,publicOrigin=()=>''}){
 const file=path.join(dataDir,'movie-intro.mp4');let uploading=false;
 app.get('/api/movie-intro',(req,res)=>{if(!requireAuth(req,res))return;res.set('Cache-Control','no-store').json({available:fs.existsSync(file),maxUploadBytes:MAX_INTRO_BYTES});});
 app.get('/api/movie-intro/media',(req,res)=>{if(!requireAuth(req,res))return;res.set('Cache-Control','private, no-cache');res.sendFile(file,err=>{if(err&&!res.headersSent)res.status(err.statusCode===404?404:500).end();});});
 if(requireAdmin)app.post('/api/movie-intro',async(req,res)=>{
  if(!requireAdmin(req,res))return;
  if(req.headers.origin&&!new Set([`${req.protocol}://${req.get('host')}`,publicOrigin()]).has(req.headers.origin))return res.sendStatus(403);
  if(!/^(?:video\/(?:mp4|x-matroska|matroska)|application\/octet-stream)(?:;|$)/i.test(req.headers['content-type']||''))return res.status(415).json({error:'Choose an MP4 or MKV video.'});
  if(uploading)return res.status(409).json({error:'Another intro upload is in progress. Wait for it to finish.'});
  uploading=true;
  const controller=new AbortController();res.once?.('close',()=>{if(!res.writableEnded)controller.abort();});
  try{res.json(await receiveIntro(req,file,{signal:controller.signal}));}catch(error){req.resume();if(!res.headersSent&&!res.destroyed)res.status(error.status||500).json({error:error.status?error.message:'Could not save the intro. Check server data folder permissions.'});}finally{uploading=false;}
 });
}
module.exports={registerMovieIntro,receiveIntro,MAX_INTRO_BYTES};
