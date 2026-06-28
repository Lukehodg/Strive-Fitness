-- =============================================================================
-- 0014_moderation.sql — moderation workflow (review reports, suspend bad actors)
--
-- A men-only social app must be able to act on reports. This adds:
--   * a `suspended_at` flag on profiles, enforced in RLS so a suspended user
--     can't host, join, message or invite (they can still read);
--   * an `is_moderator` flag + helper, so moderators can read/triage `reports`;
--   * report `status` so triage state is tracked.
-- The moderator-facing actions (list / triage / suspend) live in the `moderation`
-- Edge Function, gated on is_moderator.
-- =============================================================================

alter table public.profiles
  add column if not exists suspended_at  timestamptz,
  add column if not exists is_moderator  boolean not null default false;

-- Owner (and others) may read these alongside the rest of the profile (0013
-- revoked table-level select, so new columns must be granted explicitly).
grant select (suspended_at, is_moderator) on public.profiles to authenticated;

alter table public.reports
  add column if not exists status      text not null default 'open'
    check (status in ('open', 'reviewed', 'actioned', 'dismissed')),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles (id);

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so policies can check regardless of the caller's view)
-- ---------------------------------------------------------------------------
create or replace function public.is_suspended(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = uid and suspended_at is not null);
$$;

create or replace function public.is_moderator(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = uid and is_moderator = true);
$$;

-- ---------------------------------------------------------------------------
-- Suspended users can't create content. Recreate the insert policies with the
-- extra gate (bodies otherwise unchanged from 0001/0006/0008).
-- ---------------------------------------------------------------------------
drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities
  for insert to authenticated
  with check (
    host_id = auth.uid()
    and not public.is_suspended(auth.uid())
    and exists (
      select 1 from public.profiles where id = auth.uid() and phone_verified = true
    )
  );

drop policy if exists participants_insert on public.activity_participants;
create policy participants_insert on public.activity_participants
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_suspended(auth.uid())
    and exists (
      select 1 from public.profiles where id = auth.uid() and phone_verified = true
    )
    and exists (
      select 1 from public.activities a
      where a.id = activity_id and not public.is_blocked(auth.uid(), a.host_id)
    )
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_suspended(auth.uid())
    and public.is_participant(activity_id, auth.uid())
  );

drop policy if exists game_invites_insert on public.game_invites;
create policy game_invites_insert on public.game_invites
  for insert to authenticated
  with check (
    inviter_id = auth.uid()
    and not public.is_suspended(auth.uid())
    and not public.is_blocked(auth.uid(), invitee_id)
    and exists (
      select 1 from public.activity_participants ap
      where ap.activity_id = activity_id and ap.user_id = auth.uid() and ap.status = 'joined'
    )
    and exists (
      select 1 from public.activities a
      where a.id = activity_id and a.status in ('open', 'full') and a.starts_at > now()
    )
  );

-- ---------------------------------------------------------------------------
-- Moderators can read + triage reports (nobody else can read them).
-- ---------------------------------------------------------------------------
create policy reports_select_moderator on public.reports
  for select to authenticated
  using (public.is_moderator(auth.uid()));

create policy reports_update_moderator on public.reports
  for update to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

-- Promote your first moderator manually (server-side / SQL editor), e.g.:
--   update public.profiles set is_moderator = true where id = '<your-user-id>';
