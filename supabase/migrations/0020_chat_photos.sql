-- =============================================================================
-- 0020_chat_photos.sql — photo messages in game chat
--
-- messages gains image_url; a message is now text, a photo, or both (but never
-- neither). Photos live in a `chat-photos` storage bucket.
--
-- Privacy trade-off, stated plainly: the bucket is PUBLIC (like avatars) with
-- unguessable per-user/timestamped paths. Who sees the *message* is enforced by
-- messages RLS (participants only); the image file itself is protected only by
-- its unguessable URL. That matches the avatars precedent and keeps rendering
-- simple (no signed-URL churn). If chat photos ever need hard privacy, move to
-- a private bucket + signed URLs.
-- =============================================================================

alter table public.messages
  add column if not exists image_url text
    check (image_url is null or char_length(image_url) <= 500);

alter table public.messages alter column body drop not null;

alter table public.messages drop constraint if exists messages_body_check;

alter table public.messages add constraint messages_body_or_image_check
  check (
    (body is not null and char_length(body) between 1 and 2000)
    or (body is null and image_url is not null)
  );

-- ---------------------------------------------------------------------------
-- Storage: chat-photos bucket (public read; write only to your own folder)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('chat-photos', 'chat-photos', true)
on conflict (id) do nothing;

create policy chat_photos_read on storage.objects
  for select using (bucket_id = 'chat-photos');

create policy chat_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy chat_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
