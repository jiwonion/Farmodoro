begin;

-- Legacy systems are retired by access revocation, not physical deletion.
-- Original rows remain private for recovery, alongside per-user settlement
-- evidence. Migration execution does not delete legacy rows or drop tables.
create table if not exists public.farm_legacy_settlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version integer not null default 1 check(version=1),
  coin_refund bigint not null check(coin_refund>=0),
  farm_money_refund bigint not null check(farm_money_refund>=0),
  settled_at timestamptz not null default now(),
  items jsonb not null check(jsonb_typeof(items)='array'),
  source_data jsonb not null check(jsonb_typeof(source_data)='object')
);
create table if not exists public.farm_legacy_retirement_meta (
  version integer primary key check(version=1), retired_at timestamptz not null default now()
);
create table if not exists public.farm_legacy_pass_refunds (
  user_id uuid not null references auth.users(id) on delete cascade,
  refund_key text not null,
  amount bigint not null check(amount>0),
  refunded_at timestamptz not null default now(),
  primary key(user_id,refund_key)
);
create table if not exists public.farm_legacy_pass_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  refund_key text not null, amount bigint not null check(amount>0),
  source_data jsonb not null, primary key(user_id,refund_key)
);
alter table public.farm_legacy_settlements enable row level security;
alter table public.farm_legacy_retirement_meta enable row level security;
alter table public.farm_legacy_pass_refunds enable row level security;
alter table public.farm_legacy_pass_entitlements enable row level security;
revoke all on public.farm_legacy_settlements,public.farm_legacy_retirement_meta,
  public.farm_legacy_pass_refunds,public.farm_legacy_pass_entitlements from public,anon,authenticated;

create or replace function public.ensure_farm_user(p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  insert into public.farm_wallets(user_id) values(p_user_id) on conflict do nothing;
  insert into public.farms(user_id) values(p_user_id) on conflict do nothing;
  insert into public.farm_weekly_earnings(user_id,week_start)
  values(p_user_id,public.current_farm_week_start()) on conflict do nothing;
end;
$$;
revoke all on function public.ensure_farm_user(uuid) from public,anon,authenticated;

create or replace function public.run_farm_lifecycle()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.cleanup_stale_wallet_idempotency();
  perform public.cleanup_stale_farm_actions();
end;
$$;
revoke all on function public.run_farm_lifecycle() from public,anon,authenticated;

create or replace function public.get_my_farm_state()
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid:=auth.uid(); result jsonb;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);
  perform public.run_farm_lifecycle();
  select jsonb_build_object(
    'farm',jsonb_build_object('farmName',f.farm_name,'equippedFarmTheme',f.equipped_farm_theme),
    'ownedCosmetics',coalesce((select jsonb_agg(jsonb_build_object('type',c.cosmetic_type,'id',c.cosmetic_id)
      order by c.cosmetic_id) from public.farm_cosmetics c where c.user_id=current_user_id and c.cosmetic_type='farm_theme'),'[]'::jsonb),
    'weeklyFarmMoneyEarned',coalesce((select e.earned_farm_money from public.farm_weekly_earnings e
      where e.user_id=current_user_id and e.week_start=public.current_farm_week_start()),0),
    'legacySettlement',(select jsonb_build_object('version',s.version,'coinRefund',s.coin_refund,
      'farmMoneyRefund',s.farm_money_refund,'settledAt',s.settled_at,'items',s.items)
      from public.farm_legacy_settlements s where s.user_id=current_user_id)
  ) into result from public.farms f where f.user_id=current_user_id;
  return result;
end;
$$;
revoke all on function public.get_my_farm_state() from public,anon;
grant execute on function public.get_my_farm_state() to authenticated;

-- Keep original theme ownership and all old skin rows, but only themes can
-- be bought/equipped by the active application. Catalog prices stay canonical.
create or replace function public.purchase_farm_cosmetic(p_cosmetic_type text,p_cosmetic_id text,p_price integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid:=auth.uid(); catalog_price integer; new_balance bigint;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_cosmetic_type is distinct from 'farm_theme' then raise exception 'Unsupported cosmetic type'; end if;
  select price into catalog_price from public.farm_cosmetic_catalog
    where cosmetic_type='farm_theme' and cosmetic_id=p_cosmetic_id;
  if not found then raise exception 'FARM_UNKNOWN_COSMETIC'; end if;
  if p_price is distinct from catalog_price then raise exception 'FARM_COSMETIC_PRICE_CHANGED'; end if;
  perform public.ensure_farm_user(current_user_id);
  perform public.lock_my_farm_actions(current_user_id);
  perform 1 from public.farms where user_id=current_user_id for update;
  if exists(select 1 from public.farm_cosmetics where user_id=current_user_id
    and cosmetic_type='farm_theme' and cosmetic_id=p_cosmetic_id) then raise exception 'Cosmetic already owned'; end if;
  new_balance:=public.apply_farm_wallet_change(current_user_id,'farm_money',-catalog_price::bigint,
    '풍경 테마 구매','cosmetic:farm_theme:'||p_cosmetic_id);
  insert into public.farm_cosmetics(user_id,cosmetic_type,cosmetic_id) values(current_user_id,'farm_theme',p_cosmetic_id);
  update public.farms set equipped_farm_theme=p_cosmetic_id where user_id=current_user_id;
  return jsonb_build_object('farmMoneyBalance',new_balance);
end;
$$;
revoke all on function public.purchase_farm_cosmetic(text,text,integer) from public,anon;
grant execute on function public.purchase_farm_cosmetic(text,text,integer) to authenticated;

create or replace function public.equip_farm_cosmetic(p_cosmetic_type text,p_cosmetic_id text)
returns void language plpgsql security definer set search_path='' as $$
declare current_user_id uuid:=auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_cosmetic_type is distinct from 'farm_theme' then raise exception 'Unsupported cosmetic type'; end if;
  perform public.ensure_farm_user(current_user_id);
  perform public.lock_my_farm_actions(current_user_id);
  if p_cosmetic_id is not null and not exists(select 1 from public.farm_cosmetics c
    join public.farm_cosmetic_catalog catalog on catalog.cosmetic_type=c.cosmetic_type and catalog.cosmetic_id=c.cosmetic_id
    where c.user_id=current_user_id and c.cosmetic_type='farm_theme' and c.cosmetic_id=p_cosmetic_id)
    then raise exception 'Cosmetic not owned'; end if;
  update public.farms set equipped_farm_theme=p_cosmetic_id where user_id=current_user_id;
end;
$$;
revoke all on function public.equip_farm_cosmetic(text,text) from public,anon;
grant execute on function public.equip_farm_cosmetic(text,text) to authenticated;

-- Resolve every positive asset against the authoritative legacy catalogs.
-- Unrevealed ranking boxes already contain their chosen harvest ID. Missing
-- IDs/catalog rows fail the whole transaction rather than hiding unpaid value.
do $settlement$
declare account record; valuation jsonb; summary_items jsonb; original_data jsonb;
  coin_refund bigint; money_refund bigint; new_balance bigint;
begin
  lock table public.farm_legacy_retirement_meta in share row exclusive mode;
  if exists(select 1 from public.farm_legacy_retirement_meta where version=1) then return; end if;
  lock table public.tasks,public.habit_daily_records in share row exclusive mode;
  lock table public.farm_wallets,public.farms,public.farm_cosmetics in share row exclusive mode;
  lock table public.farm_inventory,public.farm_plots,public.farm_mail,public.farm_mail_items
    in access exclusive mode;
  -- Freeze eligible completion cycles before clients can edit their old flags.
  -- This is a finite entitlement set, not a trusted client supplied boolean.
  if exists(select 1 from public.tasks where status='done' and completed_with_free_pass)
    or exists(select 1 from public.habit_daily_records where completed_at is not null and completed_with_free_pass) then
    if not exists(select 1 from public.farm_supply_catalog where item_id='freePass' and price>0) then
      raise exception 'LEGACY_PASS_PRICE_MISSING';
    end if;
    insert into public.farm_legacy_pass_entitlements(user_id,refund_key,amount,source_data)
      select t.user_id,'task:'||t.id||':'||coalesce(t.completion_cycle_id::text,'legacy'),s.price,to_jsonb(t)
      from public.tasks t cross join public.farm_supply_catalog s
      where t.status='done' and t.completed_with_free_pass and s.item_id='freePass'
      union all
      select h.user_id,'habit:'||r.habit_id||':'||r.record_date||':'||coalesce(r.completion_cycle_id::text,'legacy'),s.price,to_jsonb(r)
      from public.habit_daily_records r join public.habits h on h.id=r.habit_id cross join public.farm_supply_catalog s
      where r.completed_at is not null and r.completed_with_free_pass and s.item_id='freePass'
      on conflict do nothing;
  end if;
  for account in select id from auth.users order by id loop
    if exists(select 1 from public.farm_legacy_settlements where user_id=account.id) then continue; end if;
    with assets as (
      select i.category,i.item_id,i.quantity::bigint,'inventory'::text source,
        jsonb_build_object('category',i.category,'itemId',i.item_id) source_id
      from public.farm_inventory i where i.user_id=account.id and i.quantity>0
      union all
      select i.category,i.item_id,i.quantity::bigint,'unclaimed_mail',to_jsonb(i.id)
      from public.farm_mail_items i join public.farm_mail m on m.id=i.mail_id
      where m.recipient_user_id=account.id and m.claimed_at is null and i.claimed_at is null and i.quantity>0
    ), prices as (
      select a.*,case a.category when 'seed' then c.seed_price::bigint
        when 'harvest' then c.seed_price::bigint+c.growth_cost
        when 'food' then r.sell_price::bigint when 'supply' then s.price::bigint end unit_price
      from assets a left join public.farm_crop_catalog c on c.crop_id=a.item_id
      left join public.farm_recipe_catalog r on r.recipe_id=a.item_id
      left join public.farm_supply_catalog s on s.item_id=a.item_id
    ), lines as (
      select jsonb_build_object('category',category,'itemId',item_id,'quantity',quantity,
        'currency',case when category='seed' then 'coin' else 'farm_money' end,
        'amount',quantity*unit_price,'unitPrice',unit_price,'source',source,'sourceId',source_id) line from prices
      union all
      select jsonb_build_object('category','planted','itemId',p.crop_id,'quantity',1,'currency','coin',
        'amount',c.seed_price::bigint+greatest(p.growth,0),'unitPrice',c.seed_price,
        'growth',p.growth,'source','plot','sourceId',p.plot_index)
      from public.farm_plots p left join public.farm_crop_catalog c on c.crop_id=p.crop_id
      where p.user_id=account.id and p.crop_id is not null
      union all
      select jsonb_build_object('category','plot_skin','itemId',split_part(l.reference_key,':',3),
        'quantity',1,'currency','farm_money','amount',-l.amount,'source','wallet_ledger','sourceId',l.id)
      from public.farm_wallet_ledger l where l.user_id=account.id and l.currency='farm_money'
        and l.amount<0 and l.reference_key like 'cosmetic:plot_skin:%'
    ) select coalesce(jsonb_agg(line),'[]'::jsonb) into valuation from lines;
    if exists(select 1 from jsonb_array_elements(valuation) x where x->>'amount' is null
      or nullif(x->>'itemId','') is null or (x->>'amount')::numeric<0) then
      raise exception 'LEGACY_SETTLEMENT_UNVALUED_ASSET user=%',account.id;
    end if;
    select coalesce(sum((x->>'amount')::bigint) filter(where x->>'currency'='coin'),0),
      coalesce(sum((x->>'amount')::bigint) filter(where x->>'currency'='farm_money'),0)
      into coin_refund,money_refund from jsonb_array_elements(valuation) x;
    select coalesce(jsonb_agg(jsonb_build_object('category',category,'itemId',item_id,
      'quantity',quantity,'currency',currency,'amount',amount) order by category,item_id,currency),'[]'::jsonb)
      into summary_items from (
        select x->>'category' category,x->>'itemId' item_id,x->>'currency' currency,
          sum((x->>'quantity')::bigint) quantity,sum((x->>'amount')::bigint) amount
        from jsonb_array_elements(valuation) x group by 1,2,3
      ) grouped;
    original_data:=jsonb_build_object(
      'farm',(select to_jsonb(f) from public.farms f where f.user_id=account.id),
      'wallet',(select to_jsonb(w) from public.farm_wallets w where w.user_id=account.id),
      'weeklyEarnings',coalesce((select jsonb_agg(to_jsonb(e)) from public.farm_weekly_earnings e where e.user_id=account.id),'[]'::jsonb),
      'inventory',coalesce((select jsonb_agg(to_jsonb(i)) from public.farm_inventory i where i.user_id=account.id),'[]'::jsonb),
      'plots',coalesce((select jsonb_agg(to_jsonb(p)) from public.farm_plots p where p.user_id=account.id),'[]'::jsonb),
      'mail',coalesce((select jsonb_agg(to_jsonb(m)) from public.farm_mail m
        where m.recipient_user_id=account.id),'[]'::jsonb),
      'mailItems',coalesce((select jsonb_agg(to_jsonb(i)) from public.farm_mail_items i join public.farm_mail m on m.id=i.mail_id
        where m.recipient_user_id=account.id),'[]'::jsonb),
      'cosmetics',coalesce((select jsonb_agg(to_jsonb(c)) from public.farm_cosmetics c where c.user_id=account.id),'[]'::jsonb),
      'skinPayments',coalesce((select jsonb_agg(to_jsonb(l)) from public.farm_wallet_ledger l where l.user_id=account.id
        and l.currency='farm_money' and l.amount<0 and l.reference_key like 'cosmetic:plot_skin:%'),'[]'::jsonb),
      'weeklyRewards',coalesce((select jsonb_agg(to_jsonb(r)) from public.farm_weekly_rewards r where r.user_id=account.id),'[]'::jsonb),
      'valuationLines',valuation);
    perform public.ensure_farm_user(account.id);
    insert into public.farm_legacy_settlements(user_id,coin_refund,farm_money_refund,items,source_data)
      values(account.id,coin_refund,money_refund,summary_items,original_data);
    -- Direct settlement credits have no per-action cap and never add ranking
    -- income. The permanent settlement row, not a 24h cache, guards retries.
    if coin_refund>0 then
      update public.farm_wallets set coin_balance=coin_balance+coin_refund where user_id=account.id
        returning coin_balance into new_balance;
      insert into public.farm_wallet_ledger(user_id,currency,amount,balance_after,reason,reference_key)
        values(account.id,'coin',coin_refund,new_balance,'Legacy asset settlement','legacy-settlement-089:coin');
    end if;
    if money_refund>0 then
      update public.farm_wallets set farm_money_balance=farm_money_balance+money_refund where user_id=account.id
        returning farm_money_balance into new_balance;
      insert into public.farm_wallet_ledger(user_id,currency,amount,balance_after,reason,reference_key)
        values(account.id,'farm_money',money_refund,new_balance,'Legacy asset settlement','legacy-settlement-089:farm_money');
    end if;
  end loop;
  insert into public.farm_legacy_retirement_meta(version) values(1);
end;
$settlement$;

-- Only the user's explicit account-deletion RPC performs this deletion.
-- Remove sent message copies from recipients' private audit snapshots as well
-- as originals, preserving settlement amounts and non-identifying valuations.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path='' as $$
declare current_user_id uuid:=auth.uid(); saved record; sent_mail_ids text[]; kept_mail jsonb; kept_items jsonb;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  for saved in select user_id,source_data from public.farm_legacy_settlements
    where user_id<>current_user_id and exists(select 1 from jsonb_array_elements(source_data->'mail') m
      where m->>'sender_user_id'=current_user_id::text) for update loop
    select array_agg(m->>'id') into sent_mail_ids from jsonb_array_elements(saved.source_data->'mail') m
      where m->>'sender_user_id'=current_user_id::text;
    select coalesce(jsonb_agg(m),'[]'::jsonb) into kept_mail from jsonb_array_elements(saved.source_data->'mail') m
      where not(m->>'id'=any(sent_mail_ids));
    select coalesce(jsonb_agg(i),'[]'::jsonb) into kept_items from jsonb_array_elements(saved.source_data->'mailItems') i
      where not(i->>'mail_id'=any(sent_mail_ids));
    update public.farm_legacy_settlements set source_data=jsonb_set(jsonb_set(saved.source_data,'{mail}',kept_mail),'{mailItems}',kept_items)
      where user_id=saved.user_id;
  end loop;
  delete from public.farm_mail where sender_user_id=current_user_id;
  delete from auth.users where id=current_user_id;
  if not found then raise exception 'Account not found'; end if;
end;
$$;
revoke all on function public.delete_my_account() from public,anon;
grant execute on function public.delete_my_account() to authenticated;
-- Canceling a historical pass completion returns its value as Farm Money.
-- New completions cannot create pass metadata. A durable cycle journal guards
-- this credit even after ordinary wallet idempotency caches are cleaned.
create or replace function public.refund_retired_farm_pass(p_user_id uuid,p_refund_key text)
returns bigint language plpgsql security definer set search_path='' as $$
declare pass_price bigint; new_balance bigint;
begin
  select amount into pass_price from public.farm_legacy_pass_entitlements where user_id=p_user_id and refund_key=p_refund_key;
  if not found then return 0; end if;
  insert into public.farm_legacy_pass_refunds(user_id,refund_key,amount)
    values(p_user_id,p_refund_key,pass_price) on conflict do nothing;
  if not found then return 0; end if;
  update public.farm_wallets set farm_money_balance=farm_money_balance+pass_price where user_id=p_user_id
    returning farm_money_balance into new_balance;
  if not found then raise exception 'Wallet not found'; end if;
  insert into public.farm_wallet_ledger(user_id,currency,amount,balance_after,reason,reference_key)
    values(p_user_id,'farm_money',pass_price,new_balance,'Retired pass cancellation refund','legacy-pass-refund-089:'||p_refund_key);
  return pass_price;
end;
$$;
revoke all on function public.refund_retired_farm_pass(uuid,text) from public,anon,authenticated;

create or replace function public.complete_my_task(p_task_id uuid,p_used_free_pass boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid:=auth.uid(); task_row public.tasks%rowtype; coin_balance bigint; already_done boolean:=false;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  select * into task_row from public.tasks where id=p_task_id and user_id=current_user_id for update;
  if not found then raise exception 'Task not found'; end if;
  perform public.ensure_farm_user(current_user_id);
  if task_row.status='done' then already_done:=true;
  else
    update public.tasks set status='done',completed_on=public.productivity_today(),completion_reward=1,
      completed_with_free_pass=false,completion_cycle_id=gen_random_uuid() where id=p_task_id returning * into task_row;
    coin_balance:=public.apply_farm_wallet_change(current_user_id,'coin',1,'Task completion',
      'task:'||p_task_id||':'||task_row.completed_on||':complete:'||task_row.completion_cycle_id);
  end if;
  if coin_balance is null then select w.coin_balance into coin_balance from public.farm_wallets w where user_id=current_user_id; end if;
  return jsonb_build_object('alreadyDone',already_done,'status',task_row.status,'completedOn',task_row.completed_on,
    'completionReward',task_row.completion_reward,'completionCycleId',task_row.completion_cycle_id,'coinBalance',coin_balance);
end;
$$;

create or replace function public.complete_my_habit(p_habit_id uuid,p_record_date date,p_progress_value integer,p_used_free_pass boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid:=auth.uid(); record_row public.habit_daily_records%rowtype; coin_balance bigint; already_done boolean:=false;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.habits where id=p_habit_id and user_id=current_user_id) then raise exception 'Habit not found'; end if;
  insert into public.habit_daily_records(habit_id,record_date,progress_value)
    values(p_habit_id,p_record_date,greatest(0,coalesce(p_progress_value,0))) on conflict do nothing;
  select * into record_row from public.habit_daily_records where habit_id=p_habit_id and record_date=p_record_date for update;
  perform public.ensure_farm_user(current_user_id);
  if record_row.completed_at is not null then already_done:=true;
  else
    update public.habit_daily_records set progress_value=greatest(0,coalesce(p_progress_value,progress_value)),
      completed_at=now(),completion_reward=1,completed_with_free_pass=false,completion_cycle_id=gen_random_uuid()
      where habit_id=p_habit_id and record_date=p_record_date returning * into record_row;
    coin_balance:=public.apply_farm_wallet_change(current_user_id,'coin',1,'Habit completion',
      'habit:'||p_habit_id||':'||p_record_date||':complete:'||record_row.completion_cycle_id);
  end if;
  if coin_balance is null then select w.coin_balance into coin_balance from public.farm_wallets w where user_id=current_user_id; end if;
  return jsonb_build_object('alreadyDone',already_done,'progressValue',record_row.progress_value,'completedAt',record_row.completed_at,
    'completionReward',record_row.completion_reward,'completionCycleId',record_row.completion_cycle_id,'coinBalance',coin_balance);
end;
$$;

create or replace function public.uncomplete_my_task(p_task_id uuid,p_next_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid:=auth.uid(); task_row public.tasks%rowtype; reversal integer; coin_balance bigint;
  money_balance bigint; pass_refund bigint:=0; already_undone boolean:=false;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_next_status is null or p_next_status not in ('waiting','doing') then raise exception 'Unsupported status'; end if;
  select * into task_row from public.tasks where id=p_task_id and user_id=current_user_id for update;
  if not found then raise exception 'Task not found'; end if;
  perform public.ensure_farm_user(current_user_id);
  pass_refund:=public.refund_retired_farm_pass(current_user_id,'task:'||p_task_id||':'||coalesce(task_row.completion_cycle_id::text,'legacy'));
  if task_row.status<>'done' then already_undone:=true;
  else
    reversal:=greatest(0,coalesce(task_row.completion_reward,1));
    if reversal>0 then
      coin_balance:=public.apply_farm_wallet_change(current_user_id,'coin',-reversal,'Task completion cancellation',
        'task:'||p_task_id||':'||coalesce(task_row.completed_on::text,'legacy')||':undo:'||coalesce(task_row.completion_cycle_id::text,'legacy'));
    end if;
    update public.tasks set status=p_next_status,completed_on=null,completion_reward=0,
      completed_with_free_pass=false,archived_at=null where id=p_task_id returning * into task_row;
  end if;
  select w.coin_balance,w.farm_money_balance into coin_balance,money_balance from public.farm_wallets w where user_id=current_user_id;
  return jsonb_build_object('alreadyUndone',already_undone,'status',task_row.status,'coinBalance',coin_balance,
    'farmMoneyBalance',money_balance,'legacyPassRefundAmount',pass_refund);
end;
$$;

create or replace function public.uncomplete_my_habit(p_habit_id uuid,p_record_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid:=auth.uid(); record_row public.habit_daily_records%rowtype; reversal integer; coin_balance bigint;
  money_balance bigint; pass_refund bigint:=0; already_undone boolean:=false; had_free_pass boolean:=false;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.habits where id=p_habit_id and user_id=current_user_id) then raise exception 'Habit not found'; end if;
  select * into record_row from public.habit_daily_records where habit_id=p_habit_id and record_date=p_record_date for update;
  perform public.ensure_farm_user(current_user_id);
  pass_refund:=public.refund_retired_farm_pass(current_user_id,'habit:'||p_habit_id||':'||p_record_date||':'||coalesce(record_row.completion_cycle_id::text,'legacy'));
  if record_row.completed_at is null then already_undone:=true;
  else
    had_free_pass:=coalesce(record_row.completed_with_free_pass,false);
    reversal:=greatest(0,coalesce(record_row.completion_reward,1));
    if reversal>0 then
      coin_balance:=public.apply_farm_wallet_change(current_user_id,'coin',-reversal,'Habit completion cancellation',
        'habit:'||p_habit_id||':'||p_record_date||':undo:'||coalesce(record_row.completion_cycle_id::text,'legacy'));
    end if;
    update public.habit_daily_records set completed_at=null,completion_reward=0,completed_with_free_pass=false
      where habit_id=p_habit_id and record_date=p_record_date returning * into record_row;
  end if;
  select w.coin_balance,w.farm_money_balance into coin_balance,money_balance from public.farm_wallets w where user_id=current_user_id;
  return jsonb_build_object('alreadyUndone',already_undone,'progressValue',coalesce(record_row.progress_value,0),
    'hadFreePass',had_free_pass,'coinBalance',coin_balance,'farmMoneyBalance',money_balance,'legacyPassRefundAmount',pass_refund);
end;
$$;
revoke all on function public.complete_my_task(uuid,boolean),public.complete_my_habit(uuid,date,integer,boolean),
  public.uncomplete_my_task(uuid,text),public.uncomplete_my_habit(uuid,date) from public,anon;
grant execute on function public.complete_my_task(uuid,boolean),public.complete_my_habit(uuid,date,integer,boolean),
  public.uncomplete_my_task(uuid,text),public.uncomplete_my_habit(uuid,date) to authenticated;

create or replace function public.record_my_focus_time(p_event_id uuid,p_focus_mode text,p_elapsed_seconds integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid:=auth.uid(); progress_row public.user_focus_progress%rowtype;
  combined_seconds integer; next_event_ids uuid[]; awarded_coins integer:=0; coin_balance bigint;
  accepted_event boolean:=false; today date:=(now() at time zone 'Asia/Seoul')::date;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_event_id is null then raise exception 'Focus event id is required'; end if;
  if p_focus_mode is null or p_focus_mode not in ('linked','quick') then raise exception 'Unsupported focus mode'; end if;
  if p_elapsed_seconds is null or p_elapsed_seconds not between 1 and 600 then raise exception 'Elapsed focus seconds must be between 1 and 600'; end if;
  perform public.ensure_farm_user(current_user_id);
  insert into public.user_focus_progress(user_id) values(current_user_id) on conflict do nothing;
  select * into progress_row from public.user_focus_progress where user_id=current_user_id for update;
  if not(p_event_id=any(progress_row.recent_event_ids)) then
    accepted_event:=true;
    combined_seconds:=progress_row.progress_seconds+p_elapsed_seconds;
    awarded_coins:=combined_seconds/3600;
    next_event_ids:=array_append(progress_row.recent_event_ids,p_event_id);
    if cardinality(next_event_ids)>128 then next_event_ids:=next_event_ids[cardinality(next_event_ids)-127:cardinality(next_event_ids)]; end if;
    update public.user_focus_progress set progress_seconds=combined_seconds%3600,recent_event_ids=next_event_ids,
      daily_focus_seconds=case when daily_focus_date=today then daily_focus_seconds+p_elapsed_seconds else p_elapsed_seconds end,
      daily_focus_date=today,updated_at=now() where user_id=current_user_id returning * into progress_row;
    if awarded_coins>0 then
      update public.farm_wallets w set coin_balance=w.coin_balance+awarded_coins where w.user_id=current_user_id returning w.coin_balance into coin_balance;
      insert into public.farm_wallet_ledger(user_id,currency,amount,balance_after,reason,reference_key)
        values(current_user_id,'coin',awarded_coins,coin_balance,'Focus time reward',null);
    end if;
  end if;
  if coin_balance is null then select w.coin_balance into coin_balance from public.farm_wallets w where user_id=current_user_id; end if;
  return jsonb_build_object('progressSeconds',progress_row.progress_seconds,'coinBalance',coin_balance,
    'awardedCoins',awarded_coins,'accepted',accepted_event,'event',jsonb_build_object('bonuses','[]'::jsonb));
end;
$$;
revoke all on function public.record_my_focus_time(uuid,text,integer) from public,anon;
grant execute on function public.record_my_focus_time(uuid,text,integer) to authenticated;

-- Retain 079's active leaderboard contract and its deterministic tie order.
-- No retired nameplate/equipment information is returned.
create or replace function public.get_farm_leaderboard(p_week_start date default null)
returns table(rank_position bigint,display_name text,avatar_url text,farm_name text,
  earned_farm_money bigint,is_me boolean,farm_code text)
language sql stable security definer set search_path='' as $$
  select row_number() over(order by e.earned_farm_money desc,e.updated_at,e.user_id),
    p.display_name,p.avatar_url,f.farm_name,e.earned_farm_money,e.user_id=auth.uid(),p.farm_code
  from public.farm_weekly_earnings e join public.profiles p on p.id=e.user_id
  join public.farms f on f.user_id=e.user_id
  where e.week_start=coalesce(p_week_start,public.current_farm_week_start())
  order by 1 limit 100;
$$;
revoke all on function public.get_farm_leaderboard(date) from public,anon;
grant execute on function public.get_farm_leaderboard(date) to authenticated;
-- Timers remain available; watering notifications can no longer be queued.
update public.scheduled_push_notifications set sent_at=coalesce(sent_at,now()) where kind='plot_water_ready';
create or replace function public.schedule_my_push_notification(p_kind text,p_subject_key text,p_fire_at timestamptz,p_title text,p_body text)
returns void language plpgsql security definer set search_path='' as $$
declare current_user_id uuid:=auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_kind is distinct from 'timer_end' then raise exception 'Unsupported notification kind'; end if;
  if p_fire_at is null or p_fire_at<=now() then raise exception 'Invalid fire time'; end if;
  if char_length(coalesce(p_title,'')) not between 1 and 60 then raise exception 'Invalid notification title'; end if;
  if char_length(coalesce(p_body,'')) not between 1 and 120 then raise exception 'Invalid notification body'; end if;
  insert into public.scheduled_push_notifications(user_id,kind,subject_key,fire_at,title,body)
    values(current_user_id,p_kind,coalesce(p_subject_key,''),p_fire_at,p_title,p_body)
    on conflict(user_id,kind,subject_key) do update set fire_at=excluded.fire_at,title=excluded.title,body=excluded.body,sent_at=null;
end;
$$;
revoke all on function public.schedule_my_push_notification(text,text,timestamptz,text,text) from public,anon;
grant execute on function public.schedule_my_push_notification(text,text,timestamptz,text,text) to authenticated;

-- Revoke every historical overload, including PUBLIC's default EXECUTE grant.
-- References remain private for recovery and for explicit account deletion.
do $retired_apis$
declare retired record;
begin
  for retired in select p.oid::regprocedure signature from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (
      p.proname like '%farm_mail%' or p.proname like '%farm_update_mail%' or p.proname like '%bulletin%'
      or p.proname ~ '^(get_my_farm_state_v[0-9]+|save_my_farm_state(_v[0-9]+)?)$'
      or p.proname=any(array['is_farm_admin','broadcast_farm_update_mail','finalize_previous_farm_week',
        'cleanup_expired_farm_mail','get_farm_catalog','buy_farm_seed','buy_and_plant_farm_seed','plant_farm_seed',
        'water_farm_plot','grow_farm_plot_with_coin','harvest_farm_plot','discard_farm_plot','cook_farm_recipe',
        'cook_my_farm_recipe','sell_farm_food','sell_all_my_farm_food','sell_farm_crop_bundle','buy_farm_supply',
        'apply_farm_plot_item','use_farm_market_refresh','use_farm_festival_pass','use_farm_free_pass',
        'farm_plot_json','farm_plot_max_growth','refresh_farm_wilt','reset_farm_plot_focus_growth','farm_focus_json',
        'select_my_focus_farm_plot','farm_market_rotation_json','ensure_farm_market_rotation','apply_farm_inventory_delta',
        'farm_set_bonus_percent','farm_set_effect_triggers','record_my_focus_time_v2','change_my_farm_wallet',
        'get_my_daily_focus_progress','record_my_daily_focus_time']))
  loop
    execute format('revoke all on function %s from public,anon,authenticated',retired.signature);
    if has_function_privilege('anon',retired.signature,'execute')
      or has_function_privilege('authenticated',retired.signature,'execute') then
      raise exception 'LEGACY_RPC_GRANT_REMAINS signature=%',retired.signature;
    end if;
  end loop;
end;
$retired_apis$;

do $retired_tables$
declare table_name text; table_oid oid; column_name text;
begin
  foreach table_name in array array['farm_inventory','farm_plots','farm_mail','farm_mail_items','farm_weekly_rewards',
    'farm_market_rotations','farm_recipe_discoveries','farm_recipe_ingredients','farm_recipe_catalog','farm_crop_catalog',
    'farm_supply_catalog','farm_cosmetic_sets','farm_cosmetic_set_members','farm_catalog_meta','farm_admins',
    'farm_admin_broadcasts','farm_update_mail_deliveries','farm_bulletin_posts','farm_bulletin_comments',
    'user_focus_daily','user_focus_daily_events'] loop
    table_oid:=to_regclass(format('public.%I',table_name));
    if table_oid is null then continue; end if;
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on table public.%I from public,anon,authenticated',table_name);
    -- Also deny reads through any separately inherited reader-role grant.
    if not exists(select 1 from pg_catalog.pg_policy where polrelid=table_oid and polname='Legacy retirement is private') then
      execute format('create policy "Legacy retirement is private" on public.%I as restrictive for all to public using(false) with check(false)',table_name);
    end if;
    -- Column-level grants are independent of table grants.
    for column_name in select attname from pg_catalog.pg_attribute where attrelid=table_oid and attnum>0 and not attisdropped loop
      execute format('revoke select(%I),insert(%I),update(%I),references(%I) on public.%I from public,anon,authenticated',
        column_name,column_name,column_name,column_name,table_name);
    end loop;
    if exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime'
      and schemaname='public' and tablename=table_name) then
      execute format('alter publication supabase_realtime drop table public.%I',table_name);
    end if;
  end loop;
end;
$retired_tables$;

-- Cosmetic tables still contain old ownership/catalog evidence. Restrictive
-- policies intersect existing read policies, so old permissive policies cannot
-- expose skins. Clients cannot alter ownership directly.
do $theme_policies$
declare table_name text; column_name text;
begin
  foreach table_name in array array['farm_cosmetics','farm_cosmetic_catalog'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on table public.%I from public,anon,authenticated',table_name);
    for column_name in select attname from pg_catalog.pg_attribute
      where attrelid=to_regclass(format('public.%I',table_name)) and attnum>0 and not attisdropped loop
      execute format('revoke select(%I),insert(%I),update(%I),references(%I) on public.%I from public,anon,authenticated',
        column_name,column_name,column_name,column_name,table_name);
    end loop;
    execute format('grant select on table public.%I to authenticated',table_name);
    if not exists(select 1 from pg_catalog.pg_policy where polrelid=to_regclass(format('public.%I',table_name))
      and polname='Only active farm themes') then
      execute format('create policy "Only active farm themes" on public.%I as restrictive for select to public using(cosmetic_type=''farm_theme''%s)',
        table_name,case when table_name='farm_cosmetics' then ' and user_id=auth.uid()' else '' end);
    end if;
  end loop;
end;
$theme_policies$;
revoke all on table public.farms from public,anon,authenticated;
do $farm_columns$
declare column_name text;
begin
  for column_name in select attname from pg_catalog.pg_attribute
    where attrelid='public.farms'::regclass and attnum>0 and not attisdropped loop
    execute format('revoke select(%I),insert(%I),update(%I),references(%I) on public.farms from public,anon,authenticated',
      column_name,column_name,column_name,column_name);
  end loop;
end;
$farm_columns$;
grant select(user_id,farm_name,equipped_farm_theme,created_at,updated_at) on public.farms to authenticated;
do $farm_column_access_check$
declare role_name text; column_name text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    for column_name in select attname from pg_catalog.pg_attribute where attrelid='public.farms'::regclass
      and attnum>0 and not attisdropped and attname not in ('user_id','farm_name','equipped_farm_theme','created_at','updated_at') loop
      if has_column_privilege(role_name,'public.farms',column_name,'select') then
        raise exception 'LEGACY_FARM_COLUMN_GRANT_REMAINS role=% column=%',role_name,column_name;
      end if;
    end loop;
  end loop;
end;
$farm_column_access_check$;
-- Keep focus progress readable while withholding the retired field target.
revoke all on table public.user_focus_progress from public,anon,authenticated;
do $focus_columns$
declare column_name text;
begin
  for column_name in select attname from pg_catalog.pg_attribute
    where attrelid='public.user_focus_progress'::regclass and attnum>0 and not attisdropped loop
    execute format('revoke select(%I),insert(%I),update(%I),references(%I) on public.user_focus_progress from public,anon,authenticated',
      column_name,column_name,column_name,column_name);
  end loop;
  if has_column_privilege('anon','public.user_focus_progress','focus_plot_index','select')
    or has_column_privilege('authenticated','public.user_focus_progress','focus_plot_index','select') then
    raise exception 'LEGACY_FOCUS_COLUMN_GRANT_REMAINS';
  end if;
end;
$focus_columns$;
grant select(user_id,progress_seconds,recent_event_ids,updated_at,daily_focus_date,daily_focus_seconds)
  on public.user_focus_progress to authenticated;
revoke all on table public.scheduled_push_notifications from public,anon,authenticated;

commit;
