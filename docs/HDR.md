# HDR playback preview — server 0.4.5 / Google TV 0.3.0

Update the Node/npm server and Google TV APK together. In the player, select **Audio / Subtitles → Video quality → original**. New installations default to Original; existing explicit quality choices remain. A playback message identifies Original HDR or Converted SDR.

## Original playback

The TV reports its display HDR types, available decoders, supported Dolby Vision profiles, and decoder size limits. Original library files are served with authenticated byte ranges without video re-encoding or remuxing, preserving source HDR metadata. Resume and seeking use original timestamps. Audio/subtitle selection uses native embedded tracks. Profile/title access is checked on every request; device revocation denies further requests.

- HDR10 (PQ) and HLG require the matching display type and a compatible decoder. HEVC requires a reported Main 10 decoder.
- Dolby Vision profiles 5 and 8 require a Dolby Vision display and matching reported decoder profile. The original DV metadata remains intact. Actual container/profile/codec-level support still depends on the hardware.
- MKV, MP4/M4V and WebM are eligible containers. The selected audio codec must also be supported; there is no separate audio-only remux path yet. Unsupported audio can require SDR conversion even on an HDR display.
- Profile 7 dual-layer/FEL is not advertised as native DV support. Its HDR10 base can be tone-mapped to SDR; the enhancement layer is not reproduced.
- Media3 renders embedded text subtitles; complex ASS karaoke/effects may differ from server libass rendering.

## SDR fallback

Reduced quality, missing capability support or an original-stream decode/parse/audio failure selects HLS conversion. PQ/HLG sources use software FFmpeg zscale and floating-point tone mapping to BT.709, followed by 8-bit H.264 encoding. HDR side data is removed and output is tagged SDR. Subtitle burn-in happens after tone mapping. Cache keys distinguish converted HDR streams from old results. The shared HLS route also benefits browser HLS playback; this does not establish browser/Windows native HDR support or change every legacy non-HLS path.

DV profile 5 and other non-compatible base layers cannot use this SDR converter: the server returns an explicit unsupported-profile error instead of producing wrong colors. Profile 8 fallback uses its indicated HDR10, HLG or SDR-compatible base, not full Dolby Vision dynamic processing. FFmpeg needs zscale/libzimg and tonemap filters. Software 4K conversion can be slow; choose a reduced resolution if needed.

## Validation and limits

Automated checks cover HDR detection, capability decisions, profile rejection, authenticated original-file range delivery, resume position, profile restrictions and revocation. Real FFmpeg tests check synthetic PQ-to-SDR output and actual HLS segment encoding/tagging. Android compilation and lint are checked. No physical HDR display, actual Dolby Vision sample, HDMI chain, perceptual color accuracy or bitstream audio passthrough has been verified. This is a testable preview, not universal Dolby Vision certification.

References: [Android HDR architecture](https://source.android.com/docs/core/display/hdr), [Media3 format support](https://developer.android.com/media/media3/exoplayer/supported-formats), [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html).
