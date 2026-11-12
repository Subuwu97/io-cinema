const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/js/ass-player.js'),'utf8');
test('legacy soft-mode requests cannot turn positioned karaoke fragments into DOM lyric lines',async()=>{
 const context=vm.createContext({window:{},fetch:async()=>({ok:true,json:async()=>({lyrics:[{start:0,end:2,text:'ko'},{start:0,end:2,text:'ro'}],fonts:[]})}),setTimeout,clearTimeout});vm.runInContext(source,context);
 const player=new context.window.IOAss({});await assert.rejects(player.load({showId:'show',encodedRelPath:'song.mkv',track:1,soft:true}),/does not support/);assert.equal(player.lyrics.length,0);
});
test('clearing a pending ASS load prevents stale subtitles from replacing the new selection',async()=>{
 let release;const context=vm.createContext({window:{},fetch:()=>new Promise(resolve=>{release=resolve;}),setTimeout,clearTimeout});vm.runInContext(source,context);const player=new context.window.IOAss({});const loading=player.load({showId:'show',encodedRelPath:'song.mkv',track:1});await new Promise(resolve=>setImmediate(resolve));await player.clear();release({ok:true,json:async()=>({lyrics:[{text:'old'}],fonts:[]})});assert.equal(await loading,false);assert.equal(player.lyrics.length,0);
});
