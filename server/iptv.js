const {createHash} = require('node:crypto');
const MAX_BYTES = 8 * 1024 * 1024;
function httpUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw Error('Enter a complete HTTP or HTTPS address'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || value.length > 4096)
    throw Error('Use an HTTP or HTTPS address without embedded login credentials');
  return url.href;
}
function parseM3u(text) {
  if (Buffer.byteLength(text) > MAX_BYTES) throw Error('Playlist exceeds 8 MB');
  if (!text.replace(/^\uFEFF/, '').trimStart().startsWith('#EXTM3U')) throw Error('Choose an extended M3U channel playlist');
  if (/#EXT-X-(?:TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE)/.test(text)) throw Error('This is one video stream, not a channel playlist');
  const channels = [], seen = new Set(); let entry;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF:')) {
      const attrs = Object.fromEntries([...line.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
      const comma = line.replace(/"[^"]*"/g, m => ' '.repeat(m.length)).indexOf(',');
      entry = {name: (comma >= 0 ? line.slice(comma + 1) : attrs['tvg-name'] || '').trim().slice(0, 200), group: (attrs['group-title'] || 'Other').slice(0, 100), guideId: (attrs['tvg-id'] || '').slice(0, 200)};
    } else if (entry && line && !line.startsWith('#')) {
      let url; try { url = httpUrl(line); } catch { entry = null; continue; }
      if (!seen.has(url) && entry.name) { seen.add(url); channels.push({...entry, id: createHash('sha256').update(url).digest('hex').slice(0, 24), url}); }
      entry = null;
      if (channels.length > 20000) throw Error('Playlist exceeds 20,000 channels');
    }
  }
  if (!channels.length) throw Error('No playable HTTP channels found');
  return channels;
}
function source(input) {
  if (input.type === 'file') return {type: 'file', text: String(input.text || '')};
  if (input.type === 'm3u') return {type: 'm3u', url: httpUrl(String(input.url || ''))};
  if (input.type !== 'xtream') throw Error('Choose M3U, playlist file or Xtream Codes');
  const url = new URL(httpUrl(String(input.url || '')));
  if (url.search || !input.username || !input.password || String(input.username).length > 256 || String(input.password).length > 256) throw Error('Enter the provider address, username and password');
  url.pathname = url.pathname.replace(/\/$/, '') + '/get.php';
  url.search = new URLSearchParams({username: String(input.username), password: String(input.password), type: 'm3u_plus', output: 'm3u8'}).toString();
  return {type: 'xtream', url: url.href};
}
async function download(config, fetchImpl) {
  if (config.type === 'file') return config.text;
  // Only administrators configure this destination; never accept a viewer-supplied URL.
  // Redirects are rejected to keep the request on the explicitly configured provider.
  const response = await fetchImpl(config.url, {redirect: 'error', signal: AbortSignal.timeout(20000)});
  if (!response.ok) throw Error('Provider request failed');
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) { bytes += chunk.length; if (bytes > MAX_BYTES) throw Error('Playlist exceeds 8 MB'); chunks.push(chunk); }
  return Buffer.concat(chunks).toString('utf8');
}
function registerIPTV(app, {requireAuth, requireAdmin, secrets, db, nativeAuth, publicOrigin = () => '', fetchImpl = fetch}) {
  let busy = false;
  const saved = () => secrets.get().iptv || {channels: []};
  const status = () => ({configured: !!saved().channels.length, count: saved().channels.length, type: saved().source?.type || '', updatedAt: saved().updatedAt || null});
  const sameOrigin = (req, res) => { if (req.headers.origin && ![`${req.protocol}://${req.get('host')}`, publicOrigin()].includes(req.headers.origin)) {res.sendStatus(403); return false;} return true; };
  function viewer(req, res, native) {
    if (native) { const d = nativeAuth(req, res); if (!d) return false; if (d.is_kids || d.adult_content_allowed === 0) { res.status(403).json({error: 'Unrated IPTV is unavailable to restricted profiles'}); return false; } return true; }
    const account = requireAuth(req, res); if (!account) return false;
    const p = typeof req.query.profileId === 'string' && db.prepare('SELECT is_kids FROM profiles WHERE id=? AND account_id=?').get(req.query.profileId, account.id);
    if (!p || p.is_kids || account.adultContentAllowed === false) {res.status(403).json({error: 'Select an unrestricted profile to watch IPTV'}); return false;} return true;
  }
  app.get('/api/iptv/settings', (req, res) => {if (requireAdmin(req, res)) res.set('Cache-Control', 'no-store').json(status());});
  app.post('/api/iptv/settings', async (req, res) => {
    if (!requireAdmin(req, res) || !sameOrigin(req, res)) return;
    if (busy) return res.status(409).json({error: 'A channel import is already running'});
    busy = true;
    try {
      if (req.body?.clear === true) {secrets.save({...secrets.get(), iptv: {channels: []}}); return res.json(status());}
      const config = req.body?.refresh === true ? saved().source : source(req.body || {});
      if (!config) throw Error('Add a provider first');
      const channels = parseM3u(await download(config, fetchImpl));
      secrets.save({...secrets.get(), iptv: {source: config, channels, updatedAt: new Date().toISOString()}});
      res.set('Cache-Control', 'no-store').json(status());
    } catch { res.status(400).json({error: 'Import failed. Check the provider address/login or extended M3U file (maximum 8 MB). Previous channels were kept.'}); }
    finally {busy = false;}
  });
  for (const [prefix, native] of [['/api/iptv', false], ['/api/tv-native/iptv', true]]) {
    app.get(prefix + '/channels', (req, res) => {
      if (!viewer(req, res, native)) return;
      const all = saved().channels, q = String(req.query.q || '').toLowerCase().slice(0, 200), group = String(req.query.group || '');
      const ids = req.query.ids === undefined ? null : new Set(String(req.query.ids).split(',').slice(0, 100));
      const filtered = all.filter(c => (!ids || ids.has(c.id)) && (!group || c.group === group) && (!q || c.name.toLowerCase().includes(q)));
      const offset = Math.max(0, Math.min(20000, parseInt(req.query.offset) || 0));
      res.set('Cache-Control', 'no-store').json({total: filtered.length, groups: [...new Set(all.map(c => c.group))].sort(), channels: filtered.slice(offset, offset + 100).map(({url, ...c}) => c)});
    });
    app.get(prefix + '/channels/:id/play', (req, res) => {
      if (!viewer(req, res, native)) return;
      const channel = saved().channels.find(c => c.id === req.params.id);
      if (!channel) return res.status(404).json({error: 'Channel no longer available'});
      // Direct playback: do not forward the Mythic authentication token to the provider.
      res.set('Cache-Control', 'no-store').json({name: channel.name, url: channel.url});
    });
  }
}
module.exports = {registerIPTV, parseM3u, source, download};
