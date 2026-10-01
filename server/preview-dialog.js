// In-page confirmation works in embedded previews as well as ordinary browsers.
window.striveConfirm = text => new Promise(resolve => {
  const previous = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', 'Review this action');
  dialog.style.cssText = 'background:#1a2729;color:#eff6f2;border:1px solid #416352;border-radius:22px;padding:26px;max-width:min(520px,90vw);';
  const copy = document.createElement('p'); copy.textContent = text;
  copy.style.cssText = 'white-space:pre-wrap;line-height:1.6;margin-bottom:22px';
  const actions = document.createElement('div'); actions.className = 'actions';
  const cancel = document.createElement('button');cancel.className='button secondary';cancel.textContent='Cancel';
  const confirm = document.createElement('button');confirm.className='button';confirm.textContent='Confirm';
  const finish = result => { dialog.close(); dialog.remove(); previous?.focus(); resolve(result); };
  cancel.onclick = () => finish(false);confirm.onclick = () => finish(true);
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
  actions.append(cancel,confirm);dialog.append(copy,actions);document.body.append(dialog);dialog.showModal();cancel.focus();
});
