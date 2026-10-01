/* Local preview client. All persistent training data uses the authenticated API. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let user, catalogue = [], sessions = [], detail, busy = false, signup = false, builderKey, pendingTemplate, restUntil = 0;
  let builderRows = [], savedBuilderBody;
  const message = (text, error = false) => { $('training-message').textContent = text; $('training-message').classList.toggle('training-error', error); };
  async function api(path, method = 'GET', body) {
    const response = await fetch('/api' + path, { method, credentials:'same-origin', headers:{'Content-Type':'application/json','X-Strive-Request':'1'}, body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(15000) });
    if (response.status === 204) return null;
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.message || 'Could not save. Please retry.'); error.status = response.status; throw error; }
    return data;
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    const controls = [...document.querySelectorAll('#training-hub button, #training-builder button, #training-session button')];
    const original = controls.map(el => el.disabled);
    controls.forEach(el => el.disabled = true);
    try { await action(); } catch (error) { message(error.message, true); $('training-hub').scrollIntoView({behavior:'smooth'}); }
    finally { busy = false; controls.forEach((el, i) => { if (el.isConnected) el.disabled = original[i]; }); }
  }
  function show(id) { ['training-builder','training-session','training-history','training-records'].forEach(key => $(key).hidden = key !== id); }
  const stamp = value => new Date(value).toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' });
  const setText = set => `${set.weight} kg × ${set.reps}`;
  async function home() {
    const [list, templates] = await Promise.all([api('/training/sessions'), api('/users/me/workout-templates')]);
    sessions = list;
    $('training-active').innerHTML = list.filter(s => !s.isCompleted && s.planSnapshot).map(s => `<div class="journal-row"><div><h3>${esc(s.planSnapshot.name)}</h3><p class="small muted">In progress · started ${stamp(s.startTime)}</p></div><button class="button" data-session="${s.id}">Resume workout →</button></div>`).join('');
    $('training-templates').innerHTML = templates.length ? '<p class="eyebrow" style="margin-top:25px">YOUR SAVED WORKOUTS</p>' + templates.map(t => `<div class="journal-row"><div><h3>${esc(t.name)}</h3><p class="small muted">${t.exerciseCount} exercises · ${t.duration} min planned</p></div><button class="button secondary" data-start="${t.id}">Start / resume</button></div>`).join('') : '<p class="notice">Your first workout starts here. Build a session or customise the suggestion below.</p>';
    $('history-list').innerHTML = list.filter(s => s.isCompleted).map(s => `<div class="journal-row"><div><h3>${esc(s.planSnapshot?.name || 'Workout')}</h3><p class="small muted">${stamp(s.startTime)} · ${Math.max(0, Math.round((new Date(s.endTime)-new Date(s.startTime))/60000))} min elapsed</p></div><button class="button secondary" data-session="${s.id}">View session</button></div>`).join('') || '<p class="notice">Completed sessions will appear here. Nothing is logged until you save it.</p>';
  }
  async function ready() {
    user = await api('/auth/me');
    catalogue = (await api('/exercises')).filter(e => !e.measurementType || e.measurementType === 'weight_reps');
    $('training-auth').hidden = true; $('training-home').hidden = false;
    message(`Signed in as ${user.displayName || user.username}. Saved sets persist when you close or reload the page.`);
    await home();
  }
  $('auth-toggle').onclick = () => { signup = !signup; $('name-field').hidden = !signup; $('training-auth').elements.displayName.required = signup; $('auth-submit').textContent = signup ? 'Create account' : 'Sign in'; $('auth-toggle').textContent = signup ? 'I already have an account' : 'Create an account'; $('training-auth').elements.password.autocomplete = signup ? 'new-password' : 'current-password'; };
  $('training-auth').onsubmit = event => { event.preventDefault(); void run(async () => { const fields = Object.fromEntries(new FormData(event.target)); await api('/auth/' + (signup ? 'signup' : 'signin'), 'POST', {...fields, timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}); event.target.elements.password.value = ''; await ready(); }); };
  $('training-signout').onclick = () => void run(async () => { if (dirty() && !await window.striveConfirm('Unsaved entries will be lost. Sign out?')) return; await api('/auth/signout','POST'); location.reload(); });
  async function newBuilder(suggested = false) {
    if (!user) { message('Sign in above to save your workout.'); $('training-auth').hidden = false; $('training-hub').scrollIntoView({behavior:'smooth'}); return; }
    if (!catalogue.length) return message('No strength exercises are available.', true);
    if (dirty() && !await window.striveConfirm('Leave unsaved entries? Saved sets will remain.')) return;
    builderKey = crypto.randomUUID(); pendingTemplate = null; savedBuilderBody = null;
    const light = $('feeling').value === 'heavy' || document.getElementById('duration').textContent.includes('50');
    const names = suggested ? ['Leg Press','Machine Chest Press','Seated Cable Row','Romanian Deadlift'] : [catalogue[0].name];
    builderRows = names.map((name, i) => ({exerciseId:catalogue.find(e => e.name === name)?.id, sets:suggested ? (i === 3 ? (light ? 1 : 2) : light ? 2 : 3) : 3, repsMin:i === 2 ? 10 : 8,repsMax:i === 1 ? 10 : i === 2 ? 10 : 8, restSeconds:120}));
    if (builderRows.some(e => !e.exerciseId)) return message('A suggested exercise is missing from the catalogue. Build your own workout instead.', true);
    $('builder-name').value = suggested ? (light ? 'Controlled full body · lighter' : 'Controlled full body') : 'My workout';
    $('builder-duration').value = suggested ? (light ? 65 : 80) : 45;
    renderBuilder(); show('training-builder'); $('training-builder').scrollIntoView({behavior:'smooth'});
  }
  function readBuilder() {
    builderRows = [...document.querySelectorAll('.builder-row')].map(el => Object.fromEntries([...el.querySelectorAll('[data-field]')].map(input => [input.dataset.field, Number(input.value)])));
  }
  function renderBuilder() {
    $('builder-exercises').innerHTML = builderRows.map((row, index) => `<div class="builder-row"><label>Exercise ${index+1}<select data-field="exerciseId">${catalogue.map(e => `<option value="${e.id}" ${row.exerciseId === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label><div class="log-fields">${[['sets','Sets',1,20],['repsMin','Min reps',1,200],['repsMax','Max reps',1,200],['restSeconds','Rest (seconds)',0,1800]].map(([key,label,min,max]) => `<label>${label}<input data-field="${key}" type="number" min="${min}" max="${max}" step="1" value="${row[key]}"></label>`).join('')}</div><button class="button secondary" data-remove="${index}">Remove exercise</button></div>`).join('');
  }
  $('new-workout').onclick = () => newBuilder();
  window.startSuggestedWorkout = () => newBuilder(true);
  $('add-exercise').onclick = () => { readBuilder(); if (builderRows.length >= 30) return; const next = catalogue.find(e => !builderRows.some(r => r.exerciseId === e.id)); if (!next) return; builderRows.push({exerciseId:next.id,sets:3,repsMin:8,repsMax:10,restSeconds:120}); renderBuilder(); };
  $('builder-exercises').onclick = event => { const button = event.target.closest('[data-remove]'); if (!button) return; readBuilder(); builderRows.splice(Number(button.dataset.remove),1); renderBuilder(); };
  $('close-builder').onclick = () => show('');
  $('start-built').onclick = () => void run(async () => {
    readBuilder();
    const body = {requestKey:builderKey, name:$('builder-name').value.trim(),duration:Number($('builder-duration').value),scheduledDay:null,exercises:builderRows};
    if (!Number.isInteger(body.duration) || body.duration < 1 || body.duration > 240 || !body.name || !builderRows.length || new Set(builderRows.map(e => e.exerciseId)).size !== builderRows.length || builderRows.some(e => !Number.isInteger(e.sets) || e.sets < 1 || e.sets > 20 || !Number.isInteger(e.repsMin) || e.repsMin < 1 || e.repsMin > 200 || !Number.isInteger(e.repsMax) || e.repsMax < e.repsMin || e.repsMax > 200 || !Number.isInteger(e.restSeconds) || e.restSeconds < 0 || e.restSeconds > 1800)) throw new Error('Enter a name, duration (1–240 minutes), unique exercises, 1–20 sets, 1–200 reps and 0–1800 seconds rest.');
    // Preserve the same request key on an uncertain network response.
    if (pendingTemplate && savedBuilderBody !== JSON.stringify(body)) throw new Error('This template was already saved. Use Start / resume from your saved workouts, or cancel and build a new workout.');
    pendingTemplate = pendingTemplate || await api('/training/templates','POST',body);
    savedBuilderBody = JSON.stringify(body);
    const session = await api(`/training/templates/${pendingTemplate.id}/start`,'POST',{});
    await openSession(session.id); await home(); message('Workout started. Log each set when you complete it.');
  });
  async function openSession(id) {
    detail = await api(`/training/sessions/${id}`); renderSession(); show('training-session'); $('training-session').scrollIntoView({behavior:'smooth'});
  }
  function dirty() { return [...document.querySelectorAll('.set-entry')].some(form => form.dataset.dirty === 'true'); }
  window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
  function renderSession() {
    const {workout, sets, performance = [], achievements = []} = detail;
    const plan = workout.planSnapshot;
    const total = plan?.exercises.reduce((n,e) => n+e.sets,0) || 0;
    const volume = sets.reduce((n,s) => n+(s.weight || 0)*(s.reps || 0),0);
    const done = workout.isCompleted;
    $('training-session').innerHTML = `<div class="card hero"><p class="eyebrow">${done ? 'SESSION COMPLETE' : 'WORKOUT IN PROGRESS'}</p><h2>${esc(plan?.name || 'Workout')}</h2><div class="session-stats"><div><strong>${sets.length} / ${total}</strong><span class="small muted">sets saved</span></div><div><strong>${Number(volume.toFixed(1))}</strong><span class="small muted">kg × reps logged</span></div><div><strong id="session-elapsed">—</strong><span class="small muted">elapsed time</span></div></div><p class="notice">${done ? 'Saved to your history. Records below compare against earlier completed workouts.' : 'Previous results are reference points, not targets. Keep today’s effort controlled. Unsaved inputs remain on this page until you leave.'}</p>${done ? '' : '<button class="button" id="finish-workout">Finish workout</button>'}</div>${done ? '' : '<div class="timer-card"><div><span class="small">Rest timer</span><br><strong id="rest-clock">Ready when you are</strong></div><button class="button secondary" id="skip-rest">Skip rest</button></div>'}` + (plan?.exercises || []).map(exercise => {
      const previous = performance.find(p => p.exerciseId === exercise.exerciseId);
      const badges = achievements.find(a => a.exerciseId === exercise.exerciseId)?.achievements || [];
      return `<article class="card"><p class="eyebrow">${exercise.sets} SETS · ${exercise.repsMin}–${exercise.repsMax} REPS · ${exercise.restSeconds}s REST</p><h2>${esc(exercise.name)}</h2><p class="notice">${previous ? `Last completed: ${esc(previous.previous.map(setText).join(' · '))}<br>Heaviest: ${previous.heaviest} kg · Best set volume: ${previous.bestSetVolume} kg × reps` : 'No previous completed session. Establish a comfortable starting point.'}</p><p class="small muted">kg: dumbbells per hand; barbell total including bar; machine displayed load.</p><div id="badges-${exercise.exerciseId}">${done ? badges.map(b => `<span class="record-pill">${esc(b)}</span>`).join('') : ''}</div>${Array.from({length:exercise.sets},(_,i) => {
        const set = sets.find(s => s.exerciseId === exercise.exerciseId && s.setNumber === i+1);
        return `<form class="set-entry" data-exercise="${exercise.exerciseId}" data-number="${i+1}"><span class="set-index ${set ? 'saved-set' : ''}" aria-label="Set ${i+1}">${i+1}${set ? ' ✓' : ''}</span><label>Weight · kg<input name="weight" aria-label="${esc(exercise.name)} set ${i+1} weight kg" inputmode="decimal" type="number" min="0" max="1500" step="0.1" value="${set?.weight ?? ''}" required ${done ? 'disabled' : ''}></label><label>Reps<input name="reps" aria-label="${esc(exercise.name)} set ${i+1} reps" inputmode="numeric" type="number" min="1" max="200" step="1" value="${set?.reps ?? ''}" required ${done ? 'disabled' : ''}></label><label>RPE · optional<input name="rpe" aria-label="${esc(exercise.name)} set ${i+1} RPE optional" inputmode="numeric" type="number" min="1" max="10" step="1" value="${set?.rpe ?? ''}" ${done ? 'disabled' : ''}></label>${done ? '' : `<button class="button ${set ? 'secondary' : ''}" type="submit">${set ? 'Update' : 'Log set'}</button>`}</form>`;
      }).join('')}</article>`;
    }).join('');
    tick();
    if (!done) { $('skip-rest').onclick = () => { restUntil = 0; tick(); }; $('finish-workout').onclick = () => void run(async () => {
      if (!await window.striveConfirm(`Finish with ${detail.sets.length} of ${total} sets saved? ${dirty() ? 'You have unsaved changes. ' : ''}Only saved sets enter your history. You cannot edit this session after finishing.`)) return;
      await api(`/training/sessions/${workout.id}/finish`,'POST',{}); restUntil = 0; await openSession(workout.id); await home(); message('Workout complete. Your history and personal records are updated.');
    }); }
  }
  $('training-session').addEventListener('input', event => { const form = event.target.closest('.set-entry'); if (form) { form.dataset.dirty = 'true'; const button = form.querySelector('button'); if (button) button.textContent = 'Save changes'; } });
  $('training-session').addEventListener('submit', event => {
    const form = event.target.closest('.set-entry'); if (!form) return; event.preventDefault();
    void run(async () => {
      const values = Object.fromEntries(new FormData(form));
      const body = {exerciseId:Number(form.dataset.exercise),setNumber:Number(form.dataset.number),weight:Number(values.weight),reps:Number(values.reps),rpe:values.rpe === '' ? null : Number(values.rpe)};
      const saved = await api(`/training/sessions/${detail.workout.id}/sets`,'PUT',body);
      // Update only this row: unsaved inputs in other rows must survive a save.
      detail.sets = [...detail.sets.filter(s => s.exerciseId !== body.exerciseId || s.setNumber !== body.setNumber), saved];
      form.dataset.dirty = 'false'; form.querySelector('.set-index').textContent = body.setNumber+' ✓'; form.querySelector('.set-index').classList.add('saved-set'); form.querySelector('button').textContent = 'Update';
      const stats = $('training-session').querySelectorAll('.session-stats strong'); stats[0].textContent = `${detail.sets.length} / ${detail.workout.planSnapshot.exercises.reduce((n,e)=>n+e.sets,0)}`; stats[1].textContent = Number(detail.sets.reduce((n,s)=>n+(s.weight||0)*(s.reps||0),0).toFixed(1));
      restUntil = Date.now() + detail.workout.planSnapshot.exercises.find(e => e.exerciseId === body.exerciseId).restSeconds * 1000; tick(); message('Set saved. Personal records are confirmed when you finish the workout.');
    });
  });
  function tick() {
    if ($('rest-clock')) { const seconds = Math.max(0,Math.ceil((restUntil-Date.now())/1000)); $('rest-clock').textContent = seconds ? `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}` : 'Ready when you are'; }
    if ($('session-elapsed') && detail) { const end = detail.workout.endTime ? new Date(detail.workout.endTime).getTime() : Date.now(); $('session-elapsed').textContent = Math.max(0,Math.floor((end-new Date(detail.workout.startTime))/60000))+' min'; }
  }
  setInterval(tick,1000);
  $('show-history').onclick = async () => { if (dirty() && !await window.striveConfirm('Leave unsaved entries?')) return; show('training-history'); };
  $('show-records').onclick = () => void run(async () => {
    if (dirty() && !await window.striveConfirm('Leave unsaved entries?')) return;
    const records = await api('/training/records');
    $('records-list').innerHTML = records.map(r => `<div class="journal-row"><div><h3>${esc(r.name)}</h3><p class="small muted">${r.sessionCount} completed session${r.sessionCount === 1 ? ' · baseline' : 's'} · last ${stamp(r.previous[0].finishedAt)}</p><p>${r.heaviest} kg heaviest · ${r.bestSetVolume} kg × reps best set${r.bestReps ? ` · ${r.bestReps} bodyweight reps` : ''}</p></div></div>`).join('') || '<p class="notice">Your first completed workout will establish your baselines. No invented records.</p>';
    show('training-records');
  });
  $('workout').addEventListener('click', event => {
    const session = event.target.closest('[data-session]'); const start = event.target.closest('[data-start]');
    if (!session && !start) return;
    void run(async () => { if (dirty() && !await window.striveConfirm('Leave unsaved entries? Saved sets remain.')) return; if (session) await openSession(Number(session.dataset.session)); else { const next = await api(`/training/templates/${start.dataset.start}/start`,'POST',{}); await openSession(next.id); await home(); } });
  });
  ready().catch(error => { $('training-auth').hidden = false; message(error.status === 401 ? 'Sign in to start your training journal.' : 'Training service unavailable. Check the local app server and reload.', error.status !== 401); });
})();
