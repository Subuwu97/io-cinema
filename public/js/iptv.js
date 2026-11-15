(() => {
  let cleanup = () => {};
  const profile = () => 'profileId=' + encodeURIComponent(Store.activeProfile?.id || '');
  const post = body => API._fetch('/api/iptv/settings', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  async function page(root) {
    cleanup();
    root.innerHTML = renderNavbar('iptv') + `<main class="page-wrap"><h1>Live TV</h1><p>Browse your IPTV channels.</p><p><a href="#/live">Local-library TV guide</a> ${Store.account?.role === 'admin' ? ' · <a href="#/iptv-settings">Manage IPTV provider</a>' : ''}</p><div class="iptv-filters"><input data-search aria-label="Search channels" placeholder="Search channels"><select data-group aria-label="Channel group"><option value="">All groups</option></select><label><input data-favorites type="checkbox"> Favorites only</label></div><p data-status role="status"></p><section data-player hidden><h2 data-title></h2><video controls playsinline style="width:100%;max-height:65vh;background:#000"></video><button data-full class="btn btn-secondary">Full screen</button> <button data-close class="btn btn-secondary">Stop channel</button><p data-error role="status"></p></section><div data-channels class="iptv-channels"></div><button data-more class="btn btn-secondary" hidden>Load more channels</button></main>`;
    wireNavbar();
    const status = root.querySelector('[data-status]'), list = root.querySelector('[data-channels]'), video = root.querySelector('video'), panel = root.querySelector('[data-player]'), error = root.querySelector('[data-error]');
    let alive = true, generation = 0, playGeneration = 0, offset = 0, hls, timer;
    const key = 'mr-iptv-favorites-' + Store.account.id + '-' + Store.activeProfile.id;
    let favorites; try { favorites = new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch {favorites = new Set();}
    function stop() {playGeneration++; hls?.destroy(); hls = null; video.pause(); video.removeAttribute('src'); video.load(); panel.hidden = true;}
    cleanup = () => {alive = false; clearTimeout(timer); stop();};
    const more = root.querySelector('[data-more]');
    async function load(reset) {
      const ticket = ++generation; if (reset) {offset = 0; list.replaceChildren();}
      more.disabled = true; status.textContent = 'Loading channels…';
      try {
        const result = await API._fetch('/api/iptv/channels?' + profile() + '&q=' + encodeURIComponent(root.querySelector('[data-search]').value) + '&group=' + encodeURIComponent(root.querySelector('[data-group]').value) + '&offset=' + offset + (root.querySelector('[data-favorites]').checked ? '&ids=' + encodeURIComponent([...favorites].slice(0,100).join(',')) : ''));
        if (!alive || ticket !== generation) return;
        const groups = root.querySelector('[data-group]');
        if (groups.options.length === 1) for (const group of result.groups) {const option = new Option(group, group); groups.add(option);}
        for (const channel of result.channels) {
          const card = document.createElement('article'); card.className = 'iptv-channel';
          const play = document.createElement('button'); play.className = 'btn btn-secondary'; play.textContent = '▶ ' + channel.name; play.onclick = () => watch(channel);
          const group = document.createElement('small'); group.textContent = channel.group;
          const star = document.createElement('button'); star.className = 'btn-ghost';
          const update = () => {star.textContent = favorites.has(channel.id) ? '★ Favorite' : '☆ Favorite'; star.setAttribute('aria-pressed', favorites.has(channel.id));}; update();
          star.onclick = () => {if (!favorites.has(channel.id) && favorites.size >= 100) {status.textContent = 'You can save up to 100 favorite channels.'; return;} favorites.has(channel.id) ? favorites.delete(channel.id) : favorites.add(channel.id); try {localStorage.setItem(key, JSON.stringify([...favorites]));} catch {} update();};
          card.append(play, group, star); list.append(card);
        }
        offset += result.channels.length; more.hidden = offset >= result.total;
        status.textContent = result.total ? `${result.total} channels · ${offset} shown` : 'No channels found. An administrator can add a provider in Manage IPTV.';
      } catch (e) {if (alive && ticket === generation) status.textContent = e.message;}
      finally {if (alive && ticket === generation) more.disabled = false;}
    }
    async function watch(channel) {
      stop(); const ticket = playGeneration; error.textContent = ''; panel.hidden = false; root.querySelector('[data-title]').textContent = channel.name;
      window.CinemaMusic?.stop();
      try {
        const data = await API._fetch('/api/iptv/channels/' + encodeURIComponent(channel.id) + '/play?' + profile());
        if (!alive || ticket !== playGeneration) return;
        if (location.protocol === 'https:' && new URL(data.url).protocol !== 'https:') throw Error('This provider uses HTTP. Use the Google TV app or an HTTPS stream for playback.');
        if (window.Hls?.isSupported()) {
          hls = new Hls(); hls.on(Hls.Events.ERROR, (_event, data) => {if (data.fatal) {error.textContent = 'Channel unavailable or incompatible. Browser playback needs an HLS stream with provider CORS support. Try Google TV.'; hls?.destroy(); hls = null;}});
          hls.loadSource(data.url); hls.attachMedia(video);
        } else video.src = data.url;
        video.play().catch(() => {if (alive && ticket === playGeneration) error.textContent = 'Press Play to start, or choose another channel if this stream is unsupported.';});
        panel.scrollIntoView({block: 'start'});
      } catch (e) {if (alive && ticket === playGeneration) error.textContent = e.message;}
    }
    video.onerror = () => {error.textContent = 'This stream could not play. Try another channel or the Google TV app.';};
    root.querySelector('[data-full]').onclick = () => video.requestFullscreen?.().catch(() => {});
    root.querySelector('[data-close]').onclick = stop;
    root.querySelector('[data-search]').oninput = () => {clearTimeout(timer); generation++; timer = setTimeout(() => load(true), 250);};
    root.querySelector('[data-favorites]').onchange = () => load(true); root.querySelector('[data-group]').onchange = () => load(true); more.onclick = () => load(false);
    await load(true);
  }
  async function settings(root) {
    root.innerHTML = renderNavbar('iptv') + `<main class="page-wrap"><h1>IPTV provider</h1><p><a href="#/iptv">Back to Live TV</a></p><p>Add your provider using an M3U URL, playlist file or Xtream Codes login. Importing replaces the existing channel list. Unrated IPTV is unavailable to kids and restricted profiles.</p><form data-provider class="iptv-settings"><label>Source<select name="type"><option value="m3u">M3U URL</option><option value="file">M3U file</option><option value="xtream">Xtream Codes</option></select></label><label data-url>Provider / playlist address<input name="url" type="password" autocomplete="off" placeholder="https://…"></label><label data-file hidden>Playlist file<input name="file" type="file" accept=".m3u,.m3u8"></label><div data-login hidden><label>Username<input name="username" autocomplete="off"></label><label>Password<input name="password" type="password" autocomplete="new-password"></label></div><button class="btn btn-primary">Import channels</button></form><p data-status role="status"></p><button data-refresh class="btn btn-secondary">Refresh saved provider</button> <button data-clear class="btn-ghost">Remove provider</button><p>Credentials and playlists are encrypted on the server. Authorized viewers receive stream addresses for direct playback. Browser streams need HLS and provider CORS support; Google TV supports more formats. Program schedules, recording and catch-up are not included in this preview.</p></main>`;
    wireNavbar(); const form = root.querySelector('form'), status = root.querySelector('[data-status]');
    const show = data => {status.textContent = data.configured ? `${data.count} channels imported · ${new Date(data.updatedAt).toLocaleString()}` : 'No provider configured';};
    form.elements.type.onchange = () => {root.querySelector('[data-file]').hidden = form.elements.type.value !== 'file'; root.querySelector('[data-url]').hidden = form.elements.type.value === 'file'; root.querySelector('[data-login]').hidden = form.elements.type.value !== 'xtream';};
    let working = false;
    async function save(body) {if (working) return; working = true; status.textContent = 'Importing channels…'; try {show(await post(body)); if (body.type) form.reset(); form.elements.type.onchange();} catch(e) {status.textContent = e.message;} finally {working = false;}}
    form.onsubmit = async e => {e.preventDefault(); const type = form.elements.type.value; let text = ''; if (type === 'file') {const file = form.elements.file.files[0]; if (!file || file.size > 8 * 1024 * 1024) {status.textContent = 'Choose an M3U file up to 8 MB.'; return;} text = await file.text();} await save({type, text, url: form.elements.url.value.trim(), username: form.elements.username.value, password: form.elements.password.value});};
    root.querySelector('[data-refresh]').onclick = () => save({refresh: true});
    root.querySelector('[data-clear]').onclick = () => {if (confirm('Remove the IPTV provider and imported channels?')) save({clear: true});};
    try {show(await API._fetch('/api/iptv/settings'));} catch(e) {status.textContent = e.message;}
  }
  window.MythicIPTV = {page, settings, stop: () => cleanup()};
})();
