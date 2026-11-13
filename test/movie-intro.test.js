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
test('intro availability is dynamic and both routes require authentication',()=>{
 const dir=fs.mkdtempSync(path.join(process.env.IO_TEST_ROOT||os.tmpdir(),'intro-'));
 try{const routes=new Map(),auth=()=>{};registerMovieIntro({get:(url,...handlers)=>routes.set(url,handlers)},{requireAuth:auth,dataDir:dir});
 for(const handlers of routes.values())assert.equal(handlers[0],auth);
 const metadata=routes.get('/api/movie-intro')[1];let value;
 metadata({}, {json:data=>value=data});assert.equal(value.available,false);
 fs.writeFileSync(path.join(dir,'movie-intro.mp4'),'fixture');metadata({}, {json:data=>value=data});assert.equal(value.available,true);
 let sent;routes.get('/api/movie-intro/media')[1]({}, {set(){},sendFile:file=>sent=file});assert.equal(sent,path.join(dir,'movie-intro.mp4'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
