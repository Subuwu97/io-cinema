# Mythic Reverie for Google TV
Native Android/Google TV preview, application ID `com.mythicreverie.tv`. Built from the I/O TV client, adapted for Mythic Reverie. Separate installation and sign-in data; does not replace I/O TV.

Includes remote navigation, a large featured backdrop, horizontal title rows, Continue Watching, movie/TV filters, search, watchlist, title details, QR pairing, native Media3 playback, audio/subtitle selection and next-episode autoplay. Default server: `http://10.50.100.235:5922`, editable in setup/settings. Password sign-in requires HTTPS; use QR pairing for a local HTTP address. Requires the server's `/api/tv-native` endpoints.

This preview focuses on movies and TV. The web music interface and web movie pre-roll are not included. Netflix-inspired layout, no Netflix branding or integration. Built with debug signing for sideload testing; not Play Store distribution. Physical Google TV testing remains required.

Build: JDK 17+, Gradle 8.14.6, Android SDK 36.1. `gradle :app:assembleDebug`. Set `IO_ANDROID_DEBUG_KEYSTORE` to a local debug keystore if needed; do not commit signing keys.

Version 0.2.0-preview adds IPTV Live TV, channel search and group selection. Requires server 0.4.4. Configure the provider in the website Live TV page. See [IPTV notes](../../docs/IPTV.md) for supported formats and HDR limitations.

Version 0.3.0-preview / server 0.4.5 add original HDR playback for compatible HDR10/HLG and Dolby Vision profile 5/8 devices. Choose **Original** quality. See [HDR notes](../../docs/HDR.md). Hardware verification is still required.

Version 0.4.0-preview / server 0.4.6 add receiver sound modes and source codec/channel information. Auto/original also supports SDR sources; Android negotiates receiver output. [Audio notes](../../docs/AUDIO.md).
