const fs=require('node:fs');
const path=require('node:path');
function registerMovieIntro(app,{requireAuth,requireAdmin,dataDir,publicOrigin=()=>''}){
 const file=path.join(dataDir,'movie-intro.mp4');
 app.get('/api/movie-intro',(req,res)=>{
  if(!requireAuth(req,res))return;
  res.set('Cache-Control','no-store').json({available:fs.existsSync(file)});
 });
 app.get('/api/movie-intro/media',(req,res)=>{
  if(!requireAuth(req,res))return;
  res.set('Cache-Control','private, no-cache');
  res.sendFile(file,err=>{if(err&&!res.headersSent)res.status(err.statusCode===404?404:500).end();});
 });
 if(requireAdmin)app.post('/api/movie-intro',(req,res,next)=>{
  if(!requireAdmin(req,res))return;
  if(req.headers.origin&&!new Set([`${req.protocol}://${req.get('host')}`,publicOrigin()]).has(req.headers.origin))return res.sendStatus(403);
  next();
 },require('express').raw({type:'video/mp4',limit:'80mb'}),async(req,res)=>{
  if(!Buffer.isBuffer(req.body)||req.body.length<12||req.body.toString('ascii',4,8)!=='ftyp')return res.status(400).json({error:'Choose an MP4 video (up to 80 MB).'});
  const temp=file+'.'+require('node:crypto').randomUUID()+'.tmp';
  try{await fs.promises.writeFile(temp,req.body,{flag:'wx'});await fs.promises.rename(temp,file);res.json({available:true});}
  catch{await fs.promises.unlink(temp).catch(()=>{});if(!res.headersSent)res.status(500).json({error:'Could not save the intro. Check server data folder permissions.'});}
 });
}
module.exports={registerMovieIntro};
