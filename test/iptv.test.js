const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parseM3u, source, download, registerIPTV} = require('../server/iptv');
const playlist = '#EXTM3U\n#EXTINF:-1 tvg-id="abc" group-title="News, World",News HD\nhttps://provider.test/live/user/secret/1.m3u8\n';
test('M3U preserves channel groups and names, deduplicates streams, ignores unsafe schemes', () => {
  const data = parseM3u(playlist + playlist + '#EXTINF:-1,Bad\nfile:///private\n');
  assert.equal(data.length, 1); assert.equal(data[0].group, 'News, World'); assert.equal(data[0].name, 'News HD');
  assert.equal(data[0].guideId, 'abc'); assert.equal(data[0].id, parseM3u(playlist)[0].id);
});
test('Rejects a single HLS manifest, empty channels and oversized playlists', () => {
  assert.throws(() => parseM3u('#EXTM3U\n#EXT-X-TARGETDURATION:6\n1.ts'));
  assert.throws(() => parseM3u('#EXTM3U\n')); assert.throws(() => parseM3u('x'.repeat(8*1024*1024+1)));
});
test('Xtream login is URL encoded and requires a valid provider address', () => {
  const config = source({type:'xtream',url:'https://provider.test',username:'a&b',password:'p?#'});
  const url = new URL(config.url); assert.equal(url.searchParams.get('username'), 'a&b'); assert.equal(url.searchParams.get('password'), 'p?#'); assert.equal(url.pathname, '/get.php');
  assert.throws(() => source({type:'m3u',url:'file:///secret'})); assert.throws(() => source({type:'m3u',url:'https://user:password@provider.test'}));
});
test('Provider import rejects redirects and enforces streamed byte limit', async () => {
  let options;
  await assert.rejects(download({type:'m3u',url:'https://provider.test'},async (_url,o) => {options=o;return {ok:true,body:[Buffer.alloc(8*1024*1024+1)]};}));
  assert.equal(options.redirect, 'error'); assert.ok(options.signal);
});
function fixture(fetchImpl = async () => ({ok:true,body:[Buffer.from(playlist)]})) {
  const routes = new Map(); let config = {}, admin = true, kids = false, signedIn = true;
  const account = {id:'account',adultContentAllowed:true};
  registerIPTV({get:(p,f)=>routes.set('GET '+p,f),post:(p,f)=>routes.set('POST '+p,f)}, {
    secrets:{get:()=>({...config}),save:v=>{config=v;}}, fetchImpl,
    requireAuth:(_q,r)=>signedIn?account:(r.status(401).json({error:'Login'}),null),
    requireAdmin:(_q,r)=>admin?account:(r.status(403).json({error:'Admin'}),null),
    db:{prepare:()=>({get:()=>({is_kids:kids})})}, nativeAuth:()=>({is_kids:kids,adult_content_allowed:1})
  });
  async function call(method,path,body={},extra={}) {const req={body,query:{profileId:'p'},params:{},headers:{},protocol:'https',get:()=> 'mythic.test',...extra},res={code:200,status(n){this.code=n;return this;},set(){return this;},json(data){this.data=data;return this;},sendStatus(n){this.code=n;return this;}};await routes.get(method+' '+path)(req,res);return res;}
  return {call,config:()=>config,setAdmin:v=>admin=v,setKids:v=>kids=v,setSignedIn:v=>signedIn=v};
}
test('Imports atomically, redacts credentials from settings and listings, rejects foreign origins', async () => {
  const f=fixture(); assert.equal((await f.call('POST','/api/iptv/settings',{type:'m3u',url:'https://provider.test/list?password=secret'})).code,200);
  assert.equal(f.config().iptv.channels.length,1);
  const status=await f.call('GET','/api/iptv/settings'); assert.ok(!JSON.stringify(status.data).includes('secret'));
  const list=await f.call('GET','/api/iptv/channels'); assert.ok(!JSON.stringify(list.data).includes('secret'));
  assert.equal((await f.call('POST','/api/iptv/settings',{type:'file',text:'bad'})).code,400); assert.equal(f.config().iptv.channels.length,1);
  assert.equal((await f.call('POST','/api/iptv/settings',{clear:true},{headers:{origin:'https://other.test'}})).code,403); assert.equal(f.config().iptv.channels.length,1);
});
test('Authentication and restricted profiles protect catalog and stream addresses', async () => {
  const f=fixture();await f.call('POST','/api/iptv/settings',{type:'file',text:playlist}); const id=f.config().iptv.channels[0].id;
  assert.equal((await f.call('GET','/api/iptv/channels/:id/play',{}, {params:{id}})).data.name,'News HD');
  f.setKids(true);
  for(const prefix of ['/api/iptv','/api/tv-native/iptv']) {assert.equal((await f.call('GET',prefix+'/channels')).code,403);assert.equal((await f.call('GET',prefix+'/channels/:id/play',{}, {params:{id}})).code,403);}
  f.setKids(false);f.setSignedIn(false);assert.equal((await f.call('GET','/api/iptv/channels')).code,401);
  f.setAdmin(false);assert.equal((await f.call('POST','/api/iptv/settings',{clear:true})).code,403);
});
