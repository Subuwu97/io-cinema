const {test}=require('node:test'),assert=require('node:assert/strict');
const {describe,directDecision,toneMapFilter}=require('../server/hdr');
const info={videoStream:{color_transfer:'smpte2084'},videoCodec:'hevc',containerExtension:'.mkv',audioStreams:[{index:1,codec:'aac'}],defaultAudioIndex:1};
const caps={hdr10:true,hlg:true,dolbyVision:true,dvProfiles:[5,8],videoCodecs:['hevc'],audioCodecs:['aac']};
const dv=(profile,compatibility)=>({...info,videoStream:{...info.videoStream,side_data_list:[{side_data_type:'DOVI configuration record',dv_profile:profile,dv_bl_signal_compatibility_id:compatibility}]}});
test('HDR detection distinguishes SDR, PQ, HLG and DV base compatibility',()=>{
 assert.equal(describe(null).format,'SDR');assert.equal(describe(info.videoStream).format,'HDR10');assert.equal(describe({color_transfer:'arib-std-b67'}).format,'HLG');
 assert.equal(describe(dv(5,0).videoStream).base,null);assert.equal(describe(dv(8,1).videoStream).base,'pq');assert.equal(describe(dv(8,4).videoStream).base,'hlg');assert.equal(describe(dv(7,6).videoStream).base,'pq');
});
test('Original HDR requires matching display, decoder, container and audio; explicit SDR/quality override works',()=>{
 const opts={quality:'original'};assert.equal(directDecision(info,caps,opts).direct,true);
 for(const c of [null,{}, {...caps,hdr10:false},{...caps,videoCodecs:[]},{...caps,audioCodecs:[]}])assert.equal(directDecision(info,c,opts).direct,false);
 assert.equal(directDecision(info,caps,{quality:'720'}).direct,false);assert.equal(directDecision(info,caps,{...opts,forceSdr:true}).direct,false);
 assert.equal(directDecision({...info,containerExtension:'.avi'},caps,opts).direct,false);
});
test('DV profile 5 and 8 require advertised matching DV decoder, profile 7 is not claimed',()=>{
 for(const p of [5,8])assert.equal(directDecision(dv(p,p===8?1:0),caps,{quality:'original'}).direct,true);
 assert.equal(directDecision(dv(7,6),caps,{quality:'original'}).direct,false);
 assert.equal(directDecision(dv(5,0),{...caps,dvProfiles:[8]},{quality:'original'}).direct,false);
 assert.equal(directDecision(dv(8,1),{...caps,dolbyVision:false},{quality:'original'}).direct,false);
 assert.throws(()=>toneMapFilter(describe(dv(5,0).videoStream),720),/no supported HDR base layer/);
});
test('SDR filters operate in linear light, map gamut and strip HDR side data',()=>{
 const filter=toneMapFilter(describe(info.videoStream),720);assert.match(filter,/t=linear/);assert.match(filter,/tonemap=tonemap=mobius/);assert.match(filter,/t=bt709:m=bt709:r=tv/);assert.match(filter,/scale=-2:720/);assert.match(filter,/sidedata=mode=delete/);
});
test('Real FFmpeg tone map creates tagged SDR output from a synthetic PQ source',async t=>{
 const {spawnSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 if(spawnSync('ffmpeg',['-version']).status!==0)return t.skip('FFmpeg unavailable');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mythic-hdr-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'sdr.mp4');
 const r=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=128x72:rate=1','-t','1','-vf','format=yuv420p10le,setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc,'+toneMapFilter(describe(info.videoStream),null),'-c:v','libx264','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',file],{encoding:'utf8',timeout:30000,windowsHide:true});
 assert.equal(r.status,0,r.stderr);const probe=JSON.parse(spawnSync('ffprobe',['-v','quiet','-show_streams','-of','json',file],{encoding:'utf8'}).stdout).streams[0];assert.equal(probe.color_transfer,'bt709');assert.equal(probe.pix_fmt,'yuv420p');
});
test('HLS encoder applies SDR mapping even when hardware decode is requested',async t=>{
 const {spawnSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 if(spawnSync('ffmpeg',['-version']).status!==0)return t.skip('FFmpeg unavailable');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mythic-hls-hdr-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const input=path.join(dir,'pq.mkv');
 const made=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=128x72:rate=2','-t','1','-pix_fmt','yuv420p10le','-c:v','ffv1','-color_primaries','bt2020','-color_trc','smpte2084','-colorspace','bt2020nc',input],{encoding:'utf8',timeout:30000,windowsHide:true});assert.equal(made.status,0,made.stderr);
 const proc=require('../server/ffmpeg').spawnHlsTranscode({filePath:input,outputDir:dir,reencodeVideo:true,hwaccel:{type:'qsv'},decodeHwaccel:true,toneMap:describe(info.videoStream)});
 let error='';proc.stderr.on('data',b=>error+=b);const timer=setTimeout(()=>proc.kill(),30000);
 const code=await new Promise((resolve,reject)=>{proc.on('close',resolve);proc.on('error',reject);}).finally(()=>clearTimeout(timer));assert.equal(code,0,error);
 const probe=JSON.parse(spawnSync('ffprobe',['-v','quiet','-show_streams','-of','json',path.join(dir,'seg00000.ts')],{encoding:'utf8'}).stdout).streams[0];assert.equal(probe.color_transfer,'bt709');assert.equal(probe.codec_name,'h264');assert.equal(probe.pix_fmt,'yuv420p');
});
