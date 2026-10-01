(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const keys = ['calories','protein','carbs','fat'];
  let dayData, foodEdit = null, foodPending = null, routines = [], logs = [], routineEdit = null, archived = false, mailConnections, mailPending;
  const pendingLogs = new Map();
  const locks = new Set();
  function message(id,text,error=false) { $(id).textContent=text; $(id).classList.toggle('error-text',error); }
  async function api(path,method='GET',body) {
    const response=await fetch('/api'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Strive-Request':'1'},body:body===undefined ? undefined : JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    if(response.status===204)return null;
    const data=await response.json();
    if(!response.ok)throw Object.assign(new Error(response.status===401 ? 'Sign in on the Workout tab to use your account.' : data.message || 'Could not save. Try again.'),{status:response.status});
    return data;
  }
  async function action(section,fn) {
    if(locks.has(section))return;locks.add(section);
    const controls=[...$(section).querySelectorAll('button, input, select')];
    const original=controls.map(c=>c.disabled); controls.forEach(c=>c.disabled=true);
    try {await fn();} catch(error) {if(error.status===400){if(section==='food')foodPending=null;if(section==='connect')mailPending=null;}message(section==='today' ? 'checkin-message' : section+'-message',error.message,true);if(section==='today' && $('today-overview').textContent.includes('Loading your daily overview'))$('today-overview').textContent='Your overview will appear after you sign in and refresh this tab.';}
    finally {locks.delete(section);controls.forEach((c,i)=>{if(c.isConnected)c.disabled=original[i];});if(section==='connect')mailAvailability();}
  }
  const stamp = value => new Date(value).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  function mailAvailability() {
    document.querySelectorAll('[data-mail-browse]').forEach(el=>el.disabled=!mailConnections?.[el.dataset.mailBrowse]?.connected);
    $('mail-compose').querySelector('button').disabled=!mailConnections?.[$('mail-compose').elements.provider.value]?.connected;
  }
  $('mail-compose').elements.provider.onchange=mailAvailability;
  mailAvailability();
  function portion(entry) {return Array.isArray(entry.foods) && entry.foods[0]?.nutritionVersion===1 ? entry.foods[0] : null;}
  async function loadFood() {
    const date=$('food-date').value;
    dayData=await api('/nutrition/day'+(date ? '?date='+date : ''));
    $('food-date').value=dayData.date; $('food-day-label').textContent=`${dayData.date} · ${dayData.timezone}`;
    $('food-totals').innerHTML=keys.map(k=>{const target=dayData.targets[k],total=dayData.totals[k]; return `<div><p class="eyebrow">${k}</p><span class="macro-number">${total}</span><span class="small muted"> ${k==='calories' ? 'kcal' : 'g'}</span><div class="meter"><span style="width:${target>0 ? Math.min(100,total/target*100) : 0}%"></span></div><p class="small muted">${target===null ? 'No target set' : `${target} target · ${Math.abs(Math.round((target-total)*10)/10)} ${total>target ? 'above' : 'remaining'}`}</p></div>`;}).join('');
    $('food-entries').innerHTML=dayData.entries.map(entry=>`<div class="journal-row"><div><p class="eyebrow">${esc(portion(entry)?.mealType || 'Food')}</p><h3>${esc(entry.name)}</h3><p class="small muted">${entry.calories} kcal · P ${entry.protein}g · C ${entry.carbs}g · F ${entry.fat}g</p>${portion(entry) ? `<p class="small muted">${portion(entry).quantity} ${esc(portion(entry).unit)}</p>` : ''}<div class="actions"><button class="button secondary" data-food-edit="${entry.id}">Edit</button><button class="button secondary" data-food-repeat="${entry.id}">Log again today</button></div></div></div>`).join('') || '<p class="life-empty">No entries on this day. Your next meal is a fresh start.</p>';
  }
  function foodInput() {
    const f=$('food-form').elements;
    return {name:f.name.value.trim(),mealType:f.mealType.value,basis:f.basis.value,amount:Number(f.amount.value),nutrients:Object.fromEntries(keys.map(k=>[k,Number(f[k].value)])),timestamp:foodEdit?.timestamp || foodPending?.food.timestamp || new Date().toISOString()};
  }
  function previewPortion() {
    const f=$('food-form').elements, food=foodInput(), factor=food.amount/(food.basis==='serving' ? 1 : 100);
    $('amount-label').textContent=food.basis==='serving' ? 'Servings eaten' : food.basis==='100g' ? 'Grams eaten' : 'Millilitres consumed';
    $('portion-preview').textContent=keys.every(k=>f[k].value!=='' && Number.isFinite(food.nutrients[k])) && Number.isFinite(factor) && factor>0 ? `Your portion: ${Math.round(food.nutrients.calories*factor)} kcal · P ${(food.nutrients.protein*factor).toFixed(1)}g · C ${(food.nutrients.carbs*factor).toFixed(1)}g · F ${(food.nutrients.fat*factor).toFixed(1)}g` : 'Enter label values to preview your portion.';
  }
  function clearFood() {foodEdit=null;foodPending=null;$('food-form').reset();$('food-form-title').textContent='Log food for today.';$('save-food').textContent='Save food';previewPortion();}
  $('food-form').addEventListener('input',previewPortion);
  $('food-form').onsubmit=event=>{event.preventDefault(); const food=foodInput();void action('food',async()=>{
    if(foodEdit)await api('/nutrition/entries/'+foodEdit.id,'PUT',food);
    else {if(foodPending && JSON.stringify(foodPending.food)!==JSON.stringify(food))throw new Error('The previous save is unconfirmed. Retry unchanged values, or check your log before clearing the form.');foodPending ??= {requestKey:crypto.randomUUID(),food};await api('/nutrition/entries','POST',foodPending);}
    const wasNew=!foodEdit;clearFood();if(wasNew)$('food-date').value='';await loadFood();message('food-message','Food saved. Your totals are up to date.');
  });};
  $('clear-food').onclick=async()=>{if(foodPending && !await window.striveConfirm('Check your log before starting a different entry: the previous save may have succeeded. Clear the form?'))return;clearFood();};
  $('food-date').onchange=()=>void action('food',loadFood);
  $('food-entries').onclick=async event=>{
    const edit=event.target.closest('[data-food-edit]'), repeat=event.target.closest('[data-food-repeat]');if(!edit&&!repeat)return;
    if(foodPending && !await window.striveConfirm('A previous save is unconfirmed. Check your log before replacing the form. Continue?'))return;
    const entry=dayData.entries.find(e=>e.id===Number(edit?.dataset.foodEdit || repeat.dataset.foodRepeat));
    const data=portion(entry), f=$('food-form').elements;foodPending=null;foodEdit=edit ? entry : null;
    f.name.value=entry.name;f.mealType.value=data?.mealType || 'snack';f.basis.value=data?.basis || 'serving';f.amount.value=data?.quantity || 1;
    keys.forEach(k=>f[k].value=data?.nutrients[k] ?? entry[k]);
    $('food-form-title').textContent=edit ? 'Edit food entry.' : 'Log again today.';$('save-food').textContent=edit ? 'Update food' : 'Save food';previewPortion();$('food-form').scrollIntoView({behavior:'smooth'});
  };
  $('edit-targets').onclick=()=>{if(!dayData)return;keys.forEach(k=>$('target-form').elements[k].value=dayData.targets[k] ?? '');$('target-form').hidden=false;};
  $('cancel-targets').onclick=()=>$('target-form').hidden=true;
  $('target-form').onsubmit=event=>{event.preventDefault();const fields=event.target.elements;const map={calories:'dailyCalorieTarget',protein:'dailyProteinTarget',carbs:'dailyCarbsTarget',fat:'dailyFatTarget'};const body=Object.fromEntries(keys.map(k=>[map[k],fields[k].value==='' ? null : Number(fields[k].value)]));void action('food',async()=>{await api('/user/me','PATCH',body);$('target-form').hidden=true;await loadFood();message('food-message','Your chosen targets are saved.');});};
  async function loadHealth() {
    [routines,logs]=await Promise.all([api('/users/me/medications'),api('/routine-logs')]);
    $('routine-list').innerHTML=routines.filter(r=>archived ? !r.isActive : r.isActive).map(r=>`<article class="card routine-card"><p class="eyebrow">${esc(r.category)} · ${esc(r.type)}</p><h2>${esc(r.name)}</h2><p class="notice">${esc(r.dosage)} · ${esc(r.frequency)}</p>${r.notes ? `<p class="small muted">${esc(r.notes)}</p>` : ''}${logs.find(l=>l.medicationId===r.id) ? `<p class="small active-note">Last recorded: ${esc(logs.find(l=>l.medicationId===r.id).status)} · ${stamp(logs.find(l=>l.medicationId===r.id).recordedAt)}</p>` : '<p class="notice">No doses recorded yet.</p>'}<div class="actions">${r.isActive ? `<button class="button" data-log="taken" data-routine="${r.id}">Record taken</button><button class="button secondary" data-log="skipped" data-routine="${r.id}">Record skipped</button><button class="button secondary" data-edit-routine="${r.id}">Edit</button>` : ''}<button class="button secondary" data-archive="${r.id}">${r.isActive ? 'Archive' : 'Restore'}</button></div></article>`).join('') || `<div class="card life-empty">${archived ? 'No archived routines.' : 'No routines yet. Add the supplements or medication you already take.'}</div>`;
    $('routine-history').innerHTML=logs.slice(0,25).map(l=>`<div class="journal-row"><div><h3>${esc(l.name)} · ${esc(l.status)}</h3><p class="small muted">${esc(l.dosage)} · ${stamp(l.recordedAt)}</p></div></div>`).join('') || '<p class="life-empty">Your taken and skipped records will appear here.</p>';
  }
  $('toggle-archived').onclick=()=>void action('health',async()=>{archived=!archived;$('toggle-archived').textContent=archived ? 'Show active' : 'Show archived';await loadHealth();});
  $('add-routine').onclick=()=>{routineEdit=null;$('routine-form').reset();$('routine-title').textContent='Add a routine.';$('routine-form').hidden=false;};
  $('cancel-routine').onclick=()=>$('routine-form').hidden=true;
  $('routine-form').onsubmit=event=>{event.preventDefault();const body=Object.fromEntries(new FormData(event.target));void action('health',async()=>{await api(routineEdit ? '/medications/'+routineEdit.id : '/medications',routineEdit ? 'PATCH' : 'POST',{...body,...(!routineEdit ? {startDate:new Date().toISOString(),isActive:true} : {})});$('routine-form').hidden=true;await loadHealth();message('health-message','Routine saved. Existing dose history is preserved.');});};
  $('routine-list').onclick=event=>{
    const edit=event.target.closest('[data-edit-routine]');if(edit){routineEdit=routines.find(r=>r.id===Number(edit.dataset.editRoutine));for(const key of ['name','category','type','dosage','frequency','notes'])$('routine-form').elements[key].value=routineEdit[key] || '';$('routine-title').textContent='Edit routine.';$('routine-form').hidden=false;$('routine-form').scrollIntoView({behavior:'smooth'});return;}
    const log=event.target.closest('[data-log]'),archive=event.target.closest('[data-archive]');if(!log&&!archive)return;
    const routine=routines.find(r=>r.id===Number(log?.dataset.routine || archive.dataset.archive));
    void action('health',async()=>{
      if(log){const status=log.dataset.log; const latest=logs.find(l=>l.medicationId===routine.id);if(!await window.striveConfirm(`${routine.name} · ${routine.dosage}\n${latest ? `Last recorded ${latest.status} at ${stamp(latest.recordedAt)}.\n` : ''}Record a dose you have already ${status==='taken' ? 'taken' : 'skipped'}?`))return;const key=routine.id+'-'+status;if(!pendingLogs.has(key))pendingLogs.set(key,crypto.randomUUID());await api('/routine-logs','POST',{medicationId:routine.id,status,requestKey:pendingLogs.get(key)});pendingLogs.delete(key);message('health-message',`${routine.name}: ${status} recorded.`);}
      else {await api('/medications/'+routine.id,'PATCH',{isActive:!routine.isActive});message('health-message',routine.isActive ? 'Routine archived. History is preserved.' : 'Routine restored.');}
      await loadHealth();
    });
  };
  async function loadConnect() {
    const [connections,profile,mail]=await Promise.all([api('/connections'),api('/auth/me'),api('/mail/connections')]);
    mailConnections=mail;
    $('mail-status').innerHTML=['gmail','outlook'].map(p=>`<div class="journal-row"><div><h3>${p==='gmail' ? 'Gmail' : 'Outlook / Microsoft 365'}</h3><p class="small muted">${mail[p].connected ? esc(mail[p].address) : mail[p].configured ? 'Ready to connect from the native app' : 'Provider credentials and HTTPS callback need setup'}</p></div></div>`).join('');
    document.querySelectorAll('[data-mail-browse]').forEach(el=>el.disabled=!mail[el.dataset.mailBrowse].connected);
    $('profile-form').elements.displayName.value=profile.displayName || '';$('profile-form').elements.timezone.value=profile.timezone;
    $('connection-cards').innerHTML=['whoop','oura'].map(provider=>{const c=connections[provider];return `<article class="card"><p class="eyebrow">WEARABLE</p><h2>${provider==='whoop' ? 'WHOOP' : 'Oura'}</h2><span class="badge" style="margin-top:16px">${esc(c.status)}</span><p class="muted">${c.connected ? `Latest reading: ${esc(c.latestDay || 'Awaiting import')}. Last sync: ${c.last_sync ? stamp(c.last_sync) : 'Not yet'}.` : c.configured ? 'Connect from the native Strive app on your phone using the secure sign-in flow.' : 'Server setup needed before account linking is available.'}</p>${c.lastError ? `<p class="notice">${esc(c.lastError)}</p>` : ''}<div class="actions">${c.connected ? `<button class="button" data-sync="${provider}" ${c.syncing || c.queued ? 'disabled' : ''}>${c.syncing ? 'Syncing…' : c.queued ? 'Sync queued' : 'Sync now'}</button>` : ''}${c.canDisconnect ? `<button class="button secondary" data-disconnect="${provider}">Disconnect & remove readings</button>` : ''}</div><p class="notice">The separate local WHOOP test does not link this Strive account.</p></article>`;}).join('');
  }
  $('profile-form').onsubmit=event=>{event.preventDefault();const body=Object.fromEntries(new FormData(event.target));void action('connect',async()=>{await api('/user/me','PATCH',body);message('connect-message','Account settings saved.');await loadConnect();});};
  $('connection-cards').onclick=event=>{const sync=event.target.closest('[data-sync]'),disconnect=event.target.closest('[data-disconnect]');if(!sync&&!disconnect)return;void action('connect',async()=>{const provider=sync?.dataset.sync || disconnect.dataset.disconnect;if(disconnect&&!await window.striveConfirm('Disconnect '+provider+' and remove its saved readings from Strive?'))return;await api('/connections/'+provider+(sync ? '/sync' : ''),sync ? 'POST' : 'DELETE');await loadConnect();message('connect-message',sync ? 'Sync queued. Reopen this tab shortly to check progress.' : 'Disconnected.');});};
  async function loadMail() {
    const [imports,outgoing]=await Promise.all([api('/mail/imports'),api('/mail/outgoing')]);
    $('mail-imports').innerHTML=imports.filter(i=>i.status!=='dismissed').map(i=>`<div class="journal-row"><div><h3>${esc(i.subject)}</h3><p class="small muted">${esc(i.sender)} · ${esc(i.status)}</p><details><summary>Read imported text</summary><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(i.body)}</p></details>${i.status==='pending' ? `<div class="actions"><button class="button" data-mail-review="${i.id}" data-status="kept">Keep as note</button><button class="button secondary" data-mail-review="${i.id}" data-status="dismissed">Dismiss</button></div>` : ''}</div></div>`).join('') || '<p class="life-empty">No emails awaiting review.</p>';
    $('mail-outgoing').innerHTML=outgoing.map(o=>`<div class="journal-row"><div><h3>${esc(o.subject)}</h3><p class="small muted">To ${esc(o.recipient)} · ${o.status==='accepted' ? 'Accepted by provider · delivery not confirmed' : 'Unconfirmed — check Sent mail before another attempt'}</p></div></div>`).join('') || '<p class="life-empty">No email has been sent from Strive.</p>';
  }
  $('open-mail').onclick=()=>void action('connect',async()=>{$('mail-workspace').hidden=false;await loadMail();$('mail-workspace').scrollIntoView({behavior:'smooth'});});
  document.querySelectorAll('[data-mail-browse]').forEach(button=>button.onclick=()=>void action('connect',async()=>{
    const p=button.dataset.mailBrowse;const rows=await api('/mail/'+p+'/recent');
    $('mail-recent').innerHTML=rows.map(m=>`<div class="journal-row"><div><h3>${esc(m.subject)}</h3><p class="small muted">${esc(m.sender)}</p></div><button class="button secondary" data-mail-import="${esc(m.id)}" data-provider="${p}">Import for review</button></div>`).join('') || '<p class="notice">No inbox messages returned.</p>';
  }));
  $('mail-recent').onclick=event=>{const button=event.target.closest('[data-mail-import]');if(button)void action('connect',async()=>{await api('/mail/'+button.dataset.provider+'/import','POST',{messageId:button.dataset.mailImport});await loadMail();message('connect-message','Imported for review. No food, workout or regimen records changed.');});};
  $('mail-imports').onclick=event=>{const button=event.target.closest('[data-mail-review]');if(button)void action('connect',async()=>{await api('/mail/imports/'+button.dataset.mailReview,'PATCH',{status:button.dataset.status});await loadMail();});};
  $('mail-compose').onsubmit=event=>{event.preventDefault();const body=Object.fromEntries(new FormData(event.target));void action('connect',async()=>{
    if(!mailConnections?.[body.provider]?.connected)throw new Error('Connect this email provider in the native app before sending.');
    if(!await window.striveConfirm(`Send from ${mailConnections[body.provider].address} to ${body.recipient}?\nSubject: ${body.subject}\n\nThe full message is shown in the editor.`))return;
    const draft={...body,confirmed:true};
    if(mailPending && JSON.stringify({...mailPending,requestKey:undefined})!==JSON.stringify(draft))throw new Error('A previous send is unconfirmed. Check your sending history before editing and sending again.');
    mailPending ??= {...draft,requestKey:crypto.randomUUID()};
    const sent=await api('/mail/send','POST',mailPending);mailPending=null;event.target.reset();await loadMail();
    message('connect-message',sent.status==='accepted' ? 'Accepted by the provider. Delivery is not yet confirmed.' : 'Outcome uncertain. Check Sent mail before composing another message; this request will not be resent.');
  });};
  async function loadToday() {
    const [food,readiness,sessions,routineList,checkin]=await Promise.all([api('/nutrition/day'),api('/readiness'),api('/training/sessions'),api('/users/me/medications'),api('/check-in')]);
    $('today-overview').innerHTML=`<span class="badge">${esc(food.date)} · ${esc(food.timezone)}</span><h2>${esc(readiness.title)}</h2><p class="notice">${esc(readiness.reasons[0] || '')}</p><div class="macro-grid"><div><p class="eyebrow">FOOD</p><span class="macro-number">${food.totals.calories}</span><p class="small muted">kcal logged today</p></div><div><p class="eyebrow">PROTEIN</p><span class="macro-number">${food.totals.protein}g</span><p class="small muted">logged today</p></div><div><p class="eyebrow">TRAINING</p><span class="macro-number">${sessions.filter(s=>!s.isCompleted).length}</span><p class="small muted">sessions to resume</p></div><div><p class="eyebrow">ROUTINES</p><span class="macro-number">${routineList.filter(r=>r.isActive).length}</span><p class="small muted">active · not doses due</p></div></div><p class="small muted">${esc(readiness.note)}</p>`;
    if(checkin){const f=$('daily-checkin').elements;f.energy.value=checkin.energy;f.soreness.value=checkin.soreness;f.limited.checked=checkin.limited;}
  }
  $('daily-checkin').onsubmit=event=>{event.preventDefault();const f=event.target.elements;const body={energy:f.energy.value,soreness:f.soreness.value,limited:f.limited.checked};void action('today',async()=>{await api('/check-in','POST',body);await loadToday();message('checkin-message','Your check-in is saved for today.');});};
  window.addEventListener('strive-tab',event=>{const name=event.detail;const load={today:loadToday,food:loadFood,health:loadHealth,connect:loadConnect}[name];if(load)void action(name,load);});
  void action('today',loadToday);
})();
