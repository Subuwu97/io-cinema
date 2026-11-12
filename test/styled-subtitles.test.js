const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const ffm=require('../server/ffmpeg');

test('styled HLS retains separate top/bottom signs after a seek', {skip:!ffm.HAS_FFMPEG||!ffm.HAS_FFPROBE,timeout:30000},async()=>{
 const root=process.env.IO_TEST_ROOT||os.tmpdir();fs.mkdirSync(root,{recursive:true});const dir=fs.mkdtempSync(path.join(root,'io-styled-'));
 const file=path.join(dir,'source.mp4'),relative='styled-subs/'+'a'.repeat(64),folder=path.join(dir,relative),output=path.join(dir,'hls');fs.mkdirSync(folder,{recursive:true});fs.mkdirSync(output);
 const ass=['[Script Info]','ScriptType: v4.00+','PlayResX: 320','PlayResY: 180','[V4+ Styles]','Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding','Style: Default,Arial,20,&H00FFFFFF,&H0000FFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,5,5,5,1','[Events]','Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',String.raw`Dialogue: 0,0:00:00.70,0:00:01.20,Default,,0,0,0,,{\an7\pos(10,10)}UPPER SIGN`,String.raw`Dialogue: 0,0:00:00.70,0:00:01.20,Default,,0,0,0,,{\an1\pos(10,165)}LOWER LYRIC`].join(String.fromCharCode(10));
 fs.writeFileSync(path.join(folder,'track.ass'),ass);
 execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=black:s=320x180:r=24:d=2','-c:v','libx264',file],{timeout:10000,windowsHide:true});
 const proc=ffm.spawnHlsTranscode({filePath:file,outputDir:output,startOffsetSeconds:0.5,hwaccel:{type:'none'},subtitleFile:relative+'/track.ass',subtitleFonts:relative,subtitleCwd:dir,segmentSeconds:1});let error='';proc.stderr.on('data',chunk=>error+=chunk);
 const code=await new Promise((resolve,reject)=>{proc.on('error',reject);proc.on('close',resolve);});assert.equal(code,0,error);
 const frame=execFileSync('ffmpeg',['-v','error','-ss','0.25','-i',path.join(output,'playlist.m3u8'),'-frames:v','1','-f','rawvideo','-pix_fmt','gray','pipe:1'],{timeout:10000,windowsHide:true});
 assert.equal(frame.length,320*180);let top=0,bottom=0;for(let y=0;y<180;y++)for(let x=0;x<320;x++)if(frame[y*320+x]>180){if(y<70)top++;if(y>110)bottom++;}assert.ok(top>30,'upper sign must remain near the top');assert.ok(bottom>30,'lower lyric must remain near the bottom');
});
