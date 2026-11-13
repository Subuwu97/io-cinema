const fs=require('node:fs');
const path=require('node:path');
function registerMovieIntro(app,{requireAuth,dataDir}){
 const file=path.join(dataDir,'movie-intro.mp4');
 app.get('/api/movie-intro',requireAuth,(_req,res)=>res.json({available:fs.existsSync(file)}));
 app.get('/api/movie-intro/media',requireAuth,(_req,res)=>{
  res.set('Cache-Control','private, no-cache');
  res.sendFile(file,err=>{if(err&&!res.headersSent)res.status(err.statusCode===404?404:500).end();});
 });
}
module.exports={registerMovieIntro};
