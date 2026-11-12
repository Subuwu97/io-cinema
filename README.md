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

This is version 0.3.0, an independent starting point, not a production certification. Automatic TMDB/TVDB matching is not implemented. Native I/O clients and launcher binaries are intentionally excluded because they connect to I/O and use its app identifiers. New Cinema clients can be built separately. Configure Cinema's own public URL and services; I/O's existing domain is unchanged.

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
