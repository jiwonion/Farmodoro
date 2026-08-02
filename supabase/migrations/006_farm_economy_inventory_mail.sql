-- Farmodoro farm economy, plots, inventory, recipes, weekly ranking, and mail.
-- Run after 001_profiles.sql and 005_tasks_and_habits.sql.

create table if not exists public.farm_wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  coin_balance bigint not null default 0,
  farm_money_balance bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint farm_wallets_coin_nonnegative check (coin_balance >= 0),
  constraint farm_wallets_farm_money_nonnegative check (farm_money_balance >= 0)
);

create table if not exists public.farm_wallet_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  currency text not null,
  amount bigint not null,
  balance_after bigint not null,
  reason text not null,
  reference_key text,
  created_at timestamptz not null default now(),
  constraint farm_wallet_ledger_currency_value
    check (currency in ('coin', 'farm_money')),
  constraint farm_wallet_ledger_amount_nonzero check (amount <> 0),
  constraint farm_wallet_ledger_balance_nonnegative check (balance_after >= 0),
  constraint farm_wallet_ledger_reason_length
    check (char_length(btrim(reason)) between 1 and 80)
);

create table if not exists public.farm_weekly_earnings (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  earned_farm_money bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start),
  constraint farm_weekly_earnings_monday
    check (extract(isodow from week_start) = 1),
  constraint farm_weekly_earnings_nonnegative
    check (earned_farm_money >= 0)
);

create table if not exists public.farms (
  user_id uuid primary key references auth.users (id) on delete cascade,
  farm_name text not null default '햇살 밭',
  production_boost_until timestamptz,
  wilt_protection_until timestamptz,
  waste_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint farms_name_length
    check (char_length(btrim(farm_name)) between 1 and 30),
  constraint farms_waste_count_nonnegative check (waste_count >= 0)
);

create table if not exists public.farm_plots (
  user_id uuid not null references auth.users (id) on delete cascade,
  plot_index smallint not null,
  crop_id text,
  growth smallint not null default 0,
  planted_on date,
  last_watered_on date,
  last_free_water_at timestamptz,
  wilted boolean not null default false,
  fertilizer_id text,
  updated_at timestamptz not null default now(),
  primary key (user_id, plot_index),
  constraint farm_plots_index_range check (plot_index between 0 and 15),
  constraint farm_plots_crop_id_format
    check (crop_id is null or crop_id ~ '^[A-Za-z][A-Za-z0-9]{0,49}$'),
  constraint farm_plots_growth_nonnegative check (growth >= 0),
  constraint farm_plots_fertilizer_value
    check (
      fertilizer_id is null
      or fertilizer_id in (
        'luckyFertilizer',
        'moistureFertilizer',
        'premiumFertilizer'
      )
    ),
  constraint farm_plots_empty_state
    check (
      crop_id is not null
      or (
        growth = 0
        and planted_on is null
        and last_watered_on is null
        and wilted = false
        and fertilizer_id is null
      )
    )
);

create table if not exists public.farm_inventory (
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null,
  item_id text not null,
  quantity integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, category, item_id),
  constraint farm_inventory_category_value
    check (category in ('seed', 'harvest', 'supply', 'food')),
  constraint farm_inventory_item_id_format
    check (item_id ~ '^[A-Za-z][A-Za-z0-9]{0,79}$'),
  constraint farm_inventory_quantity_nonnegative check (quantity >= 0)
);

create table if not exists public.farm_recipe_discoveries (
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id text not null,
  discovered_at timestamptz not null default now(),
  primary key (user_id, recipe_id),
  constraint farm_recipe_discoveries_id_format
    check (recipe_id ~ '^[A-Za-z][A-Za-z0-9]{0,79}$')
);

create table if not exists public.farm_market_rotations (
  user_id uuid not null references auth.users (id) on delete cascade,
  rotation_date date not null,
  seed_offer_ids text[] not null default '{}'::text[],
  food_offer_ids text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  primary key (user_id, rotation_date),
  constraint farm_market_seed_offer_count
    check (cardinality(seed_offer_ids) <= 7),
  constraint farm_market_food_offer_count
    check (cardinality(food_offer_ids) <= 4)
);

create table if not exists public.farm_mail (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid references auth.users (id) on delete set null,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  sender_name text not null,
  mail_type text not null default 'gift',
  subject text,
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  claimed_at timestamptz,
  constraint farm_mail_not_to_self
    check (sender_user_id is null or sender_user_id <> recipient_user_id),
  constraint farm_mail_sender_name_length
    check (char_length(btrim(sender_name)) between 1 and 30),
  constraint farm_mail_type_value
    check (mail_type in ('gift', 'weekly_ranking', 'system')),
  constraint farm_mail_expiry_after_send check (expires_at > sent_at)
);

create table if not exists public.farm_mail_items (
  id uuid primary key default gen_random_uuid(),
  mail_id uuid not null references public.farm_mail (id) on delete cascade,
  item_order smallint not null default 0,
  category text not null,
  item_id text not null,
  quantity integer not null default 1,
  revealed_at timestamptz,
  claimed_at timestamptz,
  unique (mail_id, item_order),
  constraint farm_mail_items_category_value
    check (category in ('seed', 'harvest', 'supply', 'food')),
  constraint farm_mail_items_item_id_format
    check (item_id ~ '^[A-Za-z][A-Za-z0-9]{0,79}$'),
  constraint farm_mail_items_quantity_positive check (quantity > 0),
  constraint farm_mail_items_order_nonnegative check (item_order >= 0)
);

create table if not exists public.farm_weekly_rewards (
  week_start date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  rank smallint not null,
  box_count smallint not null,
  mail_id uuid unique references public.farm_mail (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (week_start, user_id),
  constraint farm_weekly_rewards_monday
    check (extract(isodow from week_start) = 1),
  constraint farm_weekly_rewards_rank_range check (rank between 1 and 3),
  constraint farm_weekly_rewards_box_count
    check (
      (rank = 1 and box_count = 5)
      or (rank = 2 and box_count = 2)
      or (rank = 3 and box_count = 1)
    )
);

create index if not exists farm_wallet_ledger_user_created_idx
  on public.farm_wallet_ledger (user_id, created_at desc);

create index if not exists farm_weekly_earnings_board_idx
  on public.farm_weekly_earnings (week_start, earned_farm_money desc, updated_at);

create index if not exists farm_mail_recipient_sent_idx
  on public.farm_mail (recipient_user_id, sent_at desc);

create index if not exists farm_mail_sender_sent_idx
  on public.farm_mail (sender_user_id, sent_at desc)
  where sender_user_id is not null;

create index if not exists farm_mail_expiry_idx
  on public.farm_mail (expires_at);

create index if not exists farm_mail_items_mail_idx
  on public.farm_mail_items (mail_id, item_order);

drop trigger if exists farm_wallets_set_updated_at on public.farm_wallets;
create trigger farm_wallets_set_updated_at
  before update on public.farm_wallets
  for each row execute procedure public.set_row_updated_at();

drop trigger if exists farm_weekly_earnings_set_updated_at on public.farm_weekly_earnings;
create trigger farm_weekly_earnings_set_updated_at
  before update on public.farm_weekly_earnings
  for each row execute procedure public.set_row_updated_at();

drop trigger if exists farms_set_updated_at on public.farms;
create trigger farms_set_updated_at
  before update on public.farms
  for each row execute procedure public.set_row_updated_at();

drop trigger if exists farm_plots_set_updated_at on public.farm_plots;
create trigger farm_plots_set_updated_at
  before update on public.farm_plots
  for each row execute procedure public.set_row_updated_at();

drop trigger if exists farm_inventory_set_updated_at on public.farm_inventory;
create trigger farm_inventory_set_updated_at
  before update on public.farm_inventory
  for each row execute procedure public.set_row_updated_at();

create or replace function public.current_farm_week_start()
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('week', now() at time zone 'Asia/Seoul')::date;
$$;

create or replace function public.ensure_farm_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.farm_wallets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  insert into public.farms (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  insert into public.farm_plots (user_id, plot_index)
  select p_user_id, plot_index::smallint
  from pg_catalog.generate_series(0, 15) as plot_index
  on conflict (user_id, plot_index) do nothing;

  insert into public.farm_weekly_earnings (user_id, week_start)
  values (p_user_id, public.current_farm_week_start())
  on conflict (user_id, week_start) do nothing;
end;
$$;

create or replace function public.handle_new_farm_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ensure_farm_user(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_create_farm on auth.users;
create trigger on_auth_user_create_farm
  after insert on auth.users
  for each row execute procedure public.handle_new_farm_user();

do $$
declare
  existing_user record;
begin
  for existing_user in select id from auth.users loop
    perform public.ensure_farm_user(existing_user.id);
  end loop;
end;
$$;

create or replace function public.apply_farm_wallet_change(
  p_user_id uuid,
  p_currency text,
  p_amount bigint,
  p_reason text,
  p_reference_key text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_balance bigint;
begin
  if p_currency not in ('coin', 'farm_money') then
    raise exception 'Unsupported currency';
  end if;
  if p_amount = 0 then
    raise exception 'Wallet change cannot be zero';
  end if;
  if char_length(btrim(p_reason)) not between 1 and 80 then
    raise exception 'Wallet reason is invalid';
  end if;

  perform public.ensure_farm_user(p_user_id);

  if p_currency = 'coin' then
    update public.farm_wallets
    set coin_balance = coin_balance + p_amount
    where user_id = p_user_id
      and coin_balance + p_amount >= 0
    returning coin_balance into new_balance;
  else
    update public.farm_wallets
    set farm_money_balance = farm_money_balance + p_amount
    where user_id = p_user_id
      and farm_money_balance + p_amount >= 0
    returning farm_money_balance into new_balance;

    if p_amount > 0 then
      insert into public.farm_weekly_earnings (
        user_id,
        week_start,
        earned_farm_money
      )
      values (
        p_user_id,
        public.current_farm_week_start(),
        p_amount
      )
      on conflict (user_id, week_start) do update
      set earned_farm_money =
        public.farm_weekly_earnings.earned_farm_money + excluded.earned_farm_money;
    end if;
  end if;

  if new_balance is null then
    raise exception 'Insufficient balance';
  end if;

  insert into public.farm_wallet_ledger (
    user_id,
    currency,
    amount,
    balance_after,
    reason,
    reference_key
  )
  values (
    p_user_id,
    p_currency,
    p_amount,
    new_balance,
    btrim(p_reason),
    p_reference_key
  );

  return new_balance;
end;
$$;

create or replace function public.send_farm_mail(
  p_recipient_farm_code text,
  p_category text,
  p_item_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender_id uuid := auth.uid();
  recipient_id uuid;
  sender_display_name text;
  available_quantity integer;
  sent_today integer;
  new_mail_id uuid;
  today_start timestamptz;
  tomorrow_start timestamptz;
begin
  if sender_id is null then
    raise exception 'Authentication required';
  end if;
  if p_category not in ('seed', 'harvest', 'supply', 'food') then
    raise exception 'Unsupported gift category';
  end if;

  perform public.ensure_farm_user(sender_id);

  -- Serialize sends from one account so simultaneous requests cannot exceed 3/day.
  perform 1
  from public.farm_wallets
  where user_id = sender_id
  for update;

  select profiles.id
  into recipient_id
  from public.profiles
  where profiles.farm_code = upper(btrim(p_recipient_farm_code));

  if recipient_id is null then
    raise exception 'Recipient not found';
  end if;
  if recipient_id = sender_id then
    raise exception 'Cannot send mail to yourself';
  end if;

  select profiles.display_name
  into sender_display_name
  from public.profiles
  where profiles.id = sender_id;

  today_start := ((now() at time zone 'Asia/Seoul')::date::timestamp
    at time zone 'Asia/Seoul');
  tomorrow_start := today_start + interval '1 day';

  select count(*)::integer
  into sent_today
  from public.farm_mail
  where sender_user_id = sender_id
    and mail_type = 'gift'
    and sent_at >= today_start
    and sent_at < tomorrow_start;

  if sent_today >= 3 then
    raise exception 'Daily farm mail limit reached';
  end if;

  select quantity
  into available_quantity
  from public.farm_inventory
  where user_id = sender_id
    and category = p_category
    and item_id = p_item_id
  for update;

  if coalesce(available_quantity, 0) < 1 then
    raise exception 'Gift item is out of stock';
  end if;

  update public.farm_inventory
  set quantity = quantity - 1
  where user_id = sender_id
    and category = p_category
    and item_id = p_item_id;

  insert into public.farm_mail (
    sender_user_id,
    recipient_user_id,
    sender_name,
    mail_type,
    subject
  )
  values (
    sender_id,
    recipient_id,
    sender_display_name,
    'gift',
    '농장 선물'
  )
  returning id into new_mail_id;

  insert into public.farm_mail_items (
    mail_id,
    item_order,
    category,
    item_id,
    quantity,
    revealed_at
  )
  values (new_mail_id, 0, p_category, p_item_id, 1, now());

  return new_mail_id;
end;
$$;

create or replace function public.claim_farm_mail_item(p_mail_item_id uuid)
returns table (
  category text,
  item_id text,
  quantity integer,
  mail_claimed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid := auth.uid();
  selected_item public.farm_mail_items%rowtype;
  selected_mail public.farm_mail%rowtype;
  all_claimed boolean;
begin
  if recipient_id is null then
    raise exception 'Authentication required';
  end if;

  select mail_items.*
  into selected_item
  from public.farm_mail_items as mail_items
  where mail_items.id = p_mail_item_id
  for update;

  if selected_item.id is null then
    raise exception 'Mail item not found';
  end if;

  select mails.*
  into selected_mail
  from public.farm_mail as mails
  where mails.id = selected_item.mail_id
  for update;

  if selected_mail.recipient_user_id <> recipient_id then
    raise exception 'Mail does not belong to this user';
  end if;
  if selected_mail.expires_at <= now() then
    raise exception 'Mail has expired';
  end if;
  if selected_item.claimed_at is not null then
    raise exception 'Mail item was already claimed';
  end if;

  insert into public.farm_inventory (user_id, category, item_id, quantity)
  values (
    recipient_id,
    selected_item.category,
    selected_item.item_id,
    selected_item.quantity
  )
  on conflict (user_id, category, item_id) do update
  set quantity = public.farm_inventory.quantity + excluded.quantity;

  update public.farm_mail_items
  set revealed_at = coalesce(revealed_at, now()),
      claimed_at = now()
  where id = selected_item.id;

  select not exists (
    select 1
    from public.farm_mail_items
    where farm_mail_items.mail_id = selected_item.mail_id
      and farm_mail_items.claimed_at is null
  )
  into all_claimed;

  if all_claimed then
    update public.farm_mail
    set claimed_at = now()
    where id = selected_item.mail_id;
  end if;

  return query
  select
    selected_item.category,
    selected_item.item_id,
    selected_item.quantity,
    all_claimed;
end;
$$;

create or replace function public.get_farm_leaderboard(
  p_week_start date default null
)
returns table (
  rank_position bigint,
  display_name text,
  avatar_url text,
  farm_name text,
  earned_farm_money bigint,
  is_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    row_number() over (
      order by earnings.earned_farm_money desc, earnings.updated_at, earnings.user_id
    ) as rank_position,
    profiles.display_name,
    profiles.avatar_url,
    farms.farm_name,
    earnings.earned_farm_money,
    earnings.user_id = auth.uid() as is_me
  from public.farm_weekly_earnings as earnings
  join public.profiles as profiles on profiles.id = earnings.user_id
  join public.farms as farms on farms.user_id = earnings.user_id
  where earnings.week_start = coalesce(p_week_start, public.current_farm_week_start())
  order by rank_position
  limit 100;
$$;

create or replace function public.finalize_previous_farm_week()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_week date := public.current_farm_week_start() - 7;
  winner record;
  new_mail_id uuid;
  reward_box_count smallint;
  crop_ids text[] := array[
    'carrot', 'tomato', 'corn', 'potato', 'sweetPotato', 'strawberry',
    'eggplant', 'pepper', 'cucumber', 'pumpkin', 'onion', 'garlic',
    'cabbage', 'broccoli', 'watermelon', 'melon', 'rice', 'mushroom',
    'sunflower', 'beet', 'radish', 'turnip', 'chili', 'lettuce',
    'spinach', 'kale', 'celery', 'pea', 'bean', 'peanut', 'wheat',
    'barley', 'oat', 'grape', 'blueberry', 'raspberry', 'apple', 'pear',
    'peach', 'cherry', 'lemon', 'orange', 'pineapple', 'kiwi'
  ];
  box_index integer;
begin
  for winner in
    select ranked.user_id, ranked.rank_position
    from (
      select
        earnings.user_id,
        row_number() over (
          order by earnings.earned_farm_money desc, earnings.updated_at, earnings.user_id
        ) as rank_position
      from public.farm_weekly_earnings as earnings
      where earnings.week_start = previous_week
        and earnings.earned_farm_money > 0
    ) as ranked
    where ranked.rank_position <= 3
  loop
    reward_box_count := case winner.rank_position
      when 1 then 5
      when 2 then 2
      else 1
    end;

    if not exists (
      select 1
      from public.farm_weekly_rewards
      where week_start = previous_week
        and user_id = winner.user_id
    ) then
      insert into public.farm_mail (
        sender_user_id,
        recipient_user_id,
        sender_name,
        mail_type,
        subject
      )
      values (
        null,
        winner.user_id,
        '시스템',
        'weekly_ranking',
        previous_week::text || ' 주간 랭킹 ' || winner.rank_position || '위 보상'
      )
      returning id into new_mail_id;

      for box_index in 0..reward_box_count - 1 loop
        insert into public.farm_mail_items (
          mail_id,
          item_order,
          category,
          item_id,
          quantity
        )
        values (
          new_mail_id,
          box_index,
          'harvest',
          crop_ids[1 + floor(random() * cardinality(crop_ids))::integer],
          1
        );
      end loop;

      insert into public.farm_weekly_rewards (
        week_start,
        user_id,
        rank,
        box_count,
        mail_id
      )
      values (
        previous_week,
        winner.user_id,
        winner.rank_position,
        reward_box_count,
        new_mail_id
      );
    end if;
  end loop;
end;
$$;

create or replace function public.cleanup_expired_farm_mail()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.farm_mail where expires_at <= now();
$$;

create or replace function public.run_farm_lifecycle()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.finalize_previous_farm_week();
  perform public.cleanup_expired_farm_mail();
end;
$$;

alter table public.farm_wallets enable row level security;
alter table public.farm_wallet_ledger enable row level security;
alter table public.farm_weekly_earnings enable row level security;
alter table public.farms enable row level security;
alter table public.farm_plots enable row level security;
alter table public.farm_inventory enable row level security;
alter table public.farm_recipe_discoveries enable row level security;
alter table public.farm_market_rotations enable row level security;
alter table public.farm_mail enable row level security;
alter table public.farm_mail_items enable row level security;
alter table public.farm_weekly_rewards enable row level security;

drop policy if exists "Users can read their own farm wallet" on public.farm_wallets;
create policy "Users can read their own farm wallet"
  on public.farm_wallets for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own farm wallet ledger" on public.farm_wallet_ledger;
create policy "Users can read their own farm wallet ledger"
  on public.farm_wallet_ledger for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own weekly earnings" on public.farm_weekly_earnings;
create policy "Users can read their own weekly earnings"
  on public.farm_weekly_earnings for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own farm" on public.farms;
create policy "Users can read their own farm"
  on public.farms for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can rename their own farm" on public.farms;
create policy "Users can rename their own farm"
  on public.farms for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own farm plots" on public.farm_plots;
create policy "Users can read their own farm plots"
  on public.farm_plots for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own farm inventory" on public.farm_inventory;
create policy "Users can read their own farm inventory"
  on public.farm_inventory for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own recipe discoveries" on public.farm_recipe_discoveries;
create policy "Users can read their own recipe discoveries"
  on public.farm_recipe_discoveries for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own market rotations" on public.farm_market_rotations;
create policy "Users can read their own market rotations"
  on public.farm_market_rotations for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Mail participants can read mail" on public.farm_mail;
create policy "Mail participants can read mail"
  on public.farm_mail for select to authenticated
  using (
    (select auth.uid()) = recipient_user_id
    or (select auth.uid()) = sender_user_id
  );

drop policy if exists "Mail participants can read mail items" on public.farm_mail_items;
create policy "Mail participants can read mail items"
  on public.farm_mail_items for select to authenticated
  using (
    exists (
      select 1
      from public.farm_mail
      where farm_mail.id = farm_mail_items.mail_id
        and (
          farm_mail.recipient_user_id = (select auth.uid())
          or farm_mail.sender_user_id = (select auth.uid())
        )
    )
  );

drop policy if exists "Users can read their own weekly rewards" on public.farm_weekly_rewards;
create policy "Users can read their own weekly rewards"
  on public.farm_weekly_rewards for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.farm_wallets from anon, authenticated;
revoke all on table public.farm_wallet_ledger from anon, authenticated;
revoke all on table public.farm_weekly_earnings from anon, authenticated;
revoke all on table public.farms from anon, authenticated;
revoke all on table public.farm_plots from anon, authenticated;
revoke all on table public.farm_inventory from anon, authenticated;
revoke all on table public.farm_recipe_discoveries from anon, authenticated;
revoke all on table public.farm_market_rotations from anon, authenticated;
revoke all on table public.farm_mail from anon, authenticated;
revoke all on table public.farm_mail_items from anon, authenticated;
revoke all on table public.farm_weekly_rewards from anon, authenticated;

grant select on table public.farm_wallets to authenticated;
grant select on table public.farm_wallet_ledger to authenticated;
grant select on table public.farm_weekly_earnings to authenticated;
grant select, update (farm_name) on table public.farms to authenticated;
grant select on table public.farm_plots to authenticated;
grant select on table public.farm_inventory to authenticated;
grant select on table public.farm_recipe_discoveries to authenticated;
grant select on table public.farm_market_rotations to authenticated;
grant select on table public.farm_mail to authenticated;
grant select on table public.farm_mail_items to authenticated;
grant select on table public.farm_weekly_rewards to authenticated;

revoke all on function public.current_farm_week_start() from public, anon;
revoke all on function public.ensure_farm_user(uuid) from public, anon, authenticated;
revoke all on function public.handle_new_farm_user() from public, anon, authenticated;
revoke all on function public.apply_farm_wallet_change(uuid, text, bigint, text, text)
  from public, anon, authenticated;
revoke all on function public.send_farm_mail(text, text, text) from public, anon;
revoke all on function public.claim_farm_mail_item(uuid) from public, anon;
revoke all on function public.get_farm_leaderboard(date) from public, anon;
revoke all on function public.finalize_previous_farm_week() from public, anon, authenticated;
revoke all on function public.cleanup_expired_farm_mail() from public, anon, authenticated;
revoke all on function public.run_farm_lifecycle() from public, anon, authenticated;

grant execute on function public.current_farm_week_start() to authenticated;
grant execute on function public.send_farm_mail(text, text, text) to authenticated;
grant execute on function public.claim_farm_mail_item(uuid) to authenticated;
grant execute on function public.get_farm_leaderboard(date) to authenticated;

create extension if not exists pg_cron;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'farmodoro-farm-lifecycle'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'farmodoro-farm-lifecycle',
    '15 * * * *',
    'select public.run_farm_lifecycle();'
  );
end;
$$;

comment on table public.farm_wallets is 'Current Coin and Farm Money balances';
comment on table public.farm_wallet_ledger is 'Immutable audit trail for currency changes';
comment on table public.farm_weekly_earnings is 'Farm Money earned per Monday-starting week';
comment on table public.farm_plots is 'Sixteen persistent crop plots per user';
comment on table public.farm_inventory is 'Seed, harvest, supply, and cooked-food inventory';
comment on table public.farm_mail is 'Incoming and outgoing farm mail, retained for seven days';
comment on table public.farm_mail_items is 'One gift or multiple ranking boxes contained in a mail';
