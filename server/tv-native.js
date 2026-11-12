const { randomBytes, randomUUID, createHash } = require("node:crypto");
const hash = (v) => createHash("sha256").update(String(v)).digest("hex");
function registerNativeTV(
  app,
  {
    db,
    requireAuth,
    profiles,
    getLibrary,
    startHls,
    getMediaInfo = async () => ({ audioStreams: [] }),
    getSubtitle = async () => { throw Error("Subtitle extraction unavailable"); },
    publicOrigin = () => "",
    now = Date.now,
  },
) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS native_tv_devices(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,name TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,last_seen INTEGER NOT NULL,expires_at INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS native_tv_streams(device_id TEXT NOT NULL REFERENCES native_tv_devices(id) ON DELETE CASCADE,cache_key TEXT NOT NULL,item_id TEXT NOT NULL,ticket_hash TEXT,expires_at INTEGER NOT NULL,PRIMARY KEY(device_id,cache_key));`,
  );
  if (
    !db
      .prepare("PRAGMA table_info(native_tv_streams)")
      .all()
      .some((c) => c.name === "ticket_hash")
  )
    db.exec("ALTER TABLE native_tv_streams ADD COLUMN ticket_hash TEXT");
  const pending = new Map(),
    rates = new Map();
  const safe = (fn) => (req, res) =>
    Promise.resolve()
      .then(() => fn(req, res))
      .catch((e) => {
        if (!res.headersSent) res.status(400).json({ error: e.message });
      });
  function clean() {
    for (const [k, v] of pending)
      if (v.expires <= now()) {
        if (v.deviceId)
          db.prepare("DELETE FROM native_tv_devices WHERE id=?").run(
            v.deviceId,
          );
        pending.delete(k);
      }
  }
  function device(req) {
    const token = String(req.headers.authorization || "").match(
      /^Bearer (io_tv_[a-f0-9]{64})$/,
    )?.[1];
    if (!token) return null;
    return (
      db
        .prepare(
          "SELECT d.*,p.is_kids,p.name AS profile_name,a.approved,a.adult_content_allowed FROM native_tv_devices d JOIN profiles p ON p.id=d.profile_id AND p.account_id=d.account_id JOIN accounts a ON a.id=d.account_id WHERE token_hash=? AND expires_at>? AND a.approved=1",
        )
        .get(hash(token), now()) || null
    );
  }
  const allowed = (d, title) =>
    title &&
    (!(d.is_kids || d.adult_content_allowed === 0) ||
      !/(rx|hentai|x-rated)/i.test(title.rating || ""));
  function auth(req, res) {
    const d = device(req);
    if (!d) {
      res.status(401).json({ error: "Pair this TV again" });
      return null;
    }
    db.prepare(
      "UPDATE native_tv_devices SET last_seen=?,expires_at=? WHERE id=?",
    ).run(now(), now() + 90 * 86400000, d.id);
    return d;
  }
  app.use("/api/tv-native", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      req.method !== "GET" &&
      req.headers.origin &&
      !new Set([`${req.protocol}://${req.get("host")}`, publicOrigin()]).has(
        req.headers.origin,
      )
    )
      return res.sendStatus(403);
    next();
  });
  app.post("/api/tv-native/pair/start", (req, res) => {
    clean();
    const key = req.ip,
      rate = rates.get(key);
    if (rate && now() - rate.at < 60000 && rate.n++ >= 5)
      return res
        .status(429)
        .json({ error: "Wait a minute before requesting another code" });
    if (!rate || now() - rate.at >= 60000) rates.set(key, { at: now(), n: 1 });
    if (rates.size > 5000) rates.delete(rates.keys().next().value);
    if (pending.size >= 1000) return res.sendStatus(503);
    const name = String(req.body?.name || "I/O TV")
        .trim()
        .slice(0, 80),
      code = randomBytes(5).toString("hex").toUpperCase(),
      pollSecret = randomBytes(32).toString("hex");
    pending.set(code, {
      name,
      pollHash: hash(pollSecret),
      expires: now() + 300000,
    });
    res
      .status(201)
      .json({
        code,
        pollSecret,
        expiresIn: 300,
        approvalPath: "#/tv-pair/" + code,
      });
  });
  app.get("/api/tv-native/pair/:code", (req, res) => {
    if (!requireAuth(req, res)) return;
    clean();
    const p = pending.get(req.params.code);
    if (!p) return res.sendStatus(404);
    res.json({ name: p.name, expiresAt: p.expires, approved: !!p.deviceId });
  });
  app.post(
    "/api/tv-native/pair/:code/approve",
    safe(async (req, res) => {
      const a = requireAuth(req, res);
      if (!a) return;
      clean();
      const p = pending.get(req.params.code);
      if (!p || p.deviceId)
        throw Error("Pairing code expired or already approved");
      const profile =
        typeof req.body?.profileId === "string" &&
        db
          .prepare("SELECT * FROM profiles WHERE id=? AND account_id=?")
          .get(req.body.profileId, a.id);
      if (!profile) throw Error("Choose your own profile");
      if (!profiles.verifyPin(a.id, profile.id, req.body.pin))
        throw Error("Profile PIN is incorrect");
      if (
        db
          .prepare(
            "SELECT COUNT(*) n FROM native_tv_devices WHERE account_id=?",
          )
          .get(a.id).n >= 20
      )
        throw Error("Remove an old TV before adding another");
      const id = randomUUID(),
        token = "io_tv_" + randomBytes(32).toString("hex");
      db.prepare("INSERT INTO native_tv_devices VALUES(?,?,?,?,?,?,?,?)").run(
        id,
        a.id,
        profile.id,
        p.name,
        hash(token),
        now(),
        now(),
        now() + 90 * 86400000,
      );
      p.deviceId = id;
      p.token = token;
      p.profileName = profile.name;
      res.json({ ok: true });
    }),
  );
  app.post("/api/tv-native/pair/poll", (req, res) => {
    clean();
    const p = pending.get(req.body?.code);
    if (
      !p ||
      typeof req.body?.pollSecret !== "string" ||
      hash(req.body.pollSecret) !== p.pollHash
    )
      return res.status(404).json({ status: "expired" });
    if (!p.deviceId) return res.json({ status: "pending" });
    const live = db
      .prepare("SELECT id FROM native_tv_devices WHERE id=?")
      .get(p.deviceId);
    pending.delete(req.body.code);
    if (!live) return res.status(404).json({ status: "expired" });
    res.json({
      status: "approved",
      deviceId: p.deviceId,
      token: p.token,
      profileName: p.profileName,
    });
  });
  app.get("/api/tv-native/devices", (req, res) => {
    const a = requireAuth(req, res);
    if (!a) return;
    res.json(
      db
        .prepare(
          "SELECT d.id,d.name,p.name AS profileName,d.last_seen AS lastSeen,d.expires_at AS expiresAt FROM native_tv_devices d JOIN profiles p ON p.id=d.profile_id WHERE d.account_id=? ORDER BY d.last_seen DESC",
        )
        .all(a.id),
    );
  });
  app.delete("/api/tv-native/devices/:id", (req, res) => {
    const a = requireAuth(req, res);
    if (!a) return;
    db.prepare("DELETE FROM native_tv_devices WHERE id=? AND account_id=?").run(
      req.params.id,
      a.id,
    );
    res.json({ ok: true });
  });
  app.get("/api/tv-native/catalog", (req, res) => {
    const d = auth(req, res);
    if (!d) return;
    const related = req.query.related ? getLibrary().getShow(String(req.query.related)) : null;
    if(req.query.related && !allowed(d,related))return res.sendStatus(404);
    const q = String(req.query.q || "")
        .slice(0, 100)
        .toLowerCase(),
      lib = getLibrary(),
      items = [
        ...lib.cache.anime.map((t) => ({ ...t, kind: "series" })),
        ...lib.cache.movies.map((t) => ({ ...t, kind: "movie" })),
      ]
        .filter(
          (t) =>
            allowed(d, t) &&
            (!related || (t.id!==related.id && (t.genres||[]).some(g=>(related.genres||[]).includes(g)))) &&
            (!req.query.kind || t.kind === req.query.kind) &&
            (!q || t.title.toLowerCase().includes(q)),
        )
        .sort((a, b) => req.query.sort === "recent" ? String(b.dateAdded || "").localeCompare(String(a.dateAdded || "")) : a.title.localeCompare(b.title)),
      offset = Math.max(0, Math.min(100000, Number(req.query.offset) || 0));
    const progressRows = db.prepare("SELECT item_id,episode_rel_path AS episode,seconds,duration,updated_at FROM progress WHERE profile_id=? AND hidden=0 ORDER BY updated_at DESC").all(d.profile_id);
    const progressById = new Map(progressRows.map(p => [p.item_id,p]));
    const savedIds = new Set(db.prepare("SELECT item_id FROM my_list WHERE profile_id=? AND item_type='anime'").all(d.profile_id).map(row=>row.item_id));
    const summarize = t => ({id:t.id,title:t.title,year:t.year,kind:t.kind,rating:t.rating,cover:t.cover||null,banner:t.banner||null,description:String(t.description||'').slice(0,1200),progress:progressById.get(t.id)||null});
    const byId = new Map(items.map(t=>[t.id,t]));
    const recent=[...items].sort((a,b)=>String(b.dateAdded||'').localeCompare(String(a.dateAdded||'')));
    const genres=new Map();for(const item of items)for(const genre of item.genres||[]){if(!genres.has(genre))genres.set(genre,[]);genres.get(genre).push(item);}
    const pickedIds=new Set(db.prepare("SELECT item_id FROM top_picks WHERE profile_id=? AND item_type='anime'").all(d.profile_id).map(row=>row.item_id));
    const weights={};const seen=new Set([...pickedIds,...savedIds,...progressById.keys()]);
    for(const item of items){const weight=(pickedIds.has(item.id)?3:0)+(savedIds.has(item.id)?2:0)+(progressById.has(item.id)?1:0);if(weight)for(const genre of item.genres||[])weights[genre]=(weights[genre]||0)+weight;}
    const inspired=items.filter(item=>!seen.has(item.id)).map(item=>({item,score:(item.genres||[]).reduce((sum,g)=>sum+(weights[g]||0),0)})).filter(row=>row.score>0).sort((a,b)=>b.score-a.score).slice(0,30).map(row=>row.item);
    const watched=db.prepare('SELECT item_id,SUM(seconds) AS watched FROM progress WHERE seconds>0 GROUP BY item_id ORDER BY watched DESC LIMIT 100').all().map(row=>byId.get(row.item_id)).filter(Boolean);
    const recentEpisodes=db.prepare('SELECT show_id,MAX(first_seen_at) AS added FROM episode_first_seen GROUP BY show_id ORDER BY added DESC LIMIT 100').all().map(row=>byId.get(row.show_id)).filter(Boolean);
    const sections=[{title:'Inspired by You',items:inspired},{title:'My Top Picks',items:items.filter(t=>pickedIds.has(t.id)).slice(0,30)},{title:'Recently Added Episodes',items:recentEpisodes.slice(0,30)},{title:'Recently Added',items:recent.slice(0,30)},{title:'Most Watched',items:watched.slice(0,30)},{title:'New This Year',items:items.filter(t=>Number(t.year)===new Date(now()).getFullYear()).slice(0,30)},{title:'TV Shows',items:items.filter(t=>t.kind==='series').slice(0,30)},{title:'Movies',items:items.filter(t=>t.kind==='movie').slice(0,30)},...[...genres.entries()].filter(([g,t])=>t.length>=3).sort((a,b)=>b[1].length-a[1].length).slice(0,8).map(([title,items])=>({title,items:items.slice(0,24)}))].filter(row=>row.items.length).map(row=>({title:row.title,items:row.items.map(summarize)}));

    res.json({
      profileName: d.profile_name,
      total:items.length,
      sections,
      items: items.slice(offset, offset+50).map(summarize),
      watchlist: items.filter(t=>savedIds.has(t.id)).slice(0,50).map(summarize),
      continueWatching: progressRows.filter(p=>byId.has(p.item_id)&&p.seconds>0&&(!p.duration||p.seconds<p.duration*0.95)).slice(0,20).map(p=>summarize(byId.get(p.item_id))),
      nextOffset: offset+50<items.length?offset+50:null,
    });
  });
  app.get("/api/tv-native/title/:id", (req, res) => {
    const d = auth(req, res);
    if (!d) return;
    const title = getLibrary().getShow(req.params.id);
    if (!allowed(d, title)) return res.sendStatus(404);
    res.json({
      id: title.id,
      title: title.title,
      description: title.description,
      cover: title.cover || null,
      banner: title.banner || null,
      inWatchlist: !!db.prepare("SELECT 1 FROM my_list WHERE profile_id=? AND item_type='anime' AND item_id=?").get(d.profile_id,title.id),
      episodes: (title.groups || []).flatMap((g) =>
        g.episodes.map((e) => ({
          path: e.relPath,
          title: e.title || e.file,
          group: g.name,
        })),
      ),
      progress:
        db
          .prepare(
            "SELECT episode_rel_path AS episode,seconds,duration FROM progress WHERE profile_id=? AND item_id=?",
          )
          .get(d.profile_id, title.id) || null,
    });
  });
  app.put('/api/tv-native/watchlist/:id', safe(async (req,res)=>{
    const d=auth(req,res);if(!d)return;
    const title=getLibrary().getShow(req.params.id);
    if(!allowed(d,title))return res.sendStatus(404);
    if(typeof req.body?.saved!=='boolean')throw Error('Choose whether to save this title');
    if(req.body.saved)db.prepare("INSERT OR IGNORE INTO my_list(profile_id,item_type,item_id) VALUES(?,'anime',?)").run(d.profile_id,title.id);
    else db.prepare("DELETE FROM my_list WHERE profile_id=? AND item_type='anime' AND item_id=?").run(d.profile_id,title.id);
    res.json({saved:req.body.saved});
  }));
  app.post(
    "/api/tv-native/play",
    safe(async (req, res) => {
      const d = auth(req, res);
      if (!d) return;
      const b = req.body || {},
        title = getLibrary().getShow(b.id);
      if (
        !allowed(d, title) ||
        typeof b.episode !== "string" ||
        !(title.groups || []).some((g) =>
          g.episodes.some((e) => e.relPath === b.episode),
        )
      )
        return res.sendStatus(404);
      if (
        b.quality &&
        !["original", "360", "480", "720", "1080"].includes(String(b.quality))
      )
        throw Error("Unsupported quality");
      const offset = Number(b.offset || 0);
      if (!Number.isFinite(offset) || offset < 0 || offset > 1e7)
        throw Error("Invalid playback position");
      let audio;
      if(b.audio!==undefined&&b.audio!==null){
        if(!Number.isInteger(b.audio)||b.audio<0)throw Error('Choose a valid audio track');
        const info=await getMediaInfo(title.id,b.episode);
        if(!info.audioStreams?.some(s=>s.index===b.audio))throw Error('Audio track is not available');
        audio=b.audio;
      }
      let subtitle;
      if(b.subtitle!==undefined&&b.subtitle!==null){
        if(!Number.isInteger(b.subtitle)||b.subtitle<0)throw Error('Choose a valid subtitle track');
        const info=await getMediaInfo(title.id,b.episode);
        if(!info.subtitleStreams?.some(s=>s.index===b.subtitle&&['ass','ssa'].includes(s.codec)))throw Error('Styled subtitle track is not available');
        subtitle=b.subtitle;
      }
      const result = await startHls(title.id, b.episode, {
        audio,
        subtitle,
        quality: b.quality || "720",
        startOffsetSeconds: offset,
      });
      if (result.error)
        return res
          .status(result.error.status)
          .json({ error: result.error.message });
      if (!device(req)) return res.sendStatus(401);
      db.prepare("DELETE FROM native_tv_streams WHERE expires_at<?").run(now());
      const ticket = "io_hls_" + randomBytes(24).toString("hex");
      db.prepare(
        "INSERT INTO native_tv_streams(device_id,cache_key,item_id,ticket_hash,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(device_id,cache_key) DO UPDATE SET expires_at=excluded.expires_at,item_id=excluded.item_id,ticket_hash=excluded.ticket_hash",
      ).run(d.id, result.cacheKey, title.id, hash(ticket), now() + 6 * 3600000);
      res.json({
        playlistUrl: "/api/hls/" + result.cacheKey + "/playlist.m3u8",
        startOffsetSeconds: offset,
        streamCookie: ticket,
        subtitleBurnedIn: subtitle!==undefined,
      });
    }),
  );
  app.get('/api/tv-native/playback-options',safe(async(req,res)=>{
    const d=auth(req,res);if(!d)return;const title=getLibrary().getShow(req.query.id);
    if(!allowed(d,title)||!(title.groups||[]).some(g=>g.episodes.some(e=>e.relPath===req.query.episode)))return res.sendStatus(404);
    const info=await getMediaInfo(title.id,req.query.episode);
    if(!device(req))return res.sendStatus(401);
    res.json({qualities:['original','1080','720','480','360'],audio:(info.audioStreams||[]).map(s=>({index:s.index,language:s.language||'und',title:s.title||'',codec:s.codec||''})),subtitles:(info.subtitleStreams||[]).map(s=>({index:s.index,language:s.language||'und',title:s.title||'',codec:s.codec||'',supported:!s.imageBased}))});
  }));
  app.get('/api/tv-native/subtitle',safe(async(req,res)=>{
    const d=auth(req,res);if(!d)return;
    const title=getLibrary().getShow(req.query.id),episode=req.query.episode,track=Number(req.query.track),shift=Number(req.query.shift||0);
    if(!allowed(d,title)||typeof episode!=='string'||!(title.groups||[]).some(g=>g.episodes.some(e=>e.relPath===episode)))return res.sendStatus(404);
    if(!Number.isInteger(track)||track<0||!Number.isFinite(shift)||shift<0||shift>1e7)throw Error('Invalid subtitle selection');
    const info=await getMediaInfo(title.id,episode),subtitle=info.subtitleStreams?.find(s=>s.index===track);
    if(!subtitle)return res.status(404).json({error:'Subtitle track not found'});
    if(subtitle.imageBased)return res.status(422).json({error:'This image-based subtitle track cannot be displayed. Choose a text subtitle track.'});
    const text=await getSubtitle(title.id,episode,track,shift);
    const current=device(req);if(!current||!allowed(current,getLibrary().getShow(title.id)))return res.sendStatus(401);
    res.type('text/vtt').send(text);
  }));
  app.put("/api/tv-native/progress", (req, res) => {
    const d = auth(req, res);
    if (!d) return;
    const b = req.body || {},
      title = getLibrary().getShow(b.id);
    if (
      !allowed(d, title) ||
      !(title.groups || []).some((g) =>
        g.episodes.some((e) => e.relPath === b.episode),
      )
    )
      return res.sendStatus(404);
    if (
      !Number.isFinite(b.seconds) ||
      !Number.isFinite(b.duration) ||
      b.seconds < 0 ||
      b.duration < b.seconds ||
      b.duration > 1e7
    )
      return res.sendStatus(400);
    db.prepare(
      "INSERT INTO progress(profile_id,item_id,episode_rel_path,seconds,duration,updated_at,hidden) VALUES(?,?,?,?,?,?,0) ON CONFLICT(profile_id,item_id) DO UPDATE SET episode_rel_path=excluded.episode_rel_path,seconds=excluded.seconds,duration=excluded.duration,updated_at=excluded.updated_at,hidden=0",
    ).run(
      d.profile_id,
      title.id,
      b.episode,
      b.seconds,
      b.duration,
      new Date(now()).toISOString(),
    );
    res.json({ ok: true });
  });
  return {
    mediaAccount(req) {
      if (req.method === 'GET' && /^\/media-asset\/(anime|movies)\/[^/]+\/[^/]+$/.test(req.path)) {
        const d = device(req);
        let id;
        try { id = decodeURIComponent(req.path.split('/')[3]); } catch { return null; }
        const title = d && getLibrary().getShow(id);
        if (!allowed(d, title)) return null;
        if (![title.cover, title.banner].some(url => typeof url === 'string' && url.split('?')[0] === req.path)) return null;
        return {id:d.account_id,approved:true,adultContentAllowed:d.adult_content_allowed!==0,role:'user'};
      }
      if (!/^\/api\/hls\/[a-zA-Z0-9_-]+\//.test(req.path)) return null;
      const key = req.path.split("/")[3];
      let d = device(req),
        stream;
      if (d)
        stream = db
          .prepare(
            "SELECT item_id FROM native_tv_streams WHERE device_id=? AND cache_key=? AND expires_at>?",
          )
          .get(d.id, key, now());
      else {
        const ticket = String(req.headers.cookie || "")
          .split(";")
          .map((s) => s.trim())
          .find((s) => s.startsWith("io_tv_stream="))
          ?.slice(13);
        if (!ticket || !/^io_hls_[a-f0-9]{48}$/.test(ticket)) return null;
        stream = db
          .prepare(
            "SELECT item_id,device_id FROM native_tv_streams WHERE ticket_hash=? AND cache_key=? AND expires_at>?",
          )
          .get(hash(ticket), key, now());
        if (stream)
          d = db
            .prepare(
              "SELECT d.*,p.is_kids,a.adult_content_allowed FROM native_tv_devices d JOIN profiles p ON p.id=d.profile_id AND p.account_id=d.account_id JOIN accounts a ON a.id=d.account_id WHERE d.id=? AND d.expires_at>? AND a.approved=1",
            )
            .get(stream.device_id, now());
      }
      if (!d || !stream || !allowed(d, getLibrary().getShow(stream.item_id)))
        return null;
      return {
        id: d.account_id,
        approved: true,
        adultContentAllowed: d.adult_content_allowed !== 0,
        role: "user",
      };
    },
  };
}
module.exports = { registerNativeTV };
