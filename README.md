# I/O Cinema

A separate self-hosted movies and TV-show application based on [I/O](https://github.com/Subuwu97/io), originally based on Minami. This repository is independent of I/O.

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

This is version 0.1.0, an independent starting point, not a production certification. Automatic TMDB/TVDB matching is not implemented. Native I/O clients and launcher binaries are intentionally excluded because they connect to I/O and use its app identifiers. New Cinema clients can be built separately. Configure Cinema's own public URL and services; I/O's existing domain is unchanged.

## Attribution

Derived from Subuwu97/io commit 8ed9c7f, using its declared MIT license; I/O is based on Minami. Third-party vendor licenses remain alongside bundled assets. Artwork and trademarks retain their respective ownership.

## Validation in this checkout

The Cinema-specific scope/isolation checks and subtitle tests pass (7 tests), and all server/client JavaScript syntax checks pass. The server starts and scans the separate empty TV/movie roots. The full inherited suite is not verified in this restricted session: 37 tests pass and 46 fail because local HTTP connections are denied. A browser preview also times out. These connection-dependent checks need rerunning in a normal environment before deployment.

Player dependencies are generated from the pinned npm packages when `npm start` runs. Keep development dependencies installed for this build step. Cinema uses the I/O vector logo and generic SVG profile icons; anime-specific raster artwork is not included in this edition.
