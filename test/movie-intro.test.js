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
test('intro upload checks admin, origin and MP4 signature before replacing a clip',async()=>{
 const dir=fs.mkdtempSync(path.join(process.env.IO_TEST_ROOT||os.tmpdir(),'intro-upload-'));try{
 let handlers;registerMovieIntro({get(){},post:(_url,...h)=>handlers=h},{requireAuth:()=>({id:'a'}),requireAdmin:(req,res)=>{if(req.admin)return{role:'admin'};res.sendStatus(403);return null;},dataDir:dir});
 let status=200,body,next=false;const res={sendStatus:s=>status=s,status:s=>{status=s;return res;},json:v=>body=v};
 const req={admin:false,headers:{},protocol:'http',get:()=> 'localhost'};
 handlers[0](req,res,()=>next=true);assert.equal(status,403);assert.equal(next,false);
 req.admin=true;req.headers.origin='https://evil.example';handlers[0](req,res,()=>next=true);assert.equal(next,false);
 req.headers.origin='http://localhost';handlers[0](req,res,()=>next=true);assert.equal(next,true);
 await handlers[2]({...req,body:Buffer.from('invalid')},res);assert.equal(status,400);assert.equal(fs.existsSync(path.join(dir,'movie-intro.mp4')),false);
 const mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(12)]);await handlers[2]({...req,body:mp4},res);assert.equal(body.available,true);assert.deepEqual(fs.readFileSync(path.join(dir,'movie-intro.mp4')),mp4);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
