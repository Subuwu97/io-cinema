const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  express = require("express"),
  { DatabaseSync } = require("node:sqlite");
test("native TV pairing binds the polling secret and owned PIN-protected profile; playback tokens are limited to approved streams and revoke immediately", async (t) => {
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mythic-original-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const original=path.join(temp,'movie.mkv');fs.writeFileSync(original,'original-HDR-metadata-bytes');let hdrMode=false;
  const db = new DatabaseSync(":memory:");
  db.exec(
    `PRAGMA foreign_keys=ON;CREATE TABLE accounts(id TEXT PRIMARY KEY,approved INTEGER,adult_content_allowed INTEGER);INSERT INTO accounts VALUES('a',1,1),('b',1,1);CREATE TABLE profiles(id TEXT PRIMARY KEY,account_id TEXT REFERENCES accounts(id),name TEXT,is_kids INTEGER);INSERT INTO profiles VALUES('p','a','Alice',0),('q','b','Bob',0);CREATE TABLE top_picks(profile_id TEXT,item_type TEXT,item_id TEXT);CREATE TABLE episode_first_seen(show_id TEXT,first_seen_at TEXT);CREATE TABLE my_list(profile_id TEXT,item_type TEXT,item_id TEXT,PRIMARY KEY(profile_id,item_type,item_id));CREATE TABLE progress(profile_id TEXT,item_id TEXT,episode_rel_path TEXT,seconds REAL,duration REAL,updated_at TEXT,hidden INTEGER,PRIMARY KEY(profile_id,item_id));`,
  );
  const app = express();
  app.use(express.json());
  let clock = Date.now(),
    rating = "PG";
  const show = {
      id: "s",
      title: "Story",
      cover: "/media-asset/anime/s/cover.jpg?v=1",
      banner: "/media-asset/anime/s/banner.jpg",
      description: "A library story",
      genres:["Action"],
      groups: [
        { name: "Season", episodes: [{ relPath: "one", title: "One" }] },
      ],
    },
    lib = {
      resolveEpisodeFile:(id,episode)=>id==='s'&&episode==='one'?original:null,
      cache: { anime: [show], movies: [] },
      getShow: (id) => (id === "s" ? { ...show, rating } : null),
    };
  const tv = require("../server/tv-native").registerNativeTV(app, {
    db,
    requireAuth: (req, res) => {
      const id = req.headers["x-user"];
      if (!["a", "b"].includes(id)) {
        res.sendStatus(401);
        return null;
      }
      return { id };
    },
    profiles: { verifyPin: (_a, _p, pin) => pin === "1234" },
    getLibrary: () => lib,
    startHls: async (_id,_episode,options) => { if(options.audio!==undefined)assert.ok([2,3].includes(options.audio));return { cacheKey: options.audio===undefined?"stream123":"streamAudio" }; },
    getMediaInfo:async()=>({...hdrMode?{videoStream:{color_transfer:'smpte2084'},videoCodec:'hevc',containerExtension:'.mkv',defaultAudioIndex:2}:{},audioStreams:[{index:2,language:'ja',title:'Japanese',codec:'aac'},{index:3,language:'eng',title:'English',codec:'aac'}],subtitleStreams:[{index:4,language:'eng',codec:'ass',imageBased:false},{index:5,language:'eng',codec:'hdmv_pgs_subtitle',imageBased:true}]}),
    getSubtitle:async(id,episode,track,shift)=>{assert.equal(id,'s');assert.equal(episode,'one');assert.equal(track,4);assert.equal(shift,12);return 'WEBVTT\n\n00:00.000 --> 00:02.000\nHello\n';},
    now: () => clock,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
  });
  const base = "http://127.0.0.1:" + server.address().port + "/api/tv-native";
  const request = (path, body, user, token, method = "POST") =>
    fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(user ? { "x-user": user } : {}),
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const pairing = await (
    await request("/pair/start", { name: "Test TV" })
  ).json();
  assert.equal(
    (
      await request(
        "/pair/" + pairing.code + "/approve",
        { profileId: "q", pin: "1234" },
        "a",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/pair/" + pairing.code + "/approve",
        { profileId: "p", pin: "bad" },
        "a",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/pair/" + pairing.code + "/approve",
        { profileId: "p", pin: "1234" },
        "a",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/pair/poll", {
        code: pairing.code,
        pollSecret: "stolen-code",
      })
    ).status,
    404,
  );
  const grant = await (
    await request("/pair/poll", {
      code: pairing.code,
      pollSecret: pairing.pollSecret,
    })
  ).json();
  assert.equal(grant.status, "approved");
  assert.equal(
    (
      await request("/pair/poll", {
        code: pairing.code,
        pollSecret: pairing.pollSecret,
      })
    ).status,
    404,
  );
  assert.equal(
    (await request("/catalog", null, null, grant.token, "GET")).status,
    200,
  );
  assert.equal(
    (await request("/devices", null, null, grant.token, "GET")).status,
    401,
  );
  assert.equal(
    (await request("/play", { id: "s", episode: "other" }, null, grant.token))
      .status,
    404,
  );
  assert.equal((await request('/watchlist/s',{saved:true},null,grant.token,'PUT')).status,200);
  assert.equal((await request('/watchlist/s',{saved:true},null,grant.token,'PUT')).status,200);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM my_list WHERE profile_id='p'").get().n,1);
  assert.equal((await request('/watchlist/foreign',{saved:true},null,grant.token,'PUT')).status,404);
  const savedCatalog=await(await request('/catalog',null,null,grant.token,'GET')).json();assert.equal(savedCatalog.watchlist[0].id,'s');
  lib.cache.anime.push(...Array.from({length:100},(_,n)=>({id:'extra'+n,title:'Extra '+String(n).padStart(3,'0'),genres:['Action'],dateAdded:new Date(1700000000000+n*1000).toISOString()})));
  const large=await(await request('/catalog?offset=50',null,null,grant.token,'GET')).json();
  assert.equal(large.total,101);assert.equal(large.items.length,50);
  assert.equal(large.sections.find(row=>row.title==='Recently Added').items[0].id,'extra99');
  assert.equal(large.sections.find(row=>row.title==='Action').items.length,24);
  const related=await(await request('/catalog?related=s',null,null,grant.token,'GET')).json();assert.equal(related.total,100);assert.ok(related.items.every(item=>item.id!=='s'));
  assert.equal((await request('/catalog?related=foreign',null,null,grant.token,'GET')).status,404);
  lib.cache.anime.splice(1);
  const catalog = await (await request('/catalog',null,null,grant.token,'GET')).json();
  assert.equal(catalog.items[0].cover,show.cover);
  assert.equal(catalog.items[0].description,show.description);
  const art={method:'GET',path:'/media-asset/anime/s/cover.jpg',headers:{authorization:'Bearer '+grant.token}};
  assert.equal(tv.mediaAccount(art).id,'a');
  assert.equal(tv.mediaAccount({...art,method:'POST'}),null);
  assert.equal(tv.mediaAccount({...art,path:'/media-asset/anime/s/episode.mp4'}),null);
  assert.equal(tv.mediaAccount({...art,path:'/media-asset/anime/foreign/cover.jpg'}),null);
  assert.equal(tv.mediaAccount({...art,headers:{}}),null);
  const styled=await request('/play',{id:'s',episode:'one',subtitle:4},null,grant.token);assert.equal(styled.status,200);assert.equal((await styled.json()).subtitleBurnedIn,true);
  assert.equal((await request('/play',{id:'s',episode:'one',subtitle:5},null,grant.token)).status,400);
  const playback = await request(
    "/play",
    { id: "s", episode: "one" },
    null,
    grant.token,
  );
  assert.equal(playback.status, 200);
  const options=await(await request('/playback-options?id=s&episode=one',null,null,grant.token,'GET')).json();assert.equal(options.audio[0].index,2);assert.equal(options.audio[1].language,'eng');assert.equal(options.subtitles[0].supported,true);assert.equal(options.subtitles[1].supported,false);
  const subtitle=await request('/subtitle?id=s&episode=one&track=4&shift=12',null,null,grant.token,'GET');assert.equal(subtitle.status,200);assert.match(await subtitle.text(),/WEBVTT/);
  assert.equal((await request('/subtitle?id=s&episode=one&track=5',null,null,grant.token,'GET')).status,422);
  assert.equal((await request('/subtitle?id=s&episode=other&track=4',null,null,grant.token,'GET')).status,404);
  assert.equal((await request('/subtitle?id=s&episode=one&track=4',null,null,null,'GET')).status,401);
  assert.equal((await request('/play',{id:'s',episode:'one',audio:99},null,grant.token)).status,400);
  assert.equal((await request('/play',{id:'s',episode:'one',audio:2},null,grant.token)).status,200);assert.equal((await request('/play',{id:'s',episode:'one',audio:3,offset:123},null,grant.token)).status,200);
  hdrMode=true;
  const direct=await(await request('/play',{id:'s',episode:'one',quality:'original',offset:42,capabilities:{hdr10:true,videoCodecs:['hevc'],audioCodecs:['aac']}},null,grant.token)).json();
  assert.equal(direct.mode,'direct');assert.equal(direct.seekSeconds,42);assert.equal(direct.startOffsetSeconds,0);assert.equal(direct.dynamicRange,'HDR10');
  const rawUrl=base.replace('/api/tv-native','')+direct.playlistUrl;
  const raw=await fetch(rawUrl,{headers:{Authorization:'Bearer '+grant.token,Range:'bytes=0-7'}});assert.equal(raw.status,206);assert.equal(await raw.text(),'original');
  assert.equal((await fetch(rawUrl)).status,401);
  assert.equal((await request('/original?id=s&episode=other',null,null,grant.token,'GET')).status,404);
  const sdr=await(await request('/play',{id:'s',episode:'one',quality:'original',forceSdr:true,capabilities:{hdr10:true,videoCodecs:['hevc'],audioCodecs:['aac']}},null,grant.token)).json();assert.equal(sdr.mode,'hls');
  hdrMode=false;
  const streamCookie = sdr.streamCookie;
  const media = {
    path: "/api/hls/stream123/playlist.m3u8",
    headers: { authorization: "Bearer " + grant.token },
  };
  assert.equal(tv.mediaAccount(media).id, "a");
  const cookieMedia = {
    ...media,
    headers: { cookie: "io_tv_stream=" + streamCookie },
  };
  assert.equal(tv.mediaAccount(cookieMedia).id, "a");
  assert.equal(
    tv.mediaAccount({ ...cookieMedia, path: "/api/hls/foreign/one.ts" }),
    null,
  );
  clock += 6 * 3600000 + 1;
  assert.equal(tv.mediaAccount(cookieMedia), null);
  clock -= 6 * 3600000 + 1;
  assert.equal(
    tv.mediaAccount({ ...media, path: "/api/admin/settings" }),
    null,
  );
  assert.equal(
    tv.mediaAccount({ ...media, path: "/api/hls/foreign/playlist.m3u8" }),
    null,
  );
  db.prepare("UPDATE profiles SET is_kids=1 WHERE id=?").run("p");
  rating = "Rx";
  assert.equal((await fetch(rawUrl,{headers:{Authorization:'Bearer '+grant.token}})).status,404);
  assert.equal(tv.mediaAccount(media), null);
  assert.equal(tv.mediaAccount(cookieMedia), null);
  assert.equal(
    (await request("/title/s", null, null, grant.token, "GET")).status,
    404,
  );
  await request("/devices/" + grant.deviceId, null, "b", null, "DELETE");
  assert.equal(
    (await request("/catalog", null, null, grant.token, "GET")).status,
    200,
  );
  await request("/devices/" + grant.deviceId, null, "a", null, "DELETE");
  assert.equal((await fetch(rawUrl,{headers:{Authorization:'Bearer '+grant.token}})).status,401);
  assert.equal(
    (await request("/catalog", null, null, grant.token, "GET")).status,
    401,
  );
  assert.equal(tv.mediaAccount(media), null);
});
