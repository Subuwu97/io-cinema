const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {eligible}=require('../public/js/movie-intro');
const {registerMovieIntro}=require('../server/movie-intro');
test('intro is restricted to indexed movies and excludes TV, music and live playback',()=>{
 const movies=[{id:'film'}];assert.equal(eligible('film',movies,false),true);
 for(const id of ['tv','music','unknown'])assert.equal(eligible(id,movies,false),false);
 assert.equal(eligible('film',movies,true),false);assert.equal(eligible('film',undefined,false),false);
});
test('authenticated intro requests complete and unauthenticated requests never reach media',()=>{
 const dir=fs.mkdtempSync(path.join(process.env.IO_TEST_ROOT||os.tmpdir(),'intro-'));
 try{const routes=new Map();registerMovieIntro({get:(url,handler)=>routes.set(url,handler)},{requireAuth:(req,res)=>{if(req.user)return req.user;res.status(401).json({error:'Not signed in'});return null;},dataDir:dir});
 const call=(url,user)=>{let status=200,body,sent;const res={set:()=>res,status:s=>{status=s;return res;},json:v=>body=v,sendFile:file=>sent=file};routes.get(url)({user},res);return{status,body,sent};};
 assert.equal(call('/api/movie-intro').status,401);assert.equal(call('/api/movie-intro/media').sent,undefined);
 assert.equal(call('/api/movie-intro',{id:'a'}).body.available,false);
 fs.writeFileSync(path.join(dir,'movie-intro.mp4'),'fixture');
 assert.equal(call('/api/movie-intro',{id:'a'}).body.available,true);
 assert.equal(call('/api/movie-intro/media',{id:'a'}).sent,path.join(dir,'movie-intro.mp4'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('intro upload checks admin, origin, content type and signature before replacing a clip',async()=>{
 const {Readable}=require('node:stream'),dir=fs.mkdtempSync(path.join(process.env.IO_TEST_ROOT||os.tmpdir(),'intro-upload-'));try{
 let handler;registerMovieIntro({get(){},post:(_url,h)=>handler=h},{requireAuth:()=>({id:'a'}),requireAdmin:(req,res)=>{if(req.admin)return{role:'admin'};res.sendStatus(403);return null;},dataDir:dir});
 let status=200,body;const res={sendStatus:s=>status=s,status:s=>{status=s;return res;},json:v=>body=v};
 const request=(bytes,extra={})=>Object.assign(Readable.from([bytes]),{admin:true,headers:{origin:'http://localhost','content-type':'video/mp4'},protocol:'http',get:()=> 'localhost',...extra});
 await handler(request(Buffer.from('bad'),{admin:false}),res);assert.equal(status,403);
 await handler(request(Buffer.from('bad'),{headers:{origin:'https://evil.example'}}),res);assert.equal(status,403);
 await handler(request(Buffer.from('invalid')),res);assert.equal(status,400);assert.equal(fs.existsSync(path.join(dir,'movie-intro.mp4')),false);
 const mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(12)]);await handler(request(mp4),res);assert.equal(body.available,true);assert.deepEqual(fs.readFileSync(path.join(dir,'movie-intro.mp4')),mp4);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('streamed intros larger than the old 80 MB cap are preserved without buffering the file',async()=>{
 const {Readable}=require('node:stream'),{receiveIntro,MAX_INTRO_BYTES}=require('../server/movie-intro');assert.equal(MAX_INTRO_BYTES,1024*1024*1024);
 const dir=fs.mkdtempSync(path.join(process.env.IO_TEST_ROOT||os.tmpdir(),'intro-large-'));try{
 const chunk=Buffer.alloc(64*1024);chunk.write('ftyp',4,'ascii');const count=1300,req=Readable.from((function*(){for(let i=0;i<count;i++)yield chunk;})());req.headers={};const file=path.join(dir,'movie-intro.mp4');
 const result=await receiveIntro(req,file);assert.equal(result.bytes,count*chunk.length);assert.ok(result.bytes>80*1024*1024);assert.equal(fs.statSync(file).size,result.bytes);const fd=fs.openSync(file,'r'),header=Buffer.alloc(12);try{fs.readSync(fd,header,0,12,0);assert.equal(header.subarray(4,8).toString(),'ftyp');}finally{fs.closeSync(fd);}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('oversized and interrupted uploads leave the previous intro intact and clean temporary files',async()=>{
 const {Readable}=require('node:stream'),{receiveIntro}=require('../server/movie-intro');const dir=fs.mkdtempSync(path.join(process.env.IO_TEST_ROOT||os.tmpdir(),'intro-failed-'));try{
 const file=path.join(dir,'movie-intro.mp4');fs.writeFileSync(file,'previous');
 const oversized=Readable.from([Buffer.alloc(128)]);oversized.headers={};await assert.rejects(receiveIntro(oversized,file,{maxBytes:64}),e=>e.status===413);
 const aborted=Readable.from((async function*(){yield Buffer.from('0000ftypisom0000');throw Error('Disconnected');})());aborted.headers={};await assert.rejects(receiveIntro(aborted,file),/Disconnected/);
 assert.equal(fs.readFileSync(file,'utf8'),'previous');assert.deepEqual(fs.readdirSync(dir),['movie-intro.mp4']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('a real 3840x2160 H.264/AAC intro is uploaded byte-for-byte without downscaling',async t=>{
 const {execFileSync}=require('node:child_process'),{receiveIntro}=require('../server/movie-intro');try{execFileSync('ffmpeg',['-version'],{stdio:'ignore',windowsHide:true});execFileSync('ffprobe',['-version'],{stdio:'ignore',windowsHide:true});}catch{t.skip('ffmpeg/ffprobe unavailable');return;}
 const dir=fs.mkdtempSync(path.join(process.env.IO_TEST_ROOT||os.tmpdir(),'intro-4k-'));try{const source=path.join(dir,'source.mp4'),dest=path.join(dir,'movie-intro.mp4');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=3840x2160:r=1','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','1','-c:v','libx264','-preset','ultrafast','-threads','1','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',source],{windowsHide:true,timeout:20000,stdio:'pipe'});const req=fs.createReadStream(source);req.headers={};await receiveIntro(req,dest);assert.deepEqual(fs.readFileSync(dest),fs.readFileSync(source));const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_name,width,height','-of','json',dest],{encoding:'utf8',windowsHide:true}));assert.ok(info.streams.some(s=>s.codec_name==='h264'&&s.width===3840&&s.height===2160));assert.ok(info.streams.some(s=>s.codec_name==='aac'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('MKV with Opus audio converts to MP4/AAC without changing H.264 resolution',async t=>{
 const {execFileSync}=require('node:child_process'),{receiveIntro}=require('../server/movie-intro');try{execFileSync('ffmpeg',['-version'],{stdio:'ignore',windowsHide:true});}catch{t.skip('ffmpeg unavailable');return;}
 const dir=fs.mkdtempSync(path.join(process.env.IO_TEST_ROOT||os.tmpdir(),'intro-mkv-'));try{const source=path.join(dir,'source.mkv'),dest=path.join(dir,'movie-intro.mp4');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=640x360:r=1','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','1','-c:v','libx264','-preset','ultrafast','-threads','1','-pix_fmt','yuv420p','-c:a','libopus',source],{windowsHide:true,timeout:20000,stdio:'pipe'});const req=fs.createReadStream(source);req.headers={};const result=await receiveIntro(req,dest);assert.equal(result.converted,true);const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_name,width,height','-of','json',dest],{encoding:'utf8',windowsHide:true}));assert.ok(info.streams.some(s=>s.codec_name==='h264'&&s.width===640&&s.height===360));assert.ok(info.streams.some(s=>s.codec_name==='aac'));assert.deepEqual(fs.readdirSync(dir).sort(),['movie-intro.mp4','source.mkv']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('invalid MKV conversion retains the previous intro and removes intermediates',async()=>{
 const {Readable}=require('node:stream'),{receiveIntro}=require('../server/movie-intro');const dir=fs.mkdtempSync(path.join(process.env.IO_TEST_ROOT||os.tmpdir(),'intro-bad-mkv-'));try{const file=path.join(dir,'movie-intro.mp4');fs.writeFileSync(file,'previous');const req=Readable.from([Buffer.from([0x1a,0x45,0xdf,0xa3,0,0,0,0,0,0,0,0])]);req.headers={};await assert.rejects(receiveIntro(req,file),/MKV conversion/);assert.equal(fs.readFileSync(file,'utf8'),'previous');assert.deepEqual(fs.readdirSync(dir),['movie-intro.mp4']);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
