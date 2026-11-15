# Receiver sound controls — server 0.4.6 / Google TV 0.4.0-preview

Update both server and APK. Open **Settings → Sound / AV receiver**, or **Audio / Subtitles → Sound / receiver** during a library video.

- **Auto / original surround:** choose Original video quality. The original file and soundtrack are delivered when both video and selected audio are supported. Applies to SDR and HDR sources. Android/Media3 negotiates decoding or encoded output. No fake surround or Atmos encoding is performed.
- **Stereo compatibility:** server converts to two-channel AAC at 256 kbps.
- **Night mode:** server downmixes to stereo, compresses loud passages and limits peaks, then encodes AAC at 256 kbps. This is not THX processing or an improvement in source fidelity.

Track labels include source codec, channel count and codec profile when available. Sound information distinguishes original soundtrack delivery from AAC conversion. The app does not claim to measure the receiver's current output format. Check the receiver display to confirm Atmos. MediaCodec decoder support is checked, with Android direct-output checks on Android 10+ for AC3, EAC3/JOC, TrueHD and DTS families. Actual device/HDMI support may differ from advertised capabilities; decode failures use the existing compatibility fallback.

Dolby Atmos requires an Atmos soundtrack and a compatible output chain. Original delivery preserves its encoded information; this does not guarantee the TV will pass it through. HDMI/eARC and digital-audio output settings are controlled on the TV/receiver, not by this app. No THX SDK, certification, proprietary spatial processor, EQ or calibration is included.

Stereo/Night modes do not preserve Atmos. They use the shared HLS conversion pipeline and can require HDR-to-SDR conversion; incompatible Dolby Vision profiles may refuse conversion. No audio-only remux retaining HDR is implemented. These sound modes apply to library videos, not IPTV or music. Profile-specific language choice remains separate; sound-mode preference is stored per app installation.

Validation: server routing/profile tests, original SDR eligibility, mode validation, real AAC output and measured sustained-level reduction in Night mode; Android build/lint checks. No receiver, HDMI ARC/eARC or real Atmos sample has been physically tested.

References: [Android direct playback](https://developer.android.com/reference/android/media/AudioTrack#isDirectPlaybackSupported(android.media.AudioFormat,%20android.media.AudioAttributes)), [Media3 audio output](https://developer.android.com/reference/androidx/media3/exoplayer/audio/DefaultAudioSink), [THX FAQ](https://www.thx.com/faq/).
