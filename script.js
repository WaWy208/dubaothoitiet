// ── Stars ──
(function(){
  const c=document.getElementById('stars');
  for(let i=0;i<100;i++){
    const s=document.createElement('div');
    s.className='star';
    const sz=Math.random()*2.5+.5;
    s.style.cssText=`width:${sz}px;height:${sz}px;top:${Math.random()*60}%;left:${Math.random()*100}%;--d:${(Math.random()*4+2).toFixed(1)}s;animation-delay:${(Math.random()*4).toFixed(1)}s`;
    c.appendChild(s);
  }
})();

// ── Clouds ──
(function(){
  const cl=document.getElementById('clouds');
  const clouds=[
    {w:200,h:40,top:'8%',opacity:.6,dur:90},
    {w:130,h:28,top:'15%',opacity:.4,dur:70},
    {w:280,h:50,top:'20%',opacity:.3,dur:120},
    {w:160,h:35,top:'5%',opacity:.5,dur:80},
  ];
  clouds.forEach(c=>{
    const d=document.createElement('div');
    d.className='cloud';
    d.style.cssText=`width:${c.w}px;height:${c.h}px;top:${c.top};left:-${c.w+50}px;opacity:${c.opacity};--cd:${c.dur}s;animation-delay:${Math.random()*-c.dur}s;`;
    cl.appendChild(d);
    // pseudo blobs
    const b=document.createElement('div');
    b.style.cssText=`position:absolute;top:-${c.h*.4}px;left:${c.w*.2}px;width:${c.h*1.5}px;height:${c.h*1.5}px;border-radius:50%;background:rgba(255,255,255,0.09);filter:blur(1px)`;
    d.appendChild(b);
    const b2=document.createElement('div');
    b2.style.cssText=`position:absolute;top:-${c.h*.6}px;left:${c.w*.5}px;width:${c.h*1.2}px;height:${c.h*1.2}px;border-radius:50%;background:rgba(255,255,255,0.08);filter:blur(1px)`;
    d.appendChild(b2);
  });
})();

// ── Hourly Data ──
const hours=[
  {t:'Bây giờ',icon:'🌦️',temp:32,rain:70,desc:'Mưa nhẹ'},
  {t:'09:00',icon:'☁',temp:33,rain:40,desc:'Có mây'},
  {t:'10:00',icon:'🌤️',temp:34,rain:20,desc:'Nhiều nắng'},
  {t:'11:00',icon:'☀️',temp:35,rain:10,desc:'Nắng đẹp'},
  {t:'12:00',icon:'☀️',temp:36,rain:10,desc:'Nắng'},
  {t:'13:00',icon:'🌤️',temp:36,rain:25,desc:'Ít mây'},
  {t:'14:00',icon:'☁',temp:35,rain:45,desc:'Có mây'},
  {t:'15:00',icon:'🌦️',temp:34,rain:65,desc:'Mưa rào'},
  {t:'16:00',icon:'🌧️',temp:32,rain:80,desc:'Mưa'},
  {t:'17:00',icon:'⛈️',temp:30,rain:85,desc:'Dông'},
  {t:'18:00',icon:'🌦️',temp:29,rain:55,desc:'Mưa nhẹ'},
  {t:'19:00',icon:'🌙',temp:28,rain:30,desc:'Giảm mây'},
  {t:'20:00',icon:'🌙',temp:27,rain:20,desc:'Quang đãng'},
];
const track=document.getElementById('hourlyTrack');
hours.forEach((h,i)=>{
  const d=document.createElement('div');
  d.className='hour-card'+(i===0?' active':'');
  d.innerHTML=`<div class="hour-time">${h.t}</div>
    <span class="hour-icon">${h.icon}</span>
    <div class="hour-temp">${h.temp}°</div>
    <div class="hour-rain">💧${h.rain}%</div>
    <div class="rain-bar"><div class="rain-fill" style="width:${h.rain}%"></div></div>`;
  d.style.animationDelay=(i*.05)+'s';
  track.appendChild(d);
});

// ── 7-Day Forecast ──
const days=[
  {d:'Hôm nay',icon:'🌦️',desc:'Mưa rào',hi:33,lo:26,rain:70},
  {d:'Thứ Bảy',icon:'☁',desc:'Có mây',hi:34,lo:27,rain:35},
  {d:'Chủ nhật',icon:'🌤️',desc:'Nắng nhẹ',hi:35,lo:27,rain:20},
  {d:'Thứ Hai',icon:'☀️',desc:'Nắng đẹp',hi:36,lo:28,rain:10},
  {d:'Thứ Ba',icon:'🌤️',desc:'Ít mây',hi:35,lo:27,rain:15},
  {d:'Thứ Tư',icon:'⛈️',desc:'Dông mạnh',hi:31,lo:25,rain:90},
  {d:'Thứ Năm',icon:'🌧️',desc:'Mưa to',hi:30,lo:25,rain:85},
];
const minT=25,maxT=36,range=maxT-minT;
const fl=document.getElementById('forecastList');
days.forEach((d,i)=>{
  const leftPct=((d.lo-minT)/range*100).toFixed(0);
  const widPct=(((d.hi-d.lo)/range)*100).toFixed(0);
  const el=document.createElement('div');
  el.className='forecast-card';
  el.style.animationDelay=(i*.07)+'s';
  el.innerHTML=`<div class="fc-day">${d.d}</div>
    <div class="fc-icon">${d.icon}</div>
    <div class="fc-desc">${d.desc}</div>
    <div class="fc-rain">💧${d.rain}%</div>
    <div class="fc-bar-wrap" style="flex:1.2">
      <div class="fc-bar" style="left:${leftPct}%;width:${widPct}%"></div>
    </div>
    <div class="fc-temps"><span class="fc-hi">${d.hi}°</span><span class="fc-lo">${d.lo}°</span></div>`;
  fl.appendChild(el);
});

// ── 3D card tilt ──
document.querySelectorAll('.tilt').forEach(el=>{
  el.addEventListener('mousemove',e=>{
    const r=el.getBoundingClientRect();
    const x=(e.clientX-r.left)/r.width-.5;
    const y=(e.clientY-r.top)/r.height-.5;
    el.style.transform=`perspective(400px) rotateY(${x*12}deg) rotateX(${-y*12}deg) translateZ(4px)`;
  });
  el.addEventListener('mouseleave',()=>{el.style.transform='';});
});

// ── Sky theme based on hour ──
const h=new Date().getHours();
if(h>=6&&h<18){
  document.querySelector('.orb').style.background='radial-gradient(circle at 38% 35%,#fff9c4 0%,#fde68a 40%,#f59e0b 80%,#b45309 100%)';
}else{
  document.querySelector('.orb').style.background='radial-gradient(circle at 38% 35%,#e2e8f0 0%,#94a3b8 40%,#475569 80%,#1e293b 100%)';
  document.querySelector('.orb').style.boxShadow='0 0 40px 15px rgba(148,163,184,0.2),0 0 80px 30px rgba(148,163,184,0.08)';
}

// ── Animate icon ──
const icons=['🌦️','☁','🌤️','🌦️','🌧️'];
let ii=0;
setInterval(()=>{
  ii=(ii+1)%icons.length;
  // Subtle icon cycle for live feel
},8000);
