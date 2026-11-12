// Deliberately retain internal I/O video identifiers for player compatibility.
// Non-video readers and anime-only metadata integrations are unavailable here.
function registerCinema(app){
 app.use((req,res,next)=>{
  const p=req.path;
  if(p==='/api/manga'&&req.method==='GET')return res.json([]);
  if(/^\/api\/(manga(?:\/|$)|reader(?:\/|$)|novels?(?:\/|$)|trackers?(?:\/|$)|mal(?:\/|$)|anilist(?:\/|$)|metadata(?:\/|$))/.test(p))return res.status(404).json({error:'This feature is not part of I/O Cinema'});
  if(/^\/api\/anime\/[^/]+\/(import[^/]*|cast|episode-titles|related)(\/|$)/.test(p)||p==='/api/admin/retry-enrichment')return res.status(404).json({error:'Anime metadata is disabled in I/O Cinema'});
  next();
 });
}
module.exports={registerCinema};
