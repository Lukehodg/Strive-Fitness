-- =============================================================================
-- 0011_reminders.sql — time-based game reminders via pg_cron + pg_net
--
-- The last notifications gap: reminders have no actor (nobody taps a button ~1h
-- before kickoff), so a scheduled job finds activities starting soon and calls
-- the `send-notifications` Edge Function server-side. The function recognises a
-- service-role bearer as a trusted call and skips the membership gate.
--
-- ONE-TIME SETUP (run once, values are project-specific — keep them in Vault):
--   select vault.create_secret('https://YOUR-REF.supabase.co', 'project_url');
--   select vault.create_secret('<service-role-key>',            'service_role_key');
-- The service-role key is a secret — it lives in Vault, never in the app.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Dedupe: a game is reminded at most once.
alter table public.activities add column if not exists reminder_sent_at timestamptz;

-- Finds games starting in ~1h and posts a reminder to the Edge Function.
create or replace function public.send_due_reminders()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  fn_url  text;
  svc_key text;
  a       record;
begin
  select decrypted_secret into fn_url  from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into svc_key from vault.decrypted_secrets where name = 'service_role_key';
  if fn_url is null or svc_key is null then
    raise notice 'reminders: set Vault secrets project_url + service_role_key';
    return;
  end if;

  for a in
    select id, title
    from public.activities
    where status in ('open', 'full')
      and reminder_sent_at is null
      and starts_at between now() + interval '55 minutes' and now() + interval '65 minutes'
  loop
    perform net.http_post(
      url     := fn_url || '/functions/v1/send-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || svc_key
      ),
      body    := jsonb_build_object(
        'activityId', a.id,
        'title', 'Starting soon',
        'body', a.title || ' starts in about an hour. See you there?',
        'data', jsonb_build_object('type', 'game', 'activityId', a.id)
      )
    );
    update public.activities set reminder_sent_at = now() where id = a.id;
  end loop;
end;
$$;

-- Run every 2 minutes; the 55–65 min window + reminder_sent_at avoids dupes.
-- (Unschedule first so re-running this migration is safe.)
select cron.unschedule('send-due-reminders')
  where exists (select 1 from cron.job where jobname = 'send-due-reminders');

select cron.schedule('send-due-reminders', '*/2 * * * *', $$ select public.send_due_reminders(); $$);
