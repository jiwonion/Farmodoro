begin;

create or replace function public.get_my_farm_mail_contacts()
returns table (
  farm_code text,
  display_name text,
  last_sent_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select contacts.farm_code, contacts.display_name, contacts.last_sent_at
  from (
    select distinct on (mails.recipient_user_id)
      profiles.farm_code,
      coalesce(nullif(btrim(profiles.display_name), ''), '농부') as display_name,
      mails.sent_at as last_sent_at
    from public.farm_mail as mails
    join public.profiles as profiles on profiles.id = mails.recipient_user_id
    where mails.sender_user_id = auth.uid()
      and mails.mail_type = 'gift'
    order by mails.recipient_user_id, mails.sent_at desc
  ) as contacts
  order by contacts.last_sent_at desc
  limit 30;
$$;

revoke all on function public.get_my_farm_mail_contacts() from public, anon;
grant execute on function public.get_my_farm_mail_contacts() to authenticated;

comment on function public.get_my_farm_mail_contacts() is
  'Returns distinct recipients the authenticated farmer has previously mailed';

commit;
