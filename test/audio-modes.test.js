const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildAudioEncodeArgs}=require('../server/ffmpeg');
const {directDecision}=require('../server/hdr');
test('Original receiver playback is available for SDR as well as HDR without inventing Atmos',()=>{
 const info={videoStream:{color_transfer:'bt709'},videoCodec:'h264',containerExtension:'.mkv',defaultAudioIndex:1,audioStreams:[{index:1,codec:'truehd'}]};
 const caps={videoCodecs:['h264'],audioCodecs:['truehd']};
 assert.equal(directDecision(info,caps,{quality:'original',allowSdrOriginal:true}).direct,true);
 assert.equal(directDecision(info,{...caps,audioCodecs:['aac']},{quality:'original',allowSdrOriginal:true}).direct,false);
 assert.equal(directDecision(info,caps,{quality:'original',allowSdrOriginal:true,forceSdr:true}).direct,false);
});
test('Stereo and Night override stream copy while Auto leaves compatible audio untouched',()=>{
 assert.deepEqual(buildAudioEncodeArgs(true,8,'auto'),['-c:a','copy']);
 const stereo=buildAudioEncodeArgs(true,8,'stereo'),night=buildAudioEncodeArgs(true,8,'night');
 assert.equal(stereo[stereo.indexOf('-ac')+1],'2');assert.equal(stereo[stereo.indexOf('-c:a')+1],'aac');
 assert.match(night[night.indexOf('-af')+1],/^aformat=channel_layouts=stereo,acompressor=/);
});
test('Real Night mode encodes stereo AAC and reduces sustained loud signal level',t=>{
 const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 if(spawnSync('ffmpeg',['-version']).status!==0)return t.skip('FFmpeg unavailable');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mythic-audio-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const rms=[];
 for(const mode of ['stereo','night']){
  const file=path.join(dir,mode+'.m4a');
  const encode=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','aevalsrc=0.8*sin(2*PI*440*t)|0.8*sin(2*PI*440*t):s=48000:d=2',...buildAudioEncodeArgs(false,2,mode),file],{encoding:'utf8',timeout:30000,windowsHide:true});assert.equal(encode.status,0,encode.stderr);
  const probe=JSON.parse(spawnSync('ffprobe',['-v','quiet','-show_streams','-of','json',file],{encoding:'utf8'}).stdout).streams[0];assert.equal(probe.channels,2);assert.equal(probe.codec_name,'aac');
  const decoded=spawnSync('ffmpeg',['-v','error','-i',file,'-ss','0.5','-t','1','-f','f32le','pipe:1'],{maxBuffer:2*1024*1024});assert.equal(decoded.status,0);
  let sum=0;for(let i=0;i<decoded.stdout.length;i+=4)sum+=decoded.stdout.readFloatLE(i)**2;rms.push(Math.sqrt(sum/(decoded.stdout.length/4)));
 }
 assert.ok(rms[1]<rms[0]*0.75,`Night RMS ${rms[1]} should be quieter than stereo ${rms[0]}`);
});
