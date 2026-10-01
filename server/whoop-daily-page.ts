import { todayHub, lifestylePanels } from "./lifestyle-preview-panel";
import { workoutPanel } from "./workout-preview-panel";
export type DailyReading = {
  day: string;
  recovery: number | null;
  sleepMinutes: number | null;
  hrv: number | null;
};
const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function dailyInterpretation(
  readings: DailyReading[],
  currentDay: string,
) {
  const sorted = [...readings].sort((a, b) => b.day.localeCompare(a.day));
  const latest = sorted[0];
  const prior = sorted.slice(1, 7).filter((r) => r.hrv !== null);
  const average = prior.length
    ? prior.reduce((sum, r) => sum + r.hrv!, 0) / prior.length
    : null;
  const current =
    !!latest && latest.day === currentDay && latest.recovery !== null;
  const recent = sorted.slice(0, 4);
  const declining =
    recent.length === 4 &&
    recent.every(
      (r, i) =>
        r.recovery !== null &&
        (i === 0 || r.recovery! > recent[i - 1].recovery!),
    );
  return {
    latest,
    sorted,
    average,
    priorCount: prior.length,
    current,
    lower: current && latest.recovery! < 34,
    declining,
  };
}
export function renderWhoopDaily(
  readings: DailyReading[],
  nonce: string,
  currentDay: string,
) {
  const model = dailyInterpretation(readings, currentDay);
  const latest = model.latest;
  const time = (minutes: number | null | undefined) =>
    minutes == null
      ? "—"
      : `${Math.floor(minutes / 60)}h ${String(Math.round(minutes % 60)).padStart(2, "0")}m`;
  const score = latest?.recovery ?? null;
  const band =
    score === null
      ? "Unavailable"
      : score < 34
        ? "Low recovery"
        : score < 67
          ? "Moderate recovery"
          : "Higher recovery";
  const date = latest
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(latest.day + "T12:00:00Z"))
    : "No readings";
  const trend = model.sorted
    .slice(0, 4)
    .reverse()
    .map((r) => (r.recovery === null ? "—" : `${r.recovery}%`))
    .join(" → ");
  const averageText =
    model.average === null
      ? "More history is needed to compare HRV."
      : `Previous ${model.priorCount} displayed days averaged ${model.average.toFixed(1)} ms. This short window is context, not your established personal baseline.`;
  const exercises = [
    [
      "01",
      "Goblet squat or leg press",
      "3 × 8",
      "Controlled reps. Choose a familiar movement.",
      "2 × 8",
    ],
    [
      "02",
      "Dumbbell bench or chest press",
      "3 × 8–10",
      "A comfortable range of motion, with no grinding reps.",
      "2 × 8",
    ],
    [
      "03",
      "Seated cable row",
      "3 × 10",
      "Smooth pull, steady return. Keep your torso still.",
      "2 × 10",
    ],
    [
      "04",
      "Romanian deadlift",
      "2 × 8",
      "Only if familiar and comfortable; otherwise omit it.",
      "1 × 8",
    ],
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Strive · Your day</title><style>
  :root{color-scheme:dark;--bg:#10191b;--panel:#1a2729;--line:#314345;--ink:#eff6f2;--muted:#b4c4bf;--mint:#c1ecd7;--amber:#edce8a}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}button,input,select{font:inherit}button,a,select,input{touch-action:manipulation}button{cursor:pointer}button:focus-visible,a:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid var(--mint);outline-offset:4px}a{color:var(--mint)}.shell{max-width:1120px;margin:auto;padding:30px 28px 60px}.brand{font-weight:800;letter-spacing:.17em;font-size:20px}.top{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:30px}.status{font-size:12px;color:var(--mint);border:1px solid var(--line);border-radius:24px;padding:7px 11px}.dot{display:inline-block;width:6px;height:6px;background:var(--mint);border-radius:50%;margin-right:7px}.nav{display:flex;gap:8px;padding-bottom:24px;border-bottom:1px solid var(--line);margin-bottom:28px}.nav button{border:0;background:transparent;padding:9px 18px;color:var(--muted);border-radius:22px}.nav button[aria-selected=true]{background:var(--mint);color:#12241c;font-weight:700}h1,h2,h3,p{margin:0}h1{font-size:clamp(32px,5vw,46px);line-height:1.15;letter-spacing:-.04em;font-weight:600}h2{font-size:23px;line-height:1.3;letter-spacing:-.02em;font-weight:600}h3{font-size:17px;font-weight:650}.eyebrow{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:650;margin-bottom:12px}.muted{color:var(--muted)}.small{font-size:13px}.intro{margin-bottom:26px}.intro p:last-child{margin-top:10px}.grid{display:grid;grid-template-columns:1.35fr 1fr;gap:20px}.card{background:var(--panel);border:1px solid var(--line);border-radius:22px;padding:25px;margin-bottom:20px}.hero{background:linear-gradient(130deg,#254239,#1a2929);border-color:#416352}.badge{display:inline-block;font-size:12px;border:1px solid #617662;color:var(--mint);border-radius:20px;padding:5px 10px;margin-bottom:18px}.hero h2{font-size:32px;max-width:440px;margin-bottom:12px}.hero p{max-width:540px}.facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:22px 0}.fact{padding:13px 9px;border-top:1px solid var(--line)}.value{display:block;font-size:25px;letter-spacing:-.05em;font-weight:650}.fact .small{font-size:12px;color:var(--muted)}.score{color:var(--amber)}.button{border:1px solid transparent;border-radius:12px;background:var(--mint);color:#13251d;padding:12px 17px;font-weight:650;min-height:46px;display:inline-block;text-decoration:none}.secondary{background:transparent;color:var(--ink);border-color:var(--line)}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:21px}.reason{padding:16px 0;border-bottom:1px solid var(--line)}.reason:last-child{border-bottom:0;padding-bottom:0}.reason p{font-size:14px;color:var(--muted);margin-top:6px}.checkin{display:flex;justify-content:space-between;gap:12px;padding:13px 0;border-bottom:1px solid var(--line)}.checkin:last-child{border:0}.timeline{margin-top:15px}.event{display:grid;grid-template-columns:62px 1fr;gap:14px;padding:16px 0;border-bottom:1px solid var(--line)}.event:last-child{border:0}.event time{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--mint);padding-top:4px}.event p{font-size:14px;color:var(--muted);margin-top:5px}.notice{font-size:13px;color:var(--muted);padding:15px 0}.workout-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.duration{font-size:28px;font-weight:600;white-space:nowrap;color:var(--mint)}.workout-list{margin-top:20px}.exercise{display:grid;grid-template-columns:30px 1fr auto;gap:12px;padding:18px 0;border-top:1px solid var(--line)}.exercise .num{font-size:12px;color:var(--muted);padding-top:4px}.exercise p{font-size:13px;color:var(--muted);margin-top:6px}.sets{font-size:15px;font-weight:650;color:var(--mint);white-space:nowrap}.block{padding:17px 0;border-top:1px solid var(--line)}.block p{font-size:14px;color:var(--muted);margin-top:5px}select{width:100%;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:12px;margin:8px 0 16px}label{font-size:14px}.confirm{display:flex;gap:12px;align-items:flex-start;margin:15px 0}.confirm input{width:21px;height:21px;flex-shrink:0;accent-color:var(--mint)}button:disabled{opacity:.45;cursor:default}summary{cursor:pointer;color:var(--mint);padding:8px 0}.data-table{width:100%;border-collapse:collapse;font-size:14px}.data-table td,.data-table th{text-align:left;padding:13px 5px;border-bottom:1px solid var(--line)}.data-table th{color:var(--muted);font-size:11px;letter-spacing:.04em}.bars{display:flex;align-items:flex-end;gap:8px;height:140px;margin:24px 0 5px}.bar-wrap{display:grid;flex:1;grid-template-rows:18px 100px 18px;justify-items:center;align-items:end;height:100%;gap:2px;min-width:0}.bar{width:100%;max-width:46px;border-radius:6px 6px 0 0;background:var(--mint);min-height:2px}.bar-wrap span{font-size:11px;color:var(--muted)}.footer{display:flex;justify-content:space-between;gap:16px;border-top:1px solid var(--line);padding-top:18px;margin-top:14px;font-size:12px;color:var(--muted)}[hidden]{display:none!important}.active-note{border-left:3px solid var(--mint);padding-left:14px;margin-top:16px;color:var(--mint)}@media(max-width:760px){.shell{padding:22px 18px 40px}.grid{grid-template-columns:1fr;gap:0}.card{padding:21px}.top{margin-bottom:20px}.nav{margin-bottom:22px;padding-bottom:18px}.nav button{padding:9px 15px}.value{font-size:23px}.hero h2{font-size:29px}.footer{flex-direction:column}.exercise{grid-template-columns:22px 1fr}.sets{grid-column:2}.duration{font-size:23px}.workout-head{flex-wrap:wrap}}
  </style></head><body><main class="shell"><header class="top"><div class="brand">STRIVE<span style="color:var(--mint)">.</span></div><div class="status"><span class="dot"></span>${readings.length ? "WHOOP · latest import" : "WHOOP · not connected"}</div></header><nav class="nav" role="tablist" aria-label="Daily coaching"><button id="tab-today" role="tab" aria-selected="true" aria-controls="today" data-tab="today">Today</button><button id="tab-workout" role="tab" aria-selected="false" aria-controls="workout" data-tab="workout">Workout</button><button id="tab-food" role="tab" aria-selected="false" aria-controls="food" data-tab="food">Food</button><button id="tab-health" role="tab" aria-selected="false" aria-controls="health" data-tab="health">Health</button><button id="tab-connect" role="tab" aria-selected="false" aria-controls="connect" data-tab="connect">Connect</button><button id="tab-insights" role="tab" aria-selected="false" aria-controls="insights" data-tab="insights">Your data</button></nav>
  <section id="today" role="tabpanel" aria-labelledby="tab-today">${todayHub}<details><summary>View the WHOOP coaching example</summary><div class="intro"><p class="eyebrow">${escape(date)} · YOUR DAILY PLAN</p><h1>Build momentum.<br>Keep something in reserve.</h1><p class="muted">Your recovery, how you feel, and the time you have.</p></div><div class="grid"><div><article class="card hero"><span class="badge" id="mode-badge">${model.current ? (model.lower ? "Keep it lighter" : "Maintain · moderate session") : "Refresh readings before training"}</span><h2 id="recommendation-title">${model.current ? (model.lower ? "Make recovery the priority." : "A good day for controlled training.") : "This plan needs a fresh check-in."}</h2><p id="recommendation-copy" class="muted">${model.current ? (model.lower ? "Your device is in the lower recovery band. Start with easy movement and reassess how you feel." : `You feel good. ${model.declining ? "The recent downward recovery trend supports a controlled session." : "Keep your planned workload and use the warm-up to assess how you feel."} Keep familiar movements and leave about three good reps in reserve.`) : "These readings are from another day or have no usable recovery score. Refresh WHOOP before treating the workout as today's recommendation."}</p><div class="facts"><div class="fact"><span class="small">Recovery</span><strong class="value score">${score === null ? "—" : score + "%"}</strong><span class="small">${band}</span></div><div class="fact"><span class="small">Sleep</span><strong class="value">${time(latest?.sleepMinutes)}</strong><span class="small">Latest night</span></div><div class="fact"><span class="small">HRV</span><strong class="value">${latest?.hrv ?? "—"}<span style="font-size:13px;letter-spacing:0"> ms</span></strong><span class="small">Personal context matters</span></div></div><button class="button" data-open="workout">Review your workout ↗</button></article><article class="card"><p class="eyebrow">THE REASONING</p><h2>Why this suggestion?</h2><div class="reason"><h3>Recovery sets the starting point.</h3><p>${score === null ? "A usable recovery score is missing." : `${score}% falls in WHOOP's ${score < 34 ? "lower" : score < 67 ? "moderate" : "higher"} band.`} This is a guide to readiness, not a percentage of your strength.</p></div><div class="reason"><h3>${model.declining ? "The recent trend adds caution." : "The trend adds context."}</h3><p>${escape(trend)} over the latest displayed days. This alone cannot tell us whether training, sleep, stress or something else caused the change.</p></div><div class="reason"><h3>HRV needs your own context.</h3><p>${escape(averageText)}</p></div><div class="reason"><h3>Sleep duration is only part of the picture.</h3><p>${time(latest?.sleepMinutes)} recorded. Sleep need and debt are not available in this preview, so neither is inferred from duration alone.</p></div></article></div><aside><article class="card"><p class="eyebrow">YOUR CHECK-IN</p><h2>Room for a good session.</h2><div class="checkin"><span class="muted">How you feel</span><strong>Feeling good</strong></div><div class="checkin"><span class="muted">Time available</span><strong>90 min · morning</strong></div><p class="notice">From your check-in in this conversation. Equipment, last workout and any limiting pain or illness still need confirming.</p></article><article class="card"><p class="eyebrow">BEYOND THE WORKOUT</p><h2>Keep the rest of today simple.</h2><div class="timeline"><div class="event"><time>Before</time><div><h3>Arrive fuelled.</h3><p>Your usual breakfast or a familiar snack if needed. Drink normally.</p></div></div><div class="event"><time>After</time><div><h3>Eat. Recover. Reflect.</h3><p>A normal meal with protein and carbohydrates. Note your energy and how hard training felt.</p></div></div><div class="event"><time>Daytime</time><div><h3>Keep moving gently.</h3><p>A relaxed walk and breaks from sitting. No extra hard session is needed to fill the day.</p></div></div><div class="event"><time>Tonight</time><div><h3>Protect your bedtime.</h3><p>Leave enough time for sleep. Check fresh readings and how you feel before tomorrow's session.</p></div></div></div></article></aside></div></details></section>
  <section id="workout" role="tabpanel" aria-labelledby="tab-workout" hidden>${workoutPanel}<div class="intro"><p class="eyebrow">A REVIEWABLE SUGGESTION</p><h1>Train with control.</h1><p class="muted">A general gym session. Your existing programme takes priority.</p></div><div class="grid"><article class="card"><div class="workout-head"><div><p class="eyebrow">FULL BODY · MODERATE</p><h2 id="workout-title">Strength + easy cardio</h2></div><div class="duration" id="duration">70–80 min</div></div><p class="notice">You have 90 minutes. There is no need to use every minute.</p><div class="block"><h3>Warm up · 10 min</h3><p>Easy bike or walking, comfortable mobility and light practice sets.</p></div><div id="strength" class="workout-list">${exercises.map(([num, name, sets, note, lighter]) => `<div class="exercise"><span class="num">${num}</span><div><h3>${name}</h3><p>${note}</p></div><span class="sets" data-normal="${sets}" data-light="${lighter}">${sets}</span></div>`).join("")}</div><div class="block"><h3 id="cardio-title">Easy cardio · 15 min</h3><p>Walk or cycle at a comfortable conversational pace.</p></div><div class="block"><h3>Cool down · 5 min</h3><p>Gentle movement. Record how the session felt afterwards.</p></div><p class="active-note" id="effort">Choose familiar weights that leave about three good repetitions available. Rest around two minutes between strength sets.</p></article><aside><article class="card"><p class="eyebrow">ADAPT TO REAL LIFE</p><h2>Check the warm-up.</h2><label for="feeling">How does it feel?</label><select id="feeling"><option value="normal">Normal · feeling good</option><option value="heavy">Unusually tiring or heavy</option><option value="limited">Pain or illness is limiting me</option></select><p class="small muted" id="adjustment" aria-live="polite">Keep the session controlled and reassess between sets.</p><label class="confirm"><input id="equipment" type="checkbox"><span>I have gym access and these movements are familiar.</span></label><label class="confirm"><input id="schedule" type="checkbox"><span>This fits my programme and recent training.</span></label><label class="confirm"><input id="symptoms" type="checkbox"><span>No pain or illness is limiting this session.</span></label><button class="button" id="choose" disabled>Customise & start session</button><p class="small active-note" id="chosen" hidden role="status">Session selected for this preview. It has not been saved to your Strive training history.</p><p class="notice">If you trained these muscles hard yesterday, choose your programme's next session or easy cardio. Stop and reassess if pain appears.</p></article><article class="card"><h3>What this plan doesn't know yet</h3><p class="notice">Your goal, training history, usual working weights, equipment and WHOOP strain target. No weights, calorie target or sleep deficit are invented.</p></article></aside></div></section>
  ${lifestylePanels}<section id="insights" role="tabpanel" aria-labelledby="tab-insights" hidden><div class="intro"><p class="eyebrow">YOUR INPUTS, VISIBLE</p><h1>Recovery in context.</h1><p class="muted">Latest seven readings from the connected WHOOP test.</p></div><div class="grid"><article class="card"><h2>Recent recovery</h2><div class="bars" aria-label="Recovery by day">${model.sorted
    .slice(0, 7)
    .reverse()
    .map(
      (r) =>
        `<div class="bar-wrap"><span>${r.recovery ?? "—"}%</span><div class="bar" style="height:${r.recovery === null ? 0 : Math.max(0, Math.min(100, r.recovery))}%" role="img" aria-label="${escape(r.day)}: ${r.recovery ?? "unavailable"}"></div><span>${escape(r.day.slice(8))}</span></div>`,
    )
    .join(
      "",
    )}</div><p class="small muted">Calendar day · recovery score / 100</p><table class="data-table"><thead><tr><th>DAY</th><th>RECOVERY</th><th>SLEEP</th><th>HRV</th></tr></thead><tbody>${model.sorted
    .slice(0, 7)
    .map(
      (r) =>
        `<tr><td>${escape(r.day.slice(5))}</td><td>${r.recovery ?? "—"}%</td><td>${time(r.sleepMinutes)}</td><td>${r.hrv ?? "—"} ms</td></tr>`,
    )
    .join(
      "",
    )}</tbody></table></article><aside class="card"><h2>Clear limits.</h2><div class="reason"><h3>Real readings, explicit assumptions.</h3><p>The values come from your current local WHOOP session. The workout is a coaching example based on those readings and your check-in, not WHOOP's own workout prescription.</p></div><div class="reason"><h3>One signal is never the whole picture.</h3><p>Feeling good, your programme and warm-up matter. A score doesn't diagnose illness or measure the weight you can safely lift.</p></div><div class="reason"><h3>Readings belong to their date.</h3><p>Refresh before tomorrow's workout. Stale data must not be used to recommend progression.</p></div><p class="notice"><a href="https://www.whoop.com/us/en/thelocker/how-does-whoop-recovery-work-101/" target="_blank" rel="noreferrer">How WHOOP describes recovery ↗</a></p></aside></div></section><footer class="footer"><span>Local Strive preview · training saved to your account</span><a href="http://localhost:8765/">Manage WHOOP connection ↗</a></footer></main>
  <script nonce="${nonce}">
  const current=${model.current};const lower=${model.lower};
  function tab(name){document.querySelectorAll('[role="tabpanel"]').forEach(el=>el.hidden=el.id!==name);document.querySelectorAll('[data-tab]').forEach(el=>el.setAttribute('aria-selected',String(el.dataset.tab===name)));window.scrollTo({top:0,behavior:'smooth'});window.dispatchEvent(new CustomEvent('strive-tab',{detail:name}));}
  document.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>tab(el.dataset.tab)));
  document.querySelectorAll('[data-open]').forEach(el=>el.addEventListener('click',()=>tab(el.dataset.open)));
  const feeling=document.getElementById('feeling');const choose=document.getElementById('choose');
  function update(){const value=feeling.value;const limited=value==='limited';const light=value==='heavy'||lower;document.getElementById('strength').hidden=limited||!current;document.querySelectorAll('#workout .block').forEach(el=>el.hidden=limited||!current);document.querySelectorAll('.sets').forEach(el=>el.textContent=light?el.dataset.light:el.dataset.normal);document.getElementById('workout-title').textContent=!current?'Refresh your readings first':limited?'Prioritise recovery':light?'Lighter strength + easy cardio':'Strength + easy cardio';document.getElementById('duration').textContent=!current||limited?'Reassess':light?'50–65 min':'70–80 min';document.getElementById('adjustment').textContent=!current?'This is not a current-day recommendation. Refresh WHOOP first.':limited?'Do not use this workout while pain or illness is limiting you. Rest and reassess; seek appropriate advice if symptoms warrant it.':light?'Use fewer sets and easier weights as needed. Leave extra repetitions in reserve.':'Keep the session controlled and reassess between sets.';document.getElementById('effort').textContent=limited?'Gentle movement is optional only if comfortable; there is no workout target to complete.':'Choose familiar weights that leave about three good repetitions available. Rest around two minutes between strength sets.';choose.disabled=!current||limited||!['equipment','schedule','symptoms'].every(id=>document.getElementById(id).checked);document.getElementById('chosen').hidden=true;}
  feeling.addEventListener('change',update);document.querySelectorAll('input[type="checkbox"]').forEach(el=>el.addEventListener('change',update));choose.addEventListener('click',()=>{window.startSuggestedWorkout?.();});update();
  document.querySelector('[role="tablist"]').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[...document.querySelectorAll('[data-tab]')];let i=tabs.indexOf(document.activeElement);if(i<0)return;event.preventDefault();i=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[i].focus();tab(tabs[i].dataset.tab);});
  </script><script nonce="${nonce}" src="/dialog.js"></script><script nonce="${nonce}" src="/workouts.js"></script><script nonce="${nonce}" src="/lifestyle.js"></script></body></html>`;
}
