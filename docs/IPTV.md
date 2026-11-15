# IPTV preview (server 0.4.4 / Google TV 0.2.0)

Open **Live TV → Manage IPTV provider** as an administrator. Import an extended M3U URL/file or enter your Xtream Codes provider base address, username and password. Xtream uses the provider's `get.php` M3U export with HLS output. One provider is supported; importing replaces the list only after a successful parse. Refresh saved provider updates it manually. Credentials, source and channel URLs are stored in encrypted private settings, never in Git.

The web channel browser provides search, groups, pagination and up to 100 favorites per account/profile/browser. Google TV has a Live TV tab with search, group selection and paginated channels. Install the new server and APK together. No provider subscription is bundled.

Streams play directly from the provider; authorized viewers receive the selected stream URL, which can contain provider credentials. Mythic device tokens are never sent to providers. Use trusted providers/accounts. Browser playback requires HLS and provider CORS support. HTTPS pages cannot play HTTP providers; Google TV is preferable for those. Proprietary/DRM/provider-header formats are not supported. No stream conversion or reconnect loop is supplied. Kids/restricted profiles cannot access unrated IPTV. Existing local-library TV channels and their synthetic guide remain separate.

Not yet included: XMLTV programme guide import, automatic refresh, catch-up, DVR, synchronized favorites or multiple providers. Imports are bounded to 8 MB / 20,000 channels; channel lists are paginated in batches of 100. Import errors retain the previous channels and avoid exposing credentials.

## HDR status

Server 0.4.5 and Google TV 0.3.0 add capability-checked original HDR playback and HLS SDR tone mapping. See [HDR playback](HDR.md) for profile limits and testing status. Direct IPTV HDR still depends on the provider stream and device.
