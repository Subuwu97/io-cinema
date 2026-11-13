(function(root){
 function eligible(showId,movies,live){return !live&&Array.isArray(movies)&&movies.some(movie=>movie.id===showId);}
 async function play(container,movie){
  const initialHash=location.hash,controller=new AbortController();let departed=false;
  const leave=()=>{departed=true;controller.abort();};
  window.addEventListener('hashchange',leave,{once:true});
  const timeout=setTimeout(()=>controller.abort(),3000);
  let available=false;
  try{const response=await fetch('/api/movie-intro',{credentials:'same-origin',signal:controller.signal});if(response.ok)available=(await response.json()).available===true;}catch{}finally{clearTimeout(timeout);window.removeEventListener('hashchange',leave);}
  if(departed||location.hash!==initialHash||!container.isConnected)return false;
  if(!available)return true;
  return new Promise(resolve=>{
   const overlay=document.createElement('div');overlay.className='movie-intro';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','Movie intro');
   overlay.innerHTML='<video playsinline controls aria-label="Movie intro video"></video><div class="movie-intro-actions"><button type="button" data-start hidden>Play intro</button><button type="button" data-skip>Skip intro</button></div>';
   const clip=overlay.querySelector('video'),skip=overlay.querySelector('[data-skip]'),start=overlay.querySelector('[data-start]');let done=false,stallTimer;
   const oldFocus=document.activeElement;
   const finish=continueMovie=>{if(done)return;done=true;clearTimeout(stallTimer);clearTimeout(maxTimer);window.removeEventListener('hashchange',cancel);window.removeEventListener('keydown',keys,true);clip.pause();clip.removeAttribute('src');clip.load();overlay.remove();if(container.isConnected&&oldFocus?.isConnected)oldFocus.focus();resolve(continueMovie&&location.hash===initialHash&&container.isConnected);};
   const cancel=()=>finish(false);
   const keys=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(true);return;}if(!overlay.contains(e.target)){e.stopImmediatePropagation();if(e.key==='Tab'){e.preventDefault();skip.focus();}}else if(e.key==='Tab'){const controls=[clip,...overlay.querySelectorAll('button:not([hidden])')];const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
   const stalled=()=>{clearTimeout(stallTimer);stallTimer=setTimeout(()=>finish(true),15000);};
   const maxTimer=setTimeout(()=>finish(true),120000);
   window.addEventListener('hashchange',cancel,{once:true});window.addEventListener('keydown',keys,true);
   clip.onended=()=>finish(true);clip.onerror=()=>finish(true);clip.onwaiting=stalled;clip.onstalled=stalled;clip.onplaying=()=>{clearTimeout(stallTimer);start.hidden=true;};
   skip.onclick=()=>finish(true);start.onclick=()=>clip.play().catch(()=>{start.hidden=false;});
   clip.volume=movie.volume;clip.muted=movie.muted;clip.src='/api/movie-intro/media';container.append(overlay);skip.focus();stalled();
   clip.play().catch(()=>{clearTimeout(stallTimer);start.hidden=false;start.focus();});
  });
 }
 const api={eligible,play};if(typeof module==='object'&&module.exports)module.exports=api;else root.MovieIntro=api;
})(typeof window==='undefined'?globalThis:window);
