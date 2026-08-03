begin;

create or replace function public.get_my_unclaimed_farm_mail_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.farm_mail_items as items
  join public.farm_mail as mails on mails.id = items.mail_id
  where mails.recipient_user_id = auth.uid()
    and mails.expires_at > now()
    and items.claimed_at is null;
$$;

revoke all on function public.get_my_unclaimed_farm_mail_count() from public, anon;
grant execute on function public.get_my_unclaimed_farm_mail_count() to authenticated;

comment on function public.get_my_unclaimed_farm_mail_count() is
  'Returns the authenticated farmer unclaimed, unexpired mail item count';

commit;
