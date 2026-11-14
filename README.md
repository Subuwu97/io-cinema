# Mythic Reverie

A separate self-hosted movies, TV-show and music application based on [I/O](https://github.com/Subuwu97/io), originally based on Minami. This repository is independent of I/O.

## Run with Node.js

Requires Node.js 22.5 or newer. Install FFmpeg/ffprobe for transcoding, multiple audio tracks and subtitle extraction.

```sh
npm ci
npm start
```

Open http://localhost:5922 and create the first administrator account. Cinema uses port **5922**, separate from I/O (5921) and Minami (4820). User data, accounts and settings live in **cinema-data/**; set **IO_CINEMA_DATA_DIR** to override that location. The authentication cookie is separate from I/O. Do not point the two applications at the same data directory.

## Your library

```text
media/tv/Show Name/Season 01/S01E01 - Episode title.mkv
media/movies/Movie Name/Movie Name.mkv
```

Set your own TV/movie folders in Settings. Put `cover.jpg`, `banner.jpg`, and optional `info.json` beside the show/movie folders. Example metadata:

```json
{"title":"Example Show","description":"A description","year":2026,"rating":"TV-PG","genres":["Drama"],"type":"TV"}
```

## Included

Movie and TV browsing, seasons and episodes, accounts/profiles, watchlists, progress, autoplay, multi-audio playback, styled ASS subtitles, HLS transcoding, browser casting handoff, administrative settings and backups come from the I/O codebase. No media files, passwords, server addresses or existing account data are included.

Books/manga are not scanned and reader routes are disabled. MAL/AniList metadata enrichment and tracker routes are disabled: movie/TV metadata comes from local artwork and `info.json`. Internal `anime` API/array identifiers remain for player compatibility; the library is used for TV shows. Inherited unused reader/metadata source files remain as reference, not enabled Cinema features.

## Initial-release limits

This is version 0.4.3, an independent starting point, not a production certification. Automatic TMDB/TVDB matching is not implemented. Native I/O clients and launcher binaries are intentionally excluded because they connect to I/O and use its app identifiers. New Cinema clients can be built separately. Configure Cinema's own public URL and services; I/O's existing domain is unchanged.

## Attribution

Derived from Subuwu97/io commit 8ed9c7f, using its declared MIT license; I/O is based on Minami. Third-party vendor licenses remain alongside bundled assets. Artwork and trademarks retain their respective ownership.

## Validation in this checkout

The Cinema-specific scope/isolation checks and subtitle tests pass (7 tests), and all server/client JavaScript syntax checks pass. The server starts and scans the separate empty TV/movie roots. The full inherited suite is not verified in this restricted session: 37 tests pass and 46 fail because local HTTP connections are denied. A browser preview also times out. These connection-dependent checks need rerunning in a normal environment before deployment.

Player dependencies are generated from the pinned npm packages when `npm start` runs. Keep development dependencies installed for this build step. Cinema uses the I/O vector logo and generic SVG profile icons; anime-specific raster artwork is not included in this edition.

## Music library

Open **Music** in the top navigation, then expand **Music library settings** as an administrator. Enter an absolute folder path on the machine running Cinema, such as `/mnt/music` or `D:/Music`, and choose **Save folder and scan**. This does not upload or change your music files. Folder settings stay private in `cinema-data/music-settings.json`. Only signed-in accounts can browse or play music. The music collection is shared between Cinema accounts.

MP3, M4A, AAC, FLAC, WAV, Ogg, Opus and audio WebM files are indexed. Playback depends on the browser's native codec support; unsupported formats show an error rather than silently transcoding. FFprobe reads title/artist/album/disc/track metadata and duration; filenames/folders are the fallback. Artwork comes from cover.jpg, folder.jpg, cover.png, folder.png or cover.webp, then embedded audio artwork via FFmpeg.

The listening room includes album/artist search, album tracks, Now Playing, a persistent mini-player, queue, previous/next, shuffle, repeat all/one, seeking, volume, media-key integration and keyboard shortcuts (Space and Left/Right). Music pauses when video starts, and stops on account/profile changes. There are no saved playlists or lyrics yet.

Scans ignore symlinks, stay within the selected root, cap traversal at 20,000 tracks/24 folder levels, and reuse unchanged tag metadata in memory. Use **Rescan library** after adding music. Ten focused tests pass, including a real tagged MP3 with embedded artwork. The UI and full HTTP range playback still need verification with a running instance and real music library; local network restrictions prevented that check in this session.

## OMDb movie and TV metadata

As an administrator, open **Settings → Media folders → OMDb movie & TV metadata**, paste your own OMDb key and click **Save OMDb key**. Alternatively set `OMDB_API_KEY` on the server. The saved key is encrypted with the existing integration-secret store, is never returned to the browser, and is excluded from Git. Do not send API keys in chat.

Open a movie or TV-series page and choose **Import from OMDb**. Search by title or IMDb ID, review the matching format, and import. Defaults fill missing details and preserve existing local metadata, skip points and artwork. Select **Replace existing title details** to replace title/plot/year/rating/genres. Existing `info.json` is backed up as `info.before-omdb.json` before saving. Posters download only when no cover exists, through a restricted HTTPS image fetch. Displayed title details include runtime, IMDb score, director and cast, with OMDb attribution.

This uses OMDb's title/search API for movie and series records; it does not automatically match the whole library or replace episode filenames. Your own valid OMDb key and plan limits apply. See https://www.omdbapi.com/ for API details and content terms.

Music folder configuration is now expanded at the top of the Music page and also appears in **Settings → Media folders → Music directory**. This is an administrator-only server setting; ordinary accounts can browse and play music but cannot change the shared root. Thirteen focused tests pass, including OMDb request caching, private-key handling, metadata preservation and poster validation. Live OMDb requests still require your own key.

## Music scan progress and whole-library OMDb (0.2.2)

Music scans now publish filename-based playable entries before potentially slow tag probing finishes, then enrich artist/album details in place. The Music page reports the current phase, discovered files and completed tag reads. Unreadable subfolders are skipped; empty or unreadable roots produce a visible message. A failed inaccessible-root scan preserves the previous index.

As an administrator, open **Settings → Media folders → Whole-library OMDb metadata** and choose **Pull metadata for the whole library**. An OMDb key and an indexed movie/TV library are required. Existing OMDb titles are skipped unless **Refresh previously matched titles** is checked. Existing local metadata is preserved unless **Replace existing title details** is checked. Known IMDb IDs are reused; other titles require one unique exact title/format/year match from search. Ambiguous titles are listed for manual review. Requests are paced and cached; key/quota/network errors stop the job. Cancel stops before the next title. A single library rescan runs after changed metadata is saved. Progress is held in server memory and resets on restart. Jobs are limited to 5,000 indexed titles.

Seventeen focused tests pass, including songs appearing during blocked tag probes, whole-library matching and provider quota handling. This does not verify the mount path or service permissions on your server; inspect the Music scan message for those errors.

## Mythic Reverie branding (0.3.0)

The application is now **Mythic Reverie**: movies, TV and music in one private library. The supplied fantasy-town character photo is used unchanged on sign-in; a moon/play emblem and wordmark use espresso, parchment, muted gold and burgundy. See [the brand reference](docs/MYTHIC-REVERIE-BRAND.md).

Upgrades migrate only the old default site name and original default coral colours. Customized names/themes remain, and the migration runs only once. Existing `cinema-data`, `IO_CINEMA_DATA_DIR`, authentication cookies, port 5922, libraries and OMDb keys are preserved. `MYTHIC_REVERIE_DATA_DIR` is an optional new alias; changing it points to a different data directory, so do not set it unless intentionally relocating the existing data. The GitHub repository URL remains unchanged so existing installations can update normally. Original I/O/Minami attribution remains.

Music album artwork now has an explicit Play control; album titles open and scroll to their track list. Selecting a song displays Now Playing immediately, with an opening-track message while the browser loads the source. Existing FLAC playback was observed on the running Cinema instance, with the playback clock advancing. This confirms that sample playback, not every library file or codec.

## Fullscreen music and karaoke lyrics (0.3.1)

On Music, choose **Fullscreen player** for the expanded listening room with artwork, seek, transport controls and volume. Browser fullscreen is requested when supported; otherwise the expanded view fills the page. Escape or Close returns to the library. **Karaoke lyrics** opens the synchronized lyrics panel, also available below Now Playing.

Put a matching UTF-8 `.lrc` sidecar beside each song: `Song.flac` and `Song.lrc`. UTF-16LE files with a BOM are also supported on the server. Plain LRC highlights timed lines; enhanced LRC `<mm:ss.xx>` markers highlight words. Multiple line timestamps and Unicode text are supported. Adjust **Sync (seconds)** from -30 to +30 if needed; positive values delay the displayed line. Alternatively open an LRC file in the browser; it stays in that browser session and is not uploaded. Click a lyric line to seek.

This is a sing-along view: it does not remove vocals or generate lyrics. Local lyrics work without a provider; version 0.3.2 adds optional LRCLIB lookups. Untimed plain text is not synchronized. LRC metadata tags are ignored; use the timing control for an offset. Lyrics files are capped at 512 KB/5,000 parsed lines. Lyrics requests require sign-in and stay within the selected music directory. Twenty-three focused tests pass. Browser/device fullscreen and live lyric synchronization still need real-device verification.

## Automatic fullscreen and synced lyrics (0.3.2)

Music now opens the fullscreen player when you click Play, including album-art Play and resume controls. **Fullscreen on play** is enabled by default and can be disabled; the preference stays in the browser for the selected account/profile. Native fullscreen depends on browser permission and an active user gesture. If unavailable, the expanded listening view is used. Auto-advancing does not force fullscreen back on after you exit it.

To find synchronized lyrics automatically, an administrator must enable **Automatic synced lyrics from LRCLIB** in **Music library settings** or **Settings → Media folders**. This opt-in sends track title, artist, album and duration to https://lrclib.net; audio files and filesystem paths are never sent. There is no API key requirement for anonymous lookups. Local `.lrc` files and session-opened LRC files take priority.

Lookups use LRCLIB's signature endpoint, validate the returned artist/title and recording duration, cache matches privately under `cinema-data/lyrics-cache`, pace requests, and honor Retry-After on provider throttling. Missing or untimed lyrics are reported, not guessed or given invented timestamps. Instrumental recordings and different live/remastered versions may not have matching synced lyrics. Word highlighting still requires word-timed enhanced LRC; provider line-timed LRC highlights lines. The timing control remains available for a manual correction. Lyrics open automatically when a timed match is found.

Provider documentation: https://lrclib.net/docs.txt

Twenty-eight focused tests pass, including matching, caching, retry cooldown, opt-in persistence and local lyrics. Fullscreen/device behavior and real provider matches for your collection still require live testing.

## Album-art ambience (0.3.3)

Now Playing and the fullscreen listening room have a flowing, album-inspired colour background. A tiny in-browser sample of same-origin album artwork selects three distinct colours; neutral, missing or unreadable covers use the Mythic Reverie palette. The full player adds a subtle floating/breathing artwork effect. The motion runs only during playback and freezes when paused.

Use the **Visual** selector to turn it off; that preference is saved in the browser for each account/profile. Device `prefers-reduced-motion` is respected automatically, leaving a static colour wash. The decorative layers are ignored by assistive technology and do not block controls or lyrics. Palette sampling is cached and stale artwork loads cannot recolour a newer track.

This is ambient visual motion, not a beat/frequency analyser. It does not request microphone access, create a Web Audio processing chain, change playback volume, or send artwork to an external service. Thirty focused tests pass, including colour extraction and safe fallback cases. Real-device animation and performance still need verification on your instance.

### Listening room (0.3.4)
Music has an album-led library and a cleaner fullscreen player. Choose Album colors, Earth (a stylized rotating orbital view), or Off in the Visual menu. Volume, lyric timing and local LRC files are in fullscreen player options. Visuals pause with playback and respect reduced motion; Earth is decorative, not a live satellite feed.

### Optional movie intro (0.3.5)
Place your browser-compatible H.264/AAC `movie-intro.mp4` in the server data folder (`cinema-data` by default, or your configured MYTHIC_REVERIE_DATA_DIR/IO_CINEMA_DATA_DIR). Restart after updating the source. The authenticated web player plays it before each movie, including resumed movies, with Skip intro; TV, live video and music are excluded. Missing/failed intros fall through to the movie. Movie resume position and watch progress exclude the intro. Native clients and remote casting do not run this web-only intro. The clip is supplied separately and is not included in the public repository. It does not calibrate or improve audio.

### Playback and library fixes (0.3.6)
Fixed movie intro routes hanging for signed-in users. Administrators can now upload an MP4 and test it under Settings → Movie intro; missing intros show a setup status. Keep using the separate supplied clip, not a public repository asset. Correct title match on a movie/TV title page searches OMDb again, replaces incorrect details after review, and optionally replaces the existing poster. Previous metadata and artwork are backed up beside the title. Music displays 60 albums per batch with full-library search and album/artist sorting, uses indexed track lookup, bounds the visible queue around the current track, and retains mini-player artwork between timer updates. Layout refinements cover narrow screens, touch controls, long titles and fullscreen options.

### Lyrics matching (0.3.7)
When automatic lyrics is enabled in Music library settings, exact LRCLIB lookup now falls back to structured and title search, with Unicode normalization, explicit parenthetical aliases and duration/version checks. Album mismatches no longer block a safe song/artist match. Both Japanese and Korean scripts are preserved. The player displays untimed text when only plain lyrics exist; those lyrics are not automatically scrolled or assigned invented timestamps. Find lyrics lets you search another spelling and explicitly choose a previewed match for the current browser session. Retry lookup bypasses negative results after a short cooldown. Old negative caches are invalidated, and failed lookups now expire after 15 minutes. Song changes use the current track duration rather than the previous recording. Not every track has lyrics in LRCLIB; local LRC files remain supported. Provider documentation: https://lrclib.net/docs.txt

### App experience redesign (0.4.0)
A unified Mythic Reverie layout for browsing, title pages, music, account forms and menus. Desktop screens use a library rail; tablets use a compact header; phones have Home, Movies, TV, Music and Search in the bottom bar. Additional discovery routes remain available in the profile menu at every screen size. Movie titles now participate in the home spotlight and have movie-specific detail labels. Shared spacing, typography, artwork grids, quieter cards, touch targets, keyboard focus, reduced-motion styles and safe-area positioning apply across the web app. Video playback retains the full screen. Navbar listeners are disposed on navigation to prevent detached menus accumulating. A separate standalone design preview uses sample titles and is not a screenshot of a running server. Visual/device validation could not be completed in the available browser environment. Native APK/iOS app interfaces are not changed by this web release.

### Music library and player (0.4.1)
Albums, Artists and Songs provide three searchable library views with bounded rendering. Album art opens an album detail view; separate play buttons start playback. Album pages include Play and Shuffle, while song menus offer Play Next and Add to Queue. Queue insertion preserves the current song and avoids duplicate entries. The mini-player artwork/title opens Now Playing. The page player is compact and the fullscreen artwork is scaled to the available window height, with a two-column lyrics view on larger screens and stacked controls on phones. Short desktop windows use a smaller artwork budget. Existing auto-fullscreen, lyrics matching, ambient/Earth options and media controls remain available. The layout is inspired by familiar music players and retains Mythic Reverie branding; it does not integrate with Apple Music. Device visual checks remain outstanding.

### 4K movie intro uploads (0.4.2)
Movie intro uploads now accept MP4 files up to 1 GB (1,024 MiB), including 4K. Uploads stream to a temporary file and atomically replace the saved intro only on success; failed or cancelled uploads retain the previous intro. Progress and cancellation controls are included. Video bytes are preserved without downscaling or transcoding. H.264 with AAC is recommended for browser compatibility; device decoding capability still determines 4K playback. If behind a reverse proxy, its body-size limit and request timeout must also allow the file. Earlier references to 80 MB describe the old limit. Movie-only playback and Skip intro remain unchanged.

### MKV movie intros (0.4.3)
Movie intro upload accepts MKV as well as MP4. MKV requires FFmpeg and FFprobe on the server and is converted to a browser-compatible MP4 before replacing the saved intro. Existing H.264 video is copied; other video codecs are encoded as H.264 without a scaling filter. Audio becomes AAC. Upload and conversion status are shown separately, and a cancelled or failed conversion leaves the previous intro intact. Conversion is limited to one job at a time, a 20-minute conversion timeout and a 2 GB output bound, with intermediates cleaned up. The 1 GB input limit remains. Original resolution is retained; a filename saying 4K does not change the underlying video's dimensions.
