const {test}=require('node:test');const assert=require('node:assert/strict');const express=require('express');
const {registerCasting}=require('../server/casting');
test('casting grants only the selected HLS stream, forwards grants to segments, expires and rechecks account/profile restrictions',async t=>{
 const app=express();app.use(express.json());let clock=100,active=true,kids=false,rating='PG';
 const account={id:'a',approved:true,adultContentAllowed:true};
 const casting=registerCasting(app,{requireAuth:(req,res)=>{if(req.headers.cookie==='session=ok')return account;res.sendStatus(401);},getAccountFromRequest:req=>active&&req.headers.cookie==='session=ok'?account:null,profiles:{getActiveProfile:()=>({id:'p',isKids:kids})},getLibrary:()=>({getShow:id=>id==='s'?{rating}:null}),startHls:async(id,ep,opts)=>{assert.equal(ep,'episode');assert.equal(opts.startOffsetSeconds,0);return{cacheKey:'a'.repeat(32)};},publicOrigin:()=> 'https://io.example',now:()=>clock});
 app.get('/api/hls/:key/:file',(req,res)=>{if(!casting.mediaAccount(req,res))return res.sendStatus(401);res.send(casting.playlist('#EXTM3U\nseg00000.ts\n',req.castToken));});
 const server=app.listen(0,'127.0.0.1');t.after(()=>server.close());await new Promise(r=>server.on('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const start=(body={},headers={})=>fetch(base+'/api/cast/start',{method:'POST',headers:{'Content-Type':'application/json',cookie:'session=ok',...headers},body:JSON.stringify({showId:'s',episode:'episode',...body})});
 assert.equal((await start({}, {cookie:''})).status,401);assert.equal((await start({}, {origin:'https://evil.test'})).status,403);assert.equal((await start({audio:-1})).status,400);assert.equal((await start({position:-1})).status,400);
 const grant=await(await start()).json();assert.equal(grant.contentType,'application/vnd.apple.mpegurl');assert.ok(!grant.playlistUrl.includes('session=ok'));
 let media=await fetch(base+grant.playlistUrl);assert.equal(media.status,200);assert.equal(media.headers.get('access-control-allow-origin'),'*');assert.match(await media.text(),/seg00000.ts\?castToken=[a-f0-9]{64}/);
 assert.equal((await fetch(base+grant.playlistUrl.replace('/'+'a'.repeat(32)+'/', '/'+'b'.repeat(32)+'/'))).status,401);
 assert.equal((await fetch(base+grant.playlistUrl.replace('playlist.m3u8','secrets.json'))).status,401);
 active=false;assert.equal((await fetch(base+grant.playlistUrl)).status,401);active=true;kids=true;rating='RX';assert.equal((await fetch(base+grant.playlistUrl)).status,401);assert.equal((await start()).status,403);kids=false;clock+=12*3600000;assert.equal((await fetch(base+grant.playlistUrl)).status,401);
});
