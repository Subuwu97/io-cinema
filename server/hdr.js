function describe(video = {}) {
  video = video || {};
  const dovi = (video.side_data_list || []).find(s => /DOVI configuration/i.test(s.side_data_type || ''));
  const transfer = video.color_transfer;
  const profile = dovi ? Number(dovi.dv_profile) : null;
  const compatibility = dovi ? Number(dovi.dv_bl_signal_compatibility_id) : null;
  const base = dovi ? (compatibility === 1 || profile === 7 ? 'pq' : compatibility === 4 ? 'hlg' : compatibility === 2 ? 'sdr' : null) : transfer === 'smpte2084' ? 'pq' : transfer === 'arib-std-b67' ? 'hlg' : 'sdr';
  return {format: dovi ? 'Dolby Vision' : base === 'pq' ? 'HDR10' : base === 'hlg' ? 'HLG' : 'SDR', profile, compatibility, base, hdr: !!dovi || base !== 'sdr'};
}
function directDecision(info, caps = {}, options = {}) {
  caps = caps && typeof caps === 'object' ? caps : {};
  const hdr = describe(info.videoStream);
  const container = info.containerExtension;
  if ((!hdr.hdr && !options.allowSdrOriginal) || options.forceSdr || options.quality !== 'original') return {direct: false, hdr};
  if (!['.mkv', '.mp4', '.m4v', '.webm'].includes(container)) return {direct: false, hdr};
  const codec = info.videoCodec;
  const audio = (info.audioStreams || []).find(t => t.index === (options.audio ?? info.defaultAudioIndex));
  if (audio && !Array.isArray(caps.audioCodecs) || audio && !caps.audioCodecs.includes(audio.codec)) return {direct: false, hdr};
  const decodes = Array.isArray(caps.videoCodecs) && caps.videoCodecs.includes(codec);
  if (!decodes) return {direct: false, hdr};
  if (!hdr.hdr) return {direct: true, hdr};
  if (hdr.format === 'Dolby Vision') {
    // Do not claim dual-layer Profile 7/FEL support from a generic DV decoder.
    const supported = [5,8].includes(hdr.profile) && caps.dolbyVision === true && Array.isArray(caps.dvProfiles) && caps.dvProfiles.includes(hdr.profile);
    return {direct: supported, hdr};
  }
  return {direct: hdr.base === 'pq' ? caps.hdr10 === true : caps.hlg === true, hdr};
}
function toneMapFilter(hdr, height) {
  if (!['pq','hlg'].includes(hdr.base)) throw Error('This Dolby Vision profile has no supported HDR base layer. Use a compatible Dolby Vision device or an SDR/HDR10 edition.');
  const transfer = hdr.base === 'pq' ? 'smpte2084' : 'arib-std-b67';
  return [`zscale=pin=bt2020:p=bt2020:tin=${transfer}:min=bt2020nc:t=linear:npl=100`, 'format=gbrpf32le', 'zscale=p=bt709', 'tonemap=tonemap=mobius:desat=2', 'zscale=t=bt709:m=bt709:r=tv', height ? `scale=-2:${height}` : null, 'format=yuv420p', 'sidedata=mode=delete'].filter(Boolean).join(',');
}
module.exports = {describe, directDecision, toneMapFilter};
