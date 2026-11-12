const {randomBytes,createHash}=require('node:crypto');
const digest=value=>createHash('sha256').update(value).digest('hex');
function registerCasting(app,{requireAuth,getAccountFromRequest,profiles,getLibrary,startHls,publicOrigin,now=Date.now}){
 const grants=new Map();
 function permitted(account,profile,show){return account&&account.approved!==false&&profile&&show&&!((profile.isKids||account.adultContentAllowed===false)&&/(rx|hentai|x-rated)/i.test(show.rating||''));}
 app.post('/api/cast/start',async(req,res)=>{
  const origin=req.headers.origin;
  if(origin&&!new Set([`${req.protocol}://${req.get('host')}`,publicOrigin()]).has(origin))return res.sendStatus(403);
  const account=requireAuth(req,res);if(!account)return;
  const {showId,episode,audio,subtitle,quality,position=0}=req.body||{};
  const profile=profiles.getActiveProfile(account.id),show=getLibrary().getShow(showId);
  if(!permitted(account,profile,show))return res.sendStatus(403);
  if(!Number.isFinite(position)||position<0||position>7*86400||typeof episode!=='string'||episode.length>4096||[audio,subtitle].some(v=>v!=null&&(!Number.isInteger(v)||v<0))||!['original','720','1080','480','360','240',undefined].includes(quality))return res.sendStatus(400);
  for(const[k,g]of grants)if(g.expires<=now())grants.delete(k);
  if(grants.size>=1000)return res.sendStatus(503);
  try{
   const result=await startHls(showId,episode,{audio,subtitle,quality:quality||'720',startOffsetSeconds:position});
   if(result.error)return res.status(result.error.status).json({error:result.error.message});
   const token=randomBytes(32).toString('hex');
   grants.set(digest(token),{key:result.cacheKey,showId,profileId:profile.id,cookie:req.headers.cookie||'',expires:now()+12*3600000});
   res.set('Cache-Control','no-store').json({playlistUrl:`/api/hls/${result.cacheKey}/playlist.m3u8?castToken=${token}`,contentType:'application/vnd.apple.mpegurl',startOffsetSeconds:position,subtitleBurnedIn:subtitle!=null});
  }catch(e){res.status(400).json({error:'Unable to prepare casting stream'});}
 });
 function mediaAccount(req,res){
  const token=req.query?.castToken;if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;
  const route=req.path.match(/^\/api\/hls\/([a-f0-9]{32})\/(playlist\.m3u8|seg\d{5}\.ts)$/);
  const grant=grants.get(digest(token));if(!route||!grant||grant.expires<=now()||grant.key!==route[1])return null;
  const account=getAccountFromRequest({headers:{cookie:grant.cookie}}),profile=account&&profiles.getActiveProfile(account.id);
  if(profile?.id!==grant.profileId||!permitted(account,profile,getLibrary().getShow(grant.showId)))return null;
  res.set('Access-Control-Allow-Origin','*');res.set('Access-Control-Expose-Headers','Content-Length,Content-Range,Accept-Ranges');
  req.castToken=token;return account;
 }
 function playlist(text,token){return text.split('\n').map(line=>/^seg\d{5}\.ts\r?$/.test(line)?`${line.trim()}?castToken=${token}`:line).join('\n');}
 return {mediaAccount,playlist};
}
module.exports={registerCasting};
