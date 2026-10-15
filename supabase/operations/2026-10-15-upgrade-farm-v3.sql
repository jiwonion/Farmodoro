-- Apply after 094. Safe for partially upgraded farms; runs atomically.
begin;

-- 095_farm_v3_world.sql
-- New game state is separate from the retired/settled farm and old scenery.
-- No existing balances, ownership, creations or settlement records are deleted.
create table if not exists public.farm_v3_catalog (
  kind text not null check(kind in ('crop','fish','outfit','hat','decor')),
  item_id text not null,
  name text not null,
  growth_cost integer not null default 0 check(growth_cost between 0 and 1000),
  need_harvests integer not null default 0 check(need_harvests>=0),
  need_fish integer not null default 0 check(need_fish>=0),
  need_crop_types integer not null default 0 check(need_crop_types>=0),
  need_fish_types integer not null default 0 check(need_fish_types>=0),
  sort_order integer not null default 0,
  primary key(kind,item_id),
  check(kind not in ('crop','fish') or growth_cost>0)
);

-- BEGIN GENERATED CATALOG
insert into public.farm_v3_catalog(kind,item_id,name,growth_cost,need_harvests,need_fish,need_crop_types,need_fish_types,sort_order) values
  ('crop','carrot','당근',3,0,0,0,0,0),
  ('crop','potato','감자',3,0,0,0,0,1),
  ('crop','strawberry','딸기',4,0,0,0,0,2),
  ('crop','tomato','토마토',4,0,0,0,0,3),
  ('crop','pumpkin','호박',6,0,0,0,0,4),
  ('crop','corn','옥수수',4,2,0,0,0,5),
  ('crop','sweetPotato','고구마',4,4,0,0,0,6),
  ('crop','eggplant','가지',4,6,0,0,0,7),
  ('crop','pepper','피망',4,8,0,0,0,8),
  ('crop','cucumber','오이',4,10,0,0,0,9),
  ('crop','onion','양파',3,12,0,0,0,10),
  ('crop','garlic','마늘',3,14,0,0,0,11),
  ('crop','cabbage','배추',3,16,0,0,0,12),
  ('crop','broccoli','브로콜리',4,18,0,0,0,13),
  ('crop','watermelon','수박',6,20,0,0,0,14),
  ('crop','melon','멜론',6,22,0,0,0,15),
  ('crop','rice','벼',4,24,0,0,0,16),
  ('crop','mushroom','버섯',3,26,0,0,0,17),
  ('crop','sunflower','해바라기',4,28,0,0,0,18),
  ('crop','beet','비트',3,30,0,0,0,19),
  ('crop','radish','무',3,32,0,0,0,20),
  ('crop','turnip','순무',3,34,0,0,0,21),
  ('crop','chili','고추',4,36,0,0,0,22),
  ('crop','lettuce','상추',3,38,0,0,0,23),
  ('crop','spinach','시금치',3,40,0,0,0,24),
  ('crop','kale','케일',3,42,0,0,0,25),
  ('crop','celery','셀러리',3,44,0,0,0,26),
  ('crop','pea','완두콩',3,46,0,0,0,27),
  ('crop','bean','콩',4,48,0,0,0,28),
  ('crop','peanut','땅콩',4,50,0,0,0,29),
  ('crop','wheat','밀',3,52,0,0,0,30),
  ('crop','barley','보리',3,54,0,0,0,31),
  ('crop','oat','귀리',4,56,0,0,0,32),
  ('crop','grape','포도',6,58,0,0,0,33),
  ('crop','blueberry','블루베리',6,60,0,0,0,34),
  ('crop','raspberry','라즈베리',6,62,0,0,0,35),
  ('crop','apple','사과',7,64,0,0,0,36),
  ('crop','pear','배',7,66,0,0,0,37),
  ('crop','peach','복숭아',7,68,0,0,0,38),
  ('crop','cherry','체리',7,70,0,0,0,39),
  ('crop','lemon','레몬',7,72,0,0,0,40),
  ('crop','orange','오렌지',7,74,0,0,0,41),
  ('crop','pineapple','파인애플',6,76,0,0,0,42),
  ('crop','kiwi','키위',7,78,0,0,0,43),
  ('crop','pumpkinSquash','단호박',5,80,0,0,0,44),
  ('crop','daikon','열무',3,82,0,0,0,45),
  ('crop','edamame','풋콩',4,84,0,0,0,46),
  ('crop','bokchoy','청경채',3,86,0,0,0,47),
  ('crop','chestnut','밤',7,88,0,0,0,48),
  ('crop','fig','무화과',7,90,0,0,0,49),
  ('crop','plum','자두',6,92,0,0,0,50),
  ('crop','mango','망고',7,94,0,0,0,51),
  ('crop','passionFruit','패션프루트',6,96,0,0,0,52),
  ('crop','bellFlower','도라지',4,98,0,0,0,53),
  ('crop','sweetCorn','찰옥수수',5,100,0,0,0,54),
  ('crop','truffle','트러플',5,102,0,0,0,55),
  ('crop','lavender','라벤더',4,104,0,0,0,56),
  ('fish','minnow','피라미',2,0,0,0,0,57),
  ('fish','crucian','붕어',3,0,0,0,0,58),
  ('fish','carp','잉어',4,0,3,0,0,59),
  ('fish','trout','송어',4,0,6,0,0,60),
  ('fish','catfish','메기',5,0,9,0,0,61),
  ('fish','koi','비단잉어',6,0,12,0,0,62),
  ('fish','perch','농어',6,0,15,0,0,63),
  ('fish','salmon','연어',7,0,18,0,0,64),
  ('outfit','blue','파랑 작업복',0,0,0,0,0,65),
  ('outfit','green','새싹 작업복',0,0,0,0,0,66),
  ('outfit','cream','크림 작업복',0,0,0,0,0,67),
  ('outfit','rose','장미 작업복',0,3,0,0,0,68),
  ('outfit','lavender','라벤더 작업복',0,0,3,0,0,69),
  ('outfit','sunny','햇살 작업복',0,6,0,0,0,70),
  ('outfit','ocean','바다 작업복',0,0,6,0,0,71),
  ('outfit','autumn','가을 작업복',0,10,0,0,0,72),
  ('outfit','mint','민트 작업복',0,5,5,0,0,73),
  ('outfit','night','밤하늘 작업복',0,0,12,0,0,74),
  ('outfit','peach','복숭아 작업복',0,18,0,0,0,75),
  ('outfit','festival','축제 작업복',0,15,15,0,0,76),
  ('hat','straw','밀짚모자',0,1,0,0,0,77),
  ('hat','cap','빨간 캡',0,0,0,0,0,78),
  ('hat','bucket','낚시 모자',0,0,1,0,0,79),
  ('hat','beret','크림 베레모',0,4,0,0,0,80),
  ('hat','beanie','밤색 비니',0,0,5,0,0,81),
  ('hat','crown','작은 왕관',0,25,20,0,0,82),
  ('hat','flowers','꽃 화관',0,8,4,0,0,83),
  ('hat','explorer','탐험가 모자',0,12,12,0,0,84),
  ('decor','sign','첫 수확 표지판',0,1,0,0,0,85),
  ('decor','flowers','작은 화단',0,0,0,3,0,86),
  ('decor','crate','수확 바구니',0,5,0,0,0,87),
  ('decor','well','정원 우물',0,12,0,0,0,88),
  ('decor','fence','포근한 울타리',0,8,5,0,0,89),
  ('decor','lantern','물가 화단',0,0,3,0,0,90)
on conflict(kind,item_id) do update set name=excluded.name,growth_cost=excluded.growth_cost,
  need_harvests=excluded.need_harvests,need_fish=excluded.need_fish,need_crop_types=excluded.need_crop_types,
  need_fish_types=excluded.need_fish_types,sort_order=excluded.sort_order;
-- END GENERATED CATALOG

create table if not exists public.farm_v3_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '새싹 농부' check(char_length(btrim(nickname)) between 1 and 24),
  avatar jsonb not null default '{"gender":"neutral","skin":0,"hair":0,"style":0,"outfit":"blue","hat":null}'::jsonb,
  decorations text[] not null default '{}'::text[],
  plaza_public boolean not null default false,
  plaza_pose text not null default 'stand' check(plaza_pose in ('stand','sit')),
  plaza_zone text not null default 'square' check(plaza_zone in ('square','bench','tree')),
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  check(jsonb_typeof(avatar)='object')
);
create index if not exists farm_v3_public_profiles on public.farm_v3_profiles(user_id) where plaza_public;

create table if not exists public.farm_v3_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('crop','fish')),
  item_id text not null,
  slot smallint,
  progress integer not null default 0,
  growth_cost integer not null check(growth_cost between 1 and 1000),
  started_at timestamptz not null default now(),
  claimed_at timestamptz,
  foreign key(kind,item_id) references public.farm_v3_catalog(kind,item_id),
  check((kind='crop' and slot is not null and slot between 0 and 3) or (kind='fish' and slot is null)),
  check(progress between 0 and growth_cost),
  check(claimed_at is null or progress=growth_cost)
);
create unique index if not exists farm_v3_one_crop_per_slot
  on public.farm_v3_runs(user_id,slot) where kind='crop' and claimed_at is null;
create unique index if not exists farm_v3_one_fishing_run
  on public.farm_v3_runs(user_id) where kind='fish' and claimed_at is null;
create index if not exists farm_v3_runs_history on public.farm_v3_runs(user_id,kind,claimed_at);

create table if not exists public.farm_v3_collections (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('crop','fish')),
  item_id text not null,
  total bigint not null default 1 check(total>0),
  first_at timestamptz not null default now(),
  primary key(user_id,kind,item_id),
  foreign key(kind,item_id) references public.farm_v3_catalog(kind,item_id)
);
create table if not exists public.farm_v3_unlocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  item_id text not null,
  earned_at timestamptz not null default now(),
  primary key(user_id,kind,item_id),
  foreign key(kind,item_id) references public.farm_v3_catalog(kind,item_id)
);

alter table public.farm_v3_catalog enable row level security;
alter table public.farm_v3_profiles enable row level security;
alter table public.farm_v3_runs enable row level security;
alter table public.farm_v3_collections enable row level security;
alter table public.farm_v3_unlocks enable row level security;
revoke all on public.farm_v3_catalog, public.farm_v3_profiles, public.farm_v3_runs,
  public.farm_v3_collections, public.farm_v3_unlocks from public, anon, authenticated;
grant select on public.farm_v3_catalog, public.farm_v3_profiles, public.farm_v3_runs,
  public.farm_v3_collections, public.farm_v3_unlocks to authenticated;
drop policy if exists "Read v3 catalog" on public.farm_v3_catalog;
create policy "Read v3 catalog" on public.farm_v3_catalog for select to authenticated using(true);
do $$
declare table_name text;
begin
  foreach table_name in array array['farm_v3_profiles','farm_v3_runs','farm_v3_collections','farm_v3_unlocks'] loop
    execute format('drop policy if exists "Read own v3 state" on public.%I',table_name);
    execute format('create policy "Read own v3 state" on public.%I for select to authenticated using(user_id=(select auth.uid()))',table_name);
  end loop;
end;
$$;

create or replace function public.farm_v3_refresh_unlocks(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare harvested bigint; caught bigint; crop_types integer; fish_types integer; result jsonb; new_decor text[];
begin
  select coalesce(sum(total) filter(where kind='crop'),0), coalesce(sum(total) filter(where kind='fish'),0),
    count(*) filter(where kind='crop'), count(*) filter(where kind='fish')
  into harvested,caught,crop_types,fish_types from public.farm_v3_collections where user_id=p_user_id;
  with granted as (
    insert into public.farm_v3_unlocks(user_id,kind,item_id)
    select p_user_id,c.kind,c.item_id from public.farm_v3_catalog c
    where c.need_harvests<=harvested and c.need_fish<=caught
      and c.need_crop_types<=crop_types and c.need_fish_types<=fish_types
    on conflict(user_id,kind,item_id) do nothing returning kind,item_id
  ) select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'id',item_id)),'[]'::jsonb) into result from granted;
  select array_agg(entry->>'id') into new_decor from jsonb_array_elements(result) entry where entry->>'kind'='decor';
  if cardinality(new_decor)>0 then
    update public.farm_v3_profiles set decorations=decorations||new_decor,version=version+1,updated_at=now()
    where user_id=p_user_id;
  end if;
  return result;
end;
$$;
revoke all on function public.farm_v3_refresh_unlocks(uuid) from public,anon,authenticated;

create or replace function public.ensure_farm_v3_user(p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.ensure_farm_user(p_user_id);
  insert into public.farm_v3_profiles(user_id) values(p_user_id) on conflict do nothing;
  perform public.farm_v3_refresh_unlocks(p_user_id);
end;
$$;
revoke all on function public.ensure_farm_v3_user(uuid) from public,anon,authenticated;

create or replace function public.farm_v3_state_json(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'version',1,
    'coinBalance',(select coin_balance from public.farm_wallets where user_id=p_user_id),
    'profile',(select jsonb_build_object('nickname',p.nickname,'avatar',p.avatar,'decorations',p.decorations,
      'plazaPublic',p.plaza_public,'pose',p.plaza_pose,'zone',p.plaza_zone,'version',p.version) from public.farm_v3_profiles p where p.user_id=p_user_id),
    'runs',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'itemId',r.item_id,'slot',r.slot,
      'progress',r.progress,'cost',r.growth_cost) order by r.kind,r.slot) from public.farm_v3_runs r where r.user_id=p_user_id and r.claimed_at is null),'[]'::jsonb),
    'collections',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'count',c.total,'firstAt',c.first_at) order by c.kind,c.item_id)
      from public.farm_v3_collections c where c.user_id=p_user_id),'[]'::jsonb),
    'unlocks',coalesce((select jsonb_agg(jsonb_build_object('kind',u.kind,'id',u.item_id) order by u.kind,u.item_id)
      from public.farm_v3_unlocks u where u.user_id=p_user_id),'[]'::jsonb),
    'catalog',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'name',c.name,'cost',c.growth_cost,
      'harvests',c.need_harvests,'fish',c.need_fish,'cropTypes',c.need_crop_types,'fishTypes',c.need_fish_types) order by c.sort_order)
      from public.farm_v3_catalog c),'[]'::jsonb)
  );
$$;
revoke all on function public.farm_v3_state_json(uuid) from public,anon,authenticated;

create or replace function public.farm_v3_result_json(p_user_id uuid,p_event jsonb)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('game',public.farm_v3_state_json(p_user_id),
    'wallet',(select jsonb_build_object('coinBalance',coin_balance,'farmMoneyBalance',farm_money_balance) from public.farm_wallets where user_id=p_user_id),
    'event',p_event);
$$;
revoke all on function public.farm_v3_result_json(uuid,jsonb) from public,anon,authenticated;

create or replace function public.get_my_farm_v3_state()
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid:=auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_v3_user(current_user_id);
  return public.farm_v3_state_json(current_user_id);
end;
$$;
revoke all on function public.get_my_farm_v3_state() from public,anon;
grant execute on function public.get_my_farm_v3_state() to authenticated;

create or replace function public.perform_my_farm_v3_action(p_action text,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  current_user_id uuid:=auth.uid(); cached jsonb; selected public.farm_v3_catalog%rowtype;
  run_row public.farm_v3_runs%rowtype; profile_row public.farm_v3_profiles%rowtype;
  item_kind text; selected_slot integer; amount integer; spent integer; balance bigint;
  event jsonb:='{}'::jsonb; new_unlocks jsonb; appearance jsonb; decor_ids text[];
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_action is null or p_action not in ('plant','grow','harvest','fish_start','fish_grow','fish_claim','avatar','plaza','decor') then raise exception 'FARM_V3_UNKNOWN_ACTION'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'FARM_V3_INVALID_INPUT'; end if;
  perform public.ensure_farm_v3_user(current_user_id);
  perform public.lock_my_farm_actions(current_user_id);
  cached:=public.begin_my_farm_action(current_user_id,p_request_id,'farm_v3:'||p_action);
  if cached is not null then return public.farm_v3_result_json(current_user_id,cached->'event'); end if;

  if p_action in ('plant','fish_start') then
    item_kind:=case when p_action='plant' then 'crop' else 'fish' end;
    select * into selected from public.farm_v3_catalog where kind=item_kind and item_id=p_payload->>'itemId';
    if not found then raise exception 'FARM_V3_UNKNOWN_ITEM'; end if;
    if not exists(select 1 from public.farm_v3_unlocks where user_id=current_user_id and kind=item_kind and item_id=selected.item_id) then raise exception 'FARM_V3_LOCKED'; end if;
    if item_kind='crop' then
      if coalesce(p_payload->>'slot','') !~ '^[0-3]$' then raise exception 'FARM_V3_INVALID_SLOT'; end if;
      selected_slot:=(p_payload->>'slot')::integer;
    end if;
    if exists(select 1 from public.farm_v3_runs where user_id=current_user_id and kind=item_kind
      and (item_kind='fish' or slot=selected_slot) and claimed_at is null) then raise exception 'FARM_V3_OCCUPIED'; end if;
    insert into public.farm_v3_runs(user_id,kind,item_id,slot,growth_cost)
      values(current_user_id,item_kind,selected.item_id,selected_slot,selected.growth_cost) returning * into run_row;
    event:=jsonb_build_object('kind','started','name',selected.name,'runId',run_row.id);
  elsif p_action in ('grow','fish_grow') then
    item_kind:=case when p_action='grow' then 'crop' else 'fish' end;
    if coalesce(p_payload->>'amount','') !~ '^[0-9]{1,3}$' then raise exception 'FARM_V3_INVALID_AMOUNT'; end if;
    amount:=(p_payload->>'amount')::integer;
    if amount not between 1 and 100 then raise exception 'FARM_V3_INVALID_AMOUNT'; end if;
    select * into run_row from public.farm_v3_runs where id=(p_payload->>'runId')::uuid
      and user_id=current_user_id and kind=item_kind for update;
    if not found or run_row.claimed_at is not null then raise exception 'FARM_V3_RUN_NOT_FOUND'; end if;
    if run_row.progress>=run_row.growth_cost then raise exception 'FARM_V3_COMPLETE'; end if;
    select coin_balance into balance from public.farm_wallets where user_id=current_user_id for update;
    if balance<1 then raise exception 'FARM_INSUFFICIENT_COIN'; end if;
    spent:=least(amount,run_row.growth_cost-run_row.progress,balance)::integer;
    perform public.apply_farm_wallet_change(current_user_id,'coin',-spent,'농장·낚시 Coin 사용','farm-v3-grow:'||p_request_id);
    update public.farm_v3_runs set progress=progress+spent where id=run_row.id returning * into run_row;
    event:=jsonb_build_object('kind','grown','spentCoin',spent,'runId',run_row.id,'completed',run_row.progress=run_row.growth_cost);
  elsif p_action in ('harvest','fish_claim') then
    item_kind:=case when p_action='harvest' then 'crop' else 'fish' end;
    select * into run_row from public.farm_v3_runs where id=(p_payload->>'runId')::uuid
      and user_id=current_user_id and kind=item_kind for update;
    if not found then raise exception 'FARM_V3_RUN_NOT_FOUND'; end if;
    if run_row.claimed_at is not null then raise exception 'FARM_V3_ALREADY_CLAIMED'; end if;
    if run_row.progress<run_row.growth_cost then raise exception 'FARM_V3_NOT_COMPLETE'; end if;
    update public.farm_v3_runs set claimed_at=now() where id=run_row.id;
    insert into public.farm_v3_collections(user_id,kind,item_id) values(current_user_id,item_kind,run_row.item_id)
      on conflict(user_id,kind,item_id) do update set total=public.farm_v3_collections.total+1;
    select * into selected from public.farm_v3_catalog where kind=item_kind and item_id=run_row.item_id;
    event:=jsonb_build_object('kind','collected','name',selected.name,'itemKind',item_kind,'itemId',run_row.item_id);
  else
    select * into profile_row from public.farm_v3_profiles where user_id=current_user_id for update;
    if coalesce(p_payload->>'version','') !~ '^[0-9]{1,18}$' or (p_payload->>'version')::bigint<>profile_row.version then raise exception 'FARM_V3_PROFILE_CHANGED'; end if;
    if p_action='avatar' then
      appearance:=p_payload->'avatar';
      if jsonb_typeof(appearance) is distinct from 'object'
        or coalesce(appearance->>'gender','') not in ('male','female','neutral')
        or coalesce(appearance->>'skin','') !~ '^[0-4]$'
        or coalesce(appearance->>'hair','') !~ '^[0-7]$'
        or coalesce(appearance->>'style','') !~ '^[0-2]$' then raise exception 'FARM_V3_INVALID_AVATAR'; end if;
      if not exists(select 1 from public.farm_v3_unlocks where user_id=current_user_id and kind='outfit' and item_id=appearance->>'outfit') then raise exception 'FARM_V3_LOCKED'; end if;
      if nullif(appearance->>'hat','') is not null and not exists(select 1 from public.farm_v3_unlocks where user_id=current_user_id and kind='hat' and item_id=appearance->>'hat') then raise exception 'FARM_V3_LOCKED'; end if;
      update public.farm_v3_profiles set avatar=jsonb_build_object('gender',appearance->>'gender','skin',(appearance->>'skin')::integer,
        'hair',(appearance->>'hair')::integer,'style',(appearance->>'style')::integer,'outfit',appearance->>'outfit','hat',nullif(appearance->>'hat','')) where user_id=current_user_id;
      event:=jsonb_build_object('kind','avatar');
    elsif p_action='plaza' then
      if jsonb_typeof(p_payload->'public') is distinct from 'boolean' or char_length(btrim(coalesce(p_payload->>'nickname',''))) not between 1 and 24
        or (p_payload->>'nickname')~'[[:cntrl:]]' or coalesce(p_payload->>'pose','') not in ('stand','sit')
        or coalesce(p_payload->>'zone','') not in ('square','bench','tree') then raise exception 'FARM_V3_INVALID_PLAZA'; end if;
      update public.farm_v3_profiles set nickname=btrim(p_payload->>'nickname'),plaza_public=(p_payload->>'public')::boolean,
        plaza_pose=p_payload->>'pose',plaza_zone=p_payload->>'zone' where user_id=current_user_id;
      event:=jsonb_build_object('kind','plaza');
    else
      if jsonb_typeof(p_payload->'decorations') is distinct from 'array' or jsonb_array_length(p_payload->'decorations')>6 then raise exception 'FARM_V3_INVALID_DECOR'; end if;
      select coalesce(array_agg(distinct id),'{}'::text[]) into decor_ids from jsonb_array_elements_text(p_payload->'decorations') id;
      if exists(select 1 from unnest(decor_ids) id where not exists(select 1 from public.farm_v3_unlocks u
        where u.user_id=current_user_id and u.kind='decor' and u.item_id=id)) then raise exception 'FARM_V3_LOCKED'; end if;
      update public.farm_v3_profiles set decorations=decor_ids where user_id=current_user_id;
      event:=jsonb_build_object('kind','decor');
    end if;
    update public.farm_v3_profiles set version=version+1,updated_at=now() where user_id=current_user_id;
  end if;
  new_unlocks:=public.farm_v3_refresh_unlocks(current_user_id);
  event:=event||jsonb_build_object('unlocks',new_unlocks);
  -- Only immutable event facts need permanent storage. Rebuild the current
  -- state on retries instead of retaining a full catalog snapshot per Coin.
  perform public.farm_action_finish(current_user_id,p_request_id,jsonb_build_object('event',event));
  return public.farm_v3_result_json(current_user_id,event);
end;
$$;
revoke all on function public.perform_my_farm_v3_action(text,jsonb,uuid) from public,anon;
grant execute on function public.perform_my_farm_v3_action(text,jsonb,uuid) to authenticated;

create or replace function public.get_farm_v3_plaza(p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_page is null or p_page not between 0 and 100000 then raise exception 'FARM_V3_INVALID_PAGE'; end if;
  select jsonb_build_object('snapshotAt',now(),'page',p_page,
    'total',(select count(*) from public.farm_v3_profiles where plaza_public),
    'items',coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'nickname',p.nickname,'avatar',p.avatar,'pose',p.plaza_pose,'zone',p.plaza_zone,'isMe',p.user_id=auth.uid()) order by p.user_id),'[]'::jsonb))
    into result from (select user_id,nickname,avatar,plaza_pose,plaza_zone from public.farm_v3_profiles
      where plaza_public order by user_id limit 12 offset p_page*12) p;
  return result;
end;
$$;
revoke all on function public.get_farm_v3_plaza(integer) from public,anon;
grant execute on function public.get_farm_v3_plaza(integer) to authenticated;

-- Durable recovery for v3 actions, including old requests after long absences.
create or replace function public.cleanup_stale_farm_actions()
returns void language sql security definer set search_path='' as $$
  delete from public.farm_action_log where created_at<now()-interval '24 hours'
    and action not like 'farm_v3:%'
    and action not in ('start_my_scenery_creation','grow_my_scenery_creation','claim_my_scenery_creation','unlock_my_scenery_type');
$$;
revoke all on function public.cleanup_stale_farm_actions() from public,anon,authenticated;

-- Existing scenery remains a collection. The one already active creation may
-- still be finished/claimed; new farming does not pay out Farm Money.
revoke all on function public.get_farm_leaderboard(date) from public,anon,authenticated;
create or replace function public.start_my_scenery_creation(p_type_id text,p_theme_id text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid:=auth.uid(); cached jsonb;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_farm_user(current_user_id);
  perform public.lock_my_farm_actions(current_user_id);
  cached:=public.begin_my_farm_action(current_user_id,p_request_id,'start_my_scenery_creation');
  if cached is not null then return public.farm_scenery_result_json(current_user_id,cached->'event'); end if;
  raise exception 'SCENERY_ARCHIVED';
end;
$$;
revoke all on function public.start_my_scenery_creation(text,text,uuid) from public,anon;
grant execute on function public.start_my_scenery_creation(text,text,uuid) to authenticated;

-- BEGIN ARCHIVED SCENERY STATE
create or replace function public.farm_scenery_state_json(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'freeGrowth', true,
    'archived', true,
    'activeCreation', (
      select jsonb_build_object('id', c.id, 'typeId', c.type_id, 'themeId', c.theme_id,
        'progress', c.progress, 'growthCost', c.growth_cost, 'reward', c.reward)
      from public.farm_scenery_creations c
      where c.user_id = p_user_id and c.claimed_at is null
    ),
    'unlockedTypes', (
      select coalesce(jsonb_agg(c.type_id order by c.type_id), '[]'::jsonb)
      from public.farm_scenery_catalog c
      where c.unlock_price = 0 or exists (
        select 1 from public.farm_scenery_unlocked_types u
        where u.user_id = p_user_id and u.type_id = c.type_id
      )
    ),
    'completedTypes', (
      select coalesce(jsonb_agg(jsonb_build_object('typeId', history.type_id, 'count', history.completed_count)
        order by history.type_id), '[]'::jsonb)
      from (
        select c.type_id, count(*) as completed_count from public.farm_scenery_creations c
        where c.user_id = p_user_id and c.claimed_at is not null group by c.type_id
      ) history
    ),
    'totalCompleted', (select count(*) from public.farm_scenery_creations c
      where c.user_id = p_user_id and c.claimed_at is not null),
    'catalog', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.type_id, 'name', c.name, 'family', c.family, 'variant', c.variant,
      'unlockPrice', c.unlock_price, 'growthCost', c.growth_cost, 'reward', c.reward)
      order by c.type_id), '[]'::jsonb) from public.farm_scenery_catalog c)
  );
$$;
revoke all on function public.farm_scenery_state_json(uuid) from public,anon,authenticated;
-- END ARCHIVED SCENERY STATE

do $$
declare table_name text;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach table_name in array array['farm_v3_profiles','farm_v3_runs','farm_v3_collections','farm_v3_unlocks'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name) then
        execute format('alter publication supabase_realtime add table public.%I',table_name);
      end if;
    end loop;
  end if;
end;
$$;
notify pgrst,'reload schema';


-- 096_avatar_parts.sql
-- Paper-doll avatar parts. Existing balances, collections and outfits remain.
create or replace function public.farm_v3_normalize_avatar(p_user_id uuid,p_avatar jsonb,p_previous jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; field text; value text; piece jsonb; preset text:=p_avatar->>'outfit';
begin
  if jsonb_typeof(p_avatar) is distinct from 'object'
    or coalesce(p_avatar->>'gender','') not in ('male','female','neutral')
    or coalesce(p_avatar->>'skin','') !~ '^[0-4]$'
    or coalesce(p_avatar->>'hair','') !~ '^[0-7]$'
    or coalesce(p_avatar->>'style','') !~ '^[0-3]$' then raise exception 'FARM_V3_INVALID_AVATAR'; end if;
  if not exists(select 1 from public.farm_v3_unlocks where user_id=p_user_id and kind='outfit' and item_id=preset)
    then raise exception 'FARM_V3_LOCKED'; end if;
  if nullif(p_avatar->>'hat','') is not null and not exists(select 1 from public.farm_v3_unlocks where user_id=p_user_id and kind='hat' and item_id=p_avatar->>'hat')
    then raise exception 'FARM_V3_LOCKED'; end if;
  result:=jsonb_build_object('gender',p_avatar->>'gender','skin',(p_avatar->>'skin')::integer,
    'hair',(p_avatar->>'hair')::integer,'style',(p_avatar->>'style')::integer,'outfit',preset,'hat',nullif(p_avatar->>'hat',''));
  foreach field in array array['eyes','nose','mouth'] loop
    value:=coalesce(p_avatar->>field,p_previous->>field,'0');
    if value !~ '^[0-3]$' then raise exception 'FARM_V3_INVALID_AVATAR'; end if;
    result:=result||jsonb_build_object(field,value::integer);
  end loop;
  foreach field in array array['top','bottom','shoes'] loop
    if p_avatar ? field then piece:=p_avatar->field;
    elsif preset is distinct from p_previous->>'outfit' then piece:=to_jsonb(preset);
    else piece:=coalesce(p_previous->field,to_jsonb(preset)); end if;
    if piece<>'null'::jsonb and (jsonb_typeof(piece)<>'string' or not exists(
      select 1 from public.farm_v3_unlocks where user_id=p_user_id and kind='outfit' and item_id=piece#>>'{}'))
      then raise exception 'FARM_V3_LOCKED'; end if;
    result:=result||jsonb_build_object(field,piece);
  end loop;
  return result;
end;
$$;
revoke all on function public.farm_v3_normalize_avatar(uuid,jsonb,jsonb) from public,anon,authenticated;

alter table public.farm_v3_profiles alter column avatar set default
  '{"gender":"neutral","skin":0,"hair":0,"style":0,"eyes":0,"nose":0,"mouth":0,"outfit":"blue","top":"blue","bottom":"blue","shoes":"blue","hat":null}'::jsonb;
update public.farm_v3_profiles set avatar=jsonb_build_object('eyes',0,'nose',0,'mouth',0,
  'top',avatar->>'outfit','bottom',avatar->>'outfit','shoes',avatar->>'outfit')||avatar,
  version=version+1,updated_at=now()
where not (avatar ?& array['eyes','nose','mouth','top','bottom','shoes']);

create or replace function public.farm_v3_state_json(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'version',1,'avatarPartsVersion',1,
    'coinBalance',(select coin_balance from public.farm_wallets where user_id=p_user_id),
    'profile',(select jsonb_build_object('nickname',p.nickname,'avatar',p.avatar,'decorations',p.decorations,
      'plazaPublic',p.plaza_public,'pose',p.plaza_pose,'zone',p.plaza_zone,'version',p.version) from public.farm_v3_profiles p where p.user_id=p_user_id),
    'runs',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'itemId',r.item_id,'slot',r.slot,
      'progress',r.progress,'cost',r.growth_cost) order by r.kind,r.slot) from public.farm_v3_runs r where r.user_id=p_user_id and r.claimed_at is null),'[]'::jsonb),
    'collections',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'count',c.total,'firstAt',c.first_at) order by c.kind,c.item_id)
      from public.farm_v3_collections c where c.user_id=p_user_id),'[]'::jsonb),
    'unlocks',coalesce((select jsonb_agg(jsonb_build_object('kind',u.kind,'id',u.item_id) order by u.kind,u.item_id)
      from public.farm_v3_unlocks u where u.user_id=p_user_id),'[]'::jsonb),
    'catalog',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'name',c.name,'cost',c.growth_cost,
      'harvests',c.need_harvests,'fish',c.need_fish,'cropTypes',c.need_crop_types,'fishTypes',c.need_fish_types) order by c.sort_order)
      from public.farm_v3_catalog c),'[]'::jsonb)
  );
$$;
revoke all on function public.farm_v3_state_json(uuid) from public,anon,authenticated;

create or replace function public.perform_my_farm_v3_action(p_action text,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  current_user_id uuid:=auth.uid(); cached jsonb; selected public.farm_v3_catalog%rowtype;
  run_row public.farm_v3_runs%rowtype; profile_row public.farm_v3_profiles%rowtype;
  item_kind text; selected_slot integer; amount integer; spent integer; balance bigint;
  event jsonb:='{}'::jsonb; new_unlocks jsonb; appearance jsonb; decor_ids text[];
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_action is null or p_action not in ('plant','grow','harvest','fish_start','fish_grow','fish_claim','avatar','plaza','decor') then raise exception 'FARM_V3_UNKNOWN_ACTION'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'FARM_V3_INVALID_INPUT'; end if;
  perform public.ensure_farm_v3_user(current_user_id);
  perform public.lock_my_farm_actions(current_user_id);
  cached:=public.begin_my_farm_action(current_user_id,p_request_id,'farm_v3:'||p_action);
  if cached is not null then return public.farm_v3_result_json(current_user_id,cached->'event'); end if;

  if p_action in ('plant','fish_start') then
    item_kind:=case when p_action='plant' then 'crop' else 'fish' end;
    select * into selected from public.farm_v3_catalog where kind=item_kind and item_id=p_payload->>'itemId';
    if not found then raise exception 'FARM_V3_UNKNOWN_ITEM'; end if;
    if not exists(select 1 from public.farm_v3_unlocks where user_id=current_user_id and kind=item_kind and item_id=selected.item_id) then raise exception 'FARM_V3_LOCKED'; end if;
    if item_kind='crop' then
      if coalesce(p_payload->>'slot','') !~ '^[0-3]$' then raise exception 'FARM_V3_INVALID_SLOT'; end if;
      selected_slot:=(p_payload->>'slot')::integer;
    end if;
    if exists(select 1 from public.farm_v3_runs where user_id=current_user_id and kind=item_kind
      and (item_kind='fish' or slot=selected_slot) and claimed_at is null) then raise exception 'FARM_V3_OCCUPIED'; end if;
    insert into public.farm_v3_runs(user_id,kind,item_id,slot,growth_cost)
      values(current_user_id,item_kind,selected.item_id,selected_slot,selected.growth_cost) returning * into run_row;
    event:=jsonb_build_object('kind','started','name',selected.name,'runId',run_row.id);
  elsif p_action in ('grow','fish_grow') then
    item_kind:=case when p_action='grow' then 'crop' else 'fish' end;
    if coalesce(p_payload->>'amount','') !~ '^[0-9]{1,3}$' then raise exception 'FARM_V3_INVALID_AMOUNT'; end if;
    amount:=(p_payload->>'amount')::integer;
    if amount not between 1 and 100 then raise exception 'FARM_V3_INVALID_AMOUNT'; end if;
    select * into run_row from public.farm_v3_runs where id=(p_payload->>'runId')::uuid
      and user_id=current_user_id and kind=item_kind for update;
    if not found or run_row.claimed_at is not null then raise exception 'FARM_V3_RUN_NOT_FOUND'; end if;
    if run_row.progress>=run_row.growth_cost then raise exception 'FARM_V3_COMPLETE'; end if;
    select coin_balance into balance from public.farm_wallets where user_id=current_user_id for update;
    if balance<1 then raise exception 'FARM_INSUFFICIENT_COIN'; end if;
    spent:=least(amount,run_row.growth_cost-run_row.progress,balance)::integer;
    perform public.apply_farm_wallet_change(current_user_id,'coin',-spent,'농장·낚시 Coin 사용','farm-v3-grow:'||p_request_id);
    update public.farm_v3_runs set progress=progress+spent where id=run_row.id returning * into run_row;
    event:=jsonb_build_object('kind','grown','spentCoin',spent,'runId',run_row.id,'completed',run_row.progress=run_row.growth_cost);
  elsif p_action in ('harvest','fish_claim') then
    item_kind:=case when p_action='harvest' then 'crop' else 'fish' end;
    select * into run_row from public.farm_v3_runs where id=(p_payload->>'runId')::uuid
      and user_id=current_user_id and kind=item_kind for update;
    if not found then raise exception 'FARM_V3_RUN_NOT_FOUND'; end if;
    if run_row.claimed_at is not null then raise exception 'FARM_V3_ALREADY_CLAIMED'; end if;
    if run_row.progress<run_row.growth_cost then raise exception 'FARM_V3_NOT_COMPLETE'; end if;
    update public.farm_v3_runs set claimed_at=now() where id=run_row.id;
    insert into public.farm_v3_collections(user_id,kind,item_id) values(current_user_id,item_kind,run_row.item_id)
      on conflict(user_id,kind,item_id) do update set total=public.farm_v3_collections.total+1;
    select * into selected from public.farm_v3_catalog where kind=item_kind and item_id=run_row.item_id;
    event:=jsonb_build_object('kind','collected','name',selected.name,'itemKind',item_kind,'itemId',run_row.item_id);
  else
    select * into profile_row from public.farm_v3_profiles where user_id=current_user_id for update;
    if coalesce(p_payload->>'version','') !~ '^[0-9]{1,18}$' or (p_payload->>'version')::bigint<>profile_row.version then raise exception 'FARM_V3_PROFILE_CHANGED'; end if;
    if p_action='avatar' then
      appearance:=public.farm_v3_normalize_avatar(current_user_id,p_payload->'avatar',profile_row.avatar);
      update public.farm_v3_profiles set avatar=appearance where user_id=current_user_id;
      event:=jsonb_build_object('kind','avatar');
    elsif p_action='plaza' then
      if jsonb_typeof(p_payload->'public') is distinct from 'boolean' or char_length(btrim(coalesce(p_payload->>'nickname',''))) not between 1 and 24
        or (p_payload->>'nickname')~'[[:cntrl:]]' or coalesce(p_payload->>'pose','') not in ('stand','sit')
        or coalesce(p_payload->>'zone','') not in ('square','bench','tree') then raise exception 'FARM_V3_INVALID_PLAZA'; end if;
      update public.farm_v3_profiles set nickname=btrim(p_payload->>'nickname'),plaza_public=(p_payload->>'public')::boolean,
        plaza_pose=p_payload->>'pose',plaza_zone=p_payload->>'zone' where user_id=current_user_id;
      event:=jsonb_build_object('kind','plaza');
    else
      if jsonb_typeof(p_payload->'decorations') is distinct from 'array' or jsonb_array_length(p_payload->'decorations')>6 then raise exception 'FARM_V3_INVALID_DECOR'; end if;
      select coalesce(array_agg(distinct id),'{}'::text[]) into decor_ids from jsonb_array_elements_text(p_payload->'decorations') id;
      if exists(select 1 from unnest(decor_ids) id where not exists(select 1 from public.farm_v3_unlocks u
        where u.user_id=current_user_id and u.kind='decor' and u.item_id=id)) then raise exception 'FARM_V3_LOCKED'; end if;
      update public.farm_v3_profiles set decorations=decor_ids where user_id=current_user_id;
      event:=jsonb_build_object('kind','decor');
    end if;
    update public.farm_v3_profiles set version=version+1,updated_at=now() where user_id=current_user_id;
  end if;
  new_unlocks:=public.farm_v3_refresh_unlocks(current_user_id);
  event:=event||jsonb_build_object('unlocks',new_unlocks);
  -- Only immutable event facts need permanent storage. Rebuild the current
  -- state on retries instead of retaining a full catalog snapshot per Coin.
  perform public.farm_action_finish(current_user_id,p_request_id,jsonb_build_object('event',event));
  return public.farm_v3_result_json(current_user_id,event);
end;
$$;
revoke all on function public.perform_my_farm_v3_action(text,jsonb,uuid) from public,anon;
grant execute on function public.perform_my_farm_v3_action(text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';


-- 097_representative_characters.sql
-- Keep old outfits, hats and avatar JSON as history. They no longer appear in
-- the active catalog or receive new unlocks. No wallet or collection changes.
alter table public.farm_v3_catalog drop constraint if exists farm_v3_catalog_kind_check;
alter table public.farm_v3_catalog add constraint farm_v3_catalog_kind_check
  check(kind in ('crop','fish','outfit','hat','decor','character'));
insert into public.farm_v3_catalog(kind,item_id,name,growth_cost,need_harvests,need_fish,need_crop_types,need_fish_types,sort_order) values
  ('character','sprout-slime','새싹 슬라임',0,0,0,0,0,91),
  ('character','aqua-slime','물방울 슬라임',0,0,1,0,0,92),
  ('character','berry-slime','딸기 젤리',0,3,0,0,0,93),
  ('character','mushroom','버섯 친구',0,6,0,0,0,94),
  ('character','jelly-cat','젤리 고양이',0,10,0,0,0,95),
  ('character','cloud-puff','구름 친구',0,5,5,0,0,96),
  ('character','star-slime','별빛 슬라임',0,0,12,0,0,97),
  ('character','royal-slime','왕관 슬라임',0,25,20,0,0,98)
on conflict(kind,item_id) do update set name=excluded.name,growth_cost=excluded.growth_cost,
  need_harvests=excluded.need_harvests,need_fish=excluded.need_fish,
  need_crop_types=excluded.need_crop_types,need_fish_types=excluded.need_fish_types,sort_order=excluded.sort_order;

alter table public.farm_v3_profiles add column if not exists character_id text;
update public.farm_v3_profiles set character_id='sprout-slime',version=version+1,updated_at=now() where character_id is null;
alter table public.farm_v3_profiles alter column character_id set default 'sprout-slime';
alter table public.farm_v3_profiles alter column character_id set not null;

create or replace function public.farm_v3_refresh_unlocks(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare harvested bigint; caught bigint; crop_types integer; fish_types integer; result jsonb; new_decor text[];
begin
  select coalesce(sum(total) filter(where kind='crop'),0), coalesce(sum(total) filter(where kind='fish'),0),
    count(*) filter(where kind='crop'), count(*) filter(where kind='fish')
  into harvested,caught,crop_types,fish_types from public.farm_v3_collections where user_id=p_user_id;
  with granted as (
    insert into public.farm_v3_unlocks(user_id,kind,item_id)
    select p_user_id,c.kind,c.item_id from public.farm_v3_catalog c
    where c.kind in ('crop','fish','decor','character') and c.need_harvests<=harvested and c.need_fish<=caught
      and c.need_crop_types<=crop_types and c.need_fish_types<=fish_types
    on conflict(user_id,kind,item_id) do nothing returning kind,item_id
  ) select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'id',item_id)),'[]'::jsonb) into result from granted;
  select array_agg(entry->>'id') into new_decor from jsonb_array_elements(result) entry where entry->>'kind'='decor';
  if cardinality(new_decor)>0 then
    update public.farm_v3_profiles set decorations=decorations||new_decor,version=version+1,updated_at=now()
    where user_id=p_user_id;
  end if;
  return result;
end;
$$;
revoke all on function public.farm_v3_refresh_unlocks(uuid) from public,anon,authenticated;

create or replace function public.farm_v3_state_json(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'version',1,'charactersVersion',1,
    'coinBalance',(select coin_balance from public.farm_wallets where user_id=p_user_id),
    'profile',(select jsonb_build_object('nickname',p.nickname,'characterId',p.character_id,'decorations',p.decorations,
      'plazaPublic',p.plaza_public,'pose',p.plaza_pose,'zone',p.plaza_zone,'version',p.version) from public.farm_v3_profiles p where p.user_id=p_user_id),
    'runs',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'itemId',r.item_id,'slot',r.slot,
      'progress',r.progress,'cost',r.growth_cost) order by r.kind,r.slot) from public.farm_v3_runs r where r.user_id=p_user_id and r.claimed_at is null),'[]'::jsonb),
    'collections',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'count',c.total,'firstAt',c.first_at) order by c.kind,c.item_id)
      from public.farm_v3_collections c where c.user_id=p_user_id),'[]'::jsonb),
    'unlocks',coalesce((select jsonb_agg(jsonb_build_object('kind',u.kind,'id',u.item_id) order by u.kind,u.item_id)
      from public.farm_v3_unlocks u where u.user_id=p_user_id and u.kind in ('crop','fish','decor','character')),'[]'::jsonb),
    'catalog',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'name',c.name,'cost',c.growth_cost,
      'harvests',c.need_harvests,'fish',c.need_fish,'cropTypes',c.need_crop_types,'fishTypes',c.need_fish_types) order by c.sort_order)
      from public.farm_v3_catalog c where c.kind in ('crop','fish','decor','character')),'[]'::jsonb)
  );
$$;
revoke all on function public.farm_v3_state_json(uuid) from public,anon,authenticated;

create or replace function public.perform_my_farm_v3_action(p_action text,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  current_user_id uuid:=auth.uid(); cached jsonb; selected public.farm_v3_catalog%rowtype;
  run_row public.farm_v3_runs%rowtype; profile_row public.farm_v3_profiles%rowtype;
  item_kind text; selected_slot integer; amount integer; spent integer; balance bigint;
  event jsonb:='{}'::jsonb; new_unlocks jsonb; appearance jsonb; decor_ids text[];
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_action is null or p_action not in ('plant','grow','harvest','fish_start','fish_grow','fish_claim','character','avatar','plaza','decor') then raise exception 'FARM_V3_UNKNOWN_ACTION'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'FARM_V3_INVALID_INPUT'; end if;
  perform public.ensure_farm_v3_user(current_user_id);
  perform public.lock_my_farm_actions(current_user_id);
  cached:=public.begin_my_farm_action(current_user_id,p_request_id,'farm_v3:'||p_action);
  if cached is not null then return public.farm_v3_result_json(current_user_id,cached->'event'); end if;

  if p_action in ('plant','fish_start') then
    item_kind:=case when p_action='plant' then 'crop' else 'fish' end;
    select * into selected from public.farm_v3_catalog where kind=item_kind and item_id=p_payload->>'itemId';
    if not found then raise exception 'FARM_V3_UNKNOWN_ITEM'; end if;
    if not exists(select 1 from public.farm_v3_unlocks where user_id=current_user_id and kind=item_kind and item_id=selected.item_id) then raise exception 'FARM_V3_LOCKED'; end if;
    if item_kind='crop' then
      if coalesce(p_payload->>'slot','') !~ '^[0-3]$' then raise exception 'FARM_V3_INVALID_SLOT'; end if;
      selected_slot:=(p_payload->>'slot')::integer;
    end if;
    if exists(select 1 from public.farm_v3_runs where user_id=current_user_id and kind=item_kind
      and (item_kind='fish' or slot=selected_slot) and claimed_at is null) then raise exception 'FARM_V3_OCCUPIED'; end if;
    insert into public.farm_v3_runs(user_id,kind,item_id,slot,growth_cost)
      values(current_user_id,item_kind,selected.item_id,selected_slot,selected.growth_cost) returning * into run_row;
    event:=jsonb_build_object('kind','started','name',selected.name,'runId',run_row.id);
  elsif p_action in ('grow','fish_grow') then
    item_kind:=case when p_action='grow' then 'crop' else 'fish' end;
    if coalesce(p_payload->>'amount','') !~ '^[0-9]{1,3}$' then raise exception 'FARM_V3_INVALID_AMOUNT'; end if;
    amount:=(p_payload->>'amount')::integer;
    if amount not between 1 and 100 then raise exception 'FARM_V3_INVALID_AMOUNT'; end if;
    select * into run_row from public.farm_v3_runs where id=(p_payload->>'runId')::uuid
      and user_id=current_user_id and kind=item_kind for update;
    if not found or run_row.claimed_at is not null then raise exception 'FARM_V3_RUN_NOT_FOUND'; end if;
    if run_row.progress>=run_row.growth_cost then raise exception 'FARM_V3_COMPLETE'; end if;
    select coin_balance into balance from public.farm_wallets where user_id=current_user_id for update;
    if balance<1 then raise exception 'FARM_INSUFFICIENT_COIN'; end if;
    spent:=least(amount,run_row.growth_cost-run_row.progress,balance)::integer;
    perform public.apply_farm_wallet_change(current_user_id,'coin',-spent,'농장·낚시 Coin 사용','farm-v3-grow:'||p_request_id);
    update public.farm_v3_runs set progress=progress+spent where id=run_row.id returning * into run_row;
    event:=jsonb_build_object('kind','grown','spentCoin',spent,'runId',run_row.id,'completed',run_row.progress=run_row.growth_cost);
  elsif p_action in ('harvest','fish_claim') then
    item_kind:=case when p_action='harvest' then 'crop' else 'fish' end;
    select * into run_row from public.farm_v3_runs where id=(p_payload->>'runId')::uuid
      and user_id=current_user_id and kind=item_kind for update;
    if not found then raise exception 'FARM_V3_RUN_NOT_FOUND'; end if;
    if run_row.claimed_at is not null then raise exception 'FARM_V3_ALREADY_CLAIMED'; end if;
    if run_row.progress<run_row.growth_cost then raise exception 'FARM_V3_NOT_COMPLETE'; end if;
    update public.farm_v3_runs set claimed_at=now() where id=run_row.id;
    insert into public.farm_v3_collections(user_id,kind,item_id) values(current_user_id,item_kind,run_row.item_id)
      on conflict(user_id,kind,item_id) do update set total=public.farm_v3_collections.total+1;
    select * into selected from public.farm_v3_catalog where kind=item_kind and item_id=run_row.item_id;
    event:=jsonb_build_object('kind','collected','name',selected.name,'itemKind',item_kind,'itemId',run_row.item_id);
  else
    select * into profile_row from public.farm_v3_profiles where user_id=current_user_id for update;
    if coalesce(p_payload->>'version','') !~ '^[0-9]{1,18}$' or (p_payload->>'version')::bigint<>profile_row.version then raise exception 'FARM_V3_PROFILE_CHANGED'; end if;
    if p_action='character' then
      if jsonb_typeof(p_payload->'characterId') is distinct from 'string' then raise exception 'FARM_V3_UNKNOWN_CHARACTER'; end if;
      select * into selected from public.farm_v3_catalog where kind='character' and item_id=p_payload->>'characterId';
      if not found then raise exception 'FARM_V3_UNKNOWN_CHARACTER'; end if;
      if not exists(select 1 from public.farm_v3_unlocks where user_id=current_user_id and kind='character' and item_id=selected.item_id)
        then raise exception 'FARM_V3_LOCKED'; end if;
      update public.farm_v3_profiles set character_id=selected.item_id where user_id=current_user_id;
      event:=jsonb_build_object('kind','character','characterId',selected.item_id,'name',selected.name);
    elsif p_action='avatar' then
      raise exception 'FARM_V3_AVATAR_RETIRED';
    elsif p_action='plaza' then
      if jsonb_typeof(p_payload->'public') is distinct from 'boolean' or char_length(btrim(coalesce(p_payload->>'nickname',''))) not between 1 and 24
        or (p_payload->>'nickname')~'[[:cntrl:]]' or coalesce(p_payload->>'pose','') not in ('stand','sit')
        or coalesce(p_payload->>'zone','') not in ('square','bench','tree') then raise exception 'FARM_V3_INVALID_PLAZA'; end if;
      update public.farm_v3_profiles set nickname=btrim(p_payload->>'nickname'),plaza_public=(p_payload->>'public')::boolean,
        plaza_pose=p_payload->>'pose',plaza_zone=p_payload->>'zone' where user_id=current_user_id;
      event:=jsonb_build_object('kind','plaza');
    else
      if jsonb_typeof(p_payload->'decorations') is distinct from 'array' or jsonb_array_length(p_payload->'decorations')>6 then raise exception 'FARM_V3_INVALID_DECOR'; end if;
      select coalesce(array_agg(distinct id),'{}'::text[]) into decor_ids from jsonb_array_elements_text(p_payload->'decorations') id;
      if exists(select 1 from unnest(decor_ids) id where not exists(select 1 from public.farm_v3_unlocks u
        where u.user_id=current_user_id and u.kind='decor' and u.item_id=id)) then raise exception 'FARM_V3_LOCKED'; end if;
      update public.farm_v3_profiles set decorations=decor_ids where user_id=current_user_id;
      event:=jsonb_build_object('kind','decor');
    end if;
    update public.farm_v3_profiles set version=version+1,updated_at=now() where user_id=current_user_id;
  end if;
  new_unlocks:=public.farm_v3_refresh_unlocks(current_user_id);
  event:=event||jsonb_build_object('unlocks',new_unlocks);
  -- Only immutable event facts need permanent storage. Rebuild the current
  -- state on retries instead of retaining a full catalog snapshot per Coin.
  perform public.farm_action_finish(current_user_id,p_request_id,jsonb_build_object('event',event));
  return public.farm_v3_result_json(current_user_id,event);
end;
$$;
revoke all on function public.perform_my_farm_v3_action(text,jsonb,uuid) from public,anon;
grant execute on function public.perform_my_farm_v3_action(text,jsonb,uuid) to authenticated;

create or replace function public.get_farm_v3_plaza(p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_page is null or p_page not between 0 and 100000 then raise exception 'FARM_V3_INVALID_PAGE'; end if;
  select jsonb_build_object('snapshotAt',now(),'page',p_page,
    'total',(select count(*) from public.farm_v3_profiles where plaza_public),
    'items',coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'nickname',p.nickname,'characterId',p.character_id,'pose',p.plaza_pose,'zone',p.plaza_zone,'isMe',p.user_id=auth.uid()) order by p.user_id),'[]'::jsonb))
    into result from (select user_id,nickname,character_id,plaza_pose,plaza_zone from public.farm_v3_profiles
      where plaza_public order by user_id limit 12 offset p_page*12) p;
  return result;
end;
$$;
revoke all on function public.get_farm_v3_plaza(integer) from public,anon;
grant execute on function public.get_farm_v3_plaza(integer) to authenticated;

notify pgrst,'reload schema';


-- 098_plaza_positions_and_character_goals.sql
-- Harder future unlocks. Existing ownership is permanent and is not revoked.
insert into public.farm_v3_catalog(kind,item_id,name,growth_cost,need_harvests,need_fish,need_crop_types,need_fish_types,sort_order) values
  ('character','sprout-slime','새싹 슬라임',0,0,0,0,0,91),
  ('character','aqua-slime','물방울 슬라임',0,0,10,0,0,92),
  ('character','berry-slime','딸기 젤리',0,25,0,0,0,93),
  ('character','mushroom','버섯 친구',0,60,0,0,0,94),
  ('character','jelly-cat','젤리 고양이',0,120,0,0,0,95),
  ('character','cloud-puff','구름 친구',0,100,60,0,0,96),
  ('character','star-slime','별빛 슬라임',0,0,150,0,0,97),
  ('character','royal-slime','왕관 슬라임',0,300,200,0,0,98)
on conflict(kind,item_id) do update set name=excluded.name,need_harvests=excluded.need_harvests,
  need_fish=excluded.need_fish,need_crop_types=excluded.need_crop_types,need_fish_types=excluded.need_fish_types;

alter table public.farm_v3_profiles add column if not exists plaza_x numeric(5,2);
alter table public.farm_v3_profiles add column if not exists plaza_y numeric(5,2);
-- Retain roughly the previous area and spread existing villagers across it.
update public.farm_v3_profiles set
  plaza_x=case plaza_zone when 'bench' then 22 when 'tree' then 78 else 25+get_byte(decode(md5(user_id::text),'hex'),0)%51 end,
  plaza_y=case plaza_zone when 'bench' then 41 when 'tree' then 58 else 50+get_byte(decode(md5(user_id::text),'hex'),1)%31 end,
  version=version+1,updated_at=now() where plaza_x is null or plaza_y is null;
alter table public.farm_v3_profiles alter column plaza_x set default 50;
alter table public.farm_v3_profiles alter column plaza_y set default 65;
alter table public.farm_v3_profiles alter column plaza_x set not null;
alter table public.farm_v3_profiles alter column plaza_y set not null;
alter table public.farm_v3_profiles drop constraint if exists farm_v3_plaza_position_check;
alter table public.farm_v3_profiles add constraint farm_v3_plaza_position_check check(plaza_x between 5 and 95 and plaza_y between 15 and 95);

create or replace function public.farm_v3_state_json(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'version',1,'charactersVersion',1,'plazaPositionVersion',1,
    'coinBalance',(select coin_balance from public.farm_wallets where user_id=p_user_id),
    'profile',(select jsonb_build_object('nickname',p.nickname,'characterId',p.character_id,'decorations',p.decorations,
      'plazaPublic',p.plaza_public,'position',jsonb_build_object('x',p.plaza_x,'y',p.plaza_y),'pose',p.plaza_pose,'zone',p.plaza_zone,'version',p.version) from public.farm_v3_profiles p where p.user_id=p_user_id),
    'runs',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'itemId',r.item_id,'slot',r.slot,
      'progress',r.progress,'cost',r.growth_cost) order by r.kind,r.slot) from public.farm_v3_runs r where r.user_id=p_user_id and r.claimed_at is null),'[]'::jsonb),
    'collections',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'count',c.total,'firstAt',c.first_at) order by c.kind,c.item_id)
      from public.farm_v3_collections c where c.user_id=p_user_id),'[]'::jsonb),
    'unlocks',coalesce((select jsonb_agg(jsonb_build_object('kind',u.kind,'id',u.item_id) order by u.kind,u.item_id)
      from public.farm_v3_unlocks u where u.user_id=p_user_id and u.kind in ('crop','fish','decor','character')),'[]'::jsonb),
    'catalog',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'name',c.name,'cost',c.growth_cost,
      'harvests',c.need_harvests,'fish',c.need_fish,'cropTypes',c.need_crop_types,'fishTypes',c.need_fish_types) order by c.sort_order)
      from public.farm_v3_catalog c where c.kind in ('crop','fish','decor','character')),'[]'::jsonb)
  );
$$;
revoke all on function public.farm_v3_state_json(uuid) from public,anon,authenticated;

create or replace function public.perform_my_farm_v3_action(p_action text,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  current_user_id uuid:=auth.uid(); cached jsonb; selected public.farm_v3_catalog%rowtype;
  run_row public.farm_v3_runs%rowtype; profile_row public.farm_v3_profiles%rowtype;
  item_kind text; selected_slot integer; amount integer; spent integer; balance bigint;
  event jsonb:='{}'::jsonb; new_unlocks jsonb; appearance jsonb; decor_ids text[]; next_x numeric; next_y numeric;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_action is null or p_action not in ('plant','grow','harvest','fish_start','fish_grow','fish_claim','character','avatar','plaza','decor') then raise exception 'FARM_V3_UNKNOWN_ACTION'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'FARM_V3_INVALID_INPUT'; end if;
  perform public.ensure_farm_v3_user(current_user_id);
  perform public.lock_my_farm_actions(current_user_id);
  cached:=public.begin_my_farm_action(current_user_id,p_request_id,'farm_v3:'||p_action);
  if cached is not null then return public.farm_v3_result_json(current_user_id,cached->'event'); end if;

  if p_action in ('plant','fish_start') then
    item_kind:=case when p_action='plant' then 'crop' else 'fish' end;
    select * into selected from public.farm_v3_catalog where kind=item_kind and item_id=p_payload->>'itemId';
    if not found then raise exception 'FARM_V3_UNKNOWN_ITEM'; end if;
    if not exists(select 1 from public.farm_v3_unlocks where user_id=current_user_id and kind=item_kind and item_id=selected.item_id) then raise exception 'FARM_V3_LOCKED'; end if;
    if item_kind='crop' then
      if coalesce(p_payload->>'slot','') !~ '^[0-3]$' then raise exception 'FARM_V3_INVALID_SLOT'; end if;
      selected_slot:=(p_payload->>'slot')::integer;
    end if;
    if exists(select 1 from public.farm_v3_runs where user_id=current_user_id and kind=item_kind
      and (item_kind='fish' or slot=selected_slot) and claimed_at is null) then raise exception 'FARM_V3_OCCUPIED'; end if;
    insert into public.farm_v3_runs(user_id,kind,item_id,slot,growth_cost)
      values(current_user_id,item_kind,selected.item_id,selected_slot,selected.growth_cost) returning * into run_row;
    event:=jsonb_build_object('kind','started','name',selected.name,'runId',run_row.id);
  elsif p_action in ('grow','fish_grow') then
    item_kind:=case when p_action='grow' then 'crop' else 'fish' end;
    if coalesce(p_payload->>'amount','') !~ '^[0-9]{1,3}$' then raise exception 'FARM_V3_INVALID_AMOUNT'; end if;
    amount:=(p_payload->>'amount')::integer;
    if amount not between 1 and 100 then raise exception 'FARM_V3_INVALID_AMOUNT'; end if;
    select * into run_row from public.farm_v3_runs where id=(p_payload->>'runId')::uuid
      and user_id=current_user_id and kind=item_kind for update;
    if not found or run_row.claimed_at is not null then raise exception 'FARM_V3_RUN_NOT_FOUND'; end if;
    if run_row.progress>=run_row.growth_cost then raise exception 'FARM_V3_COMPLETE'; end if;
    select coin_balance into balance from public.farm_wallets where user_id=current_user_id for update;
    if balance<1 then raise exception 'FARM_INSUFFICIENT_COIN'; end if;
    spent:=least(amount,run_row.growth_cost-run_row.progress,balance)::integer;
    perform public.apply_farm_wallet_change(current_user_id,'coin',-spent,'농장·낚시 Coin 사용','farm-v3-grow:'||p_request_id);
    update public.farm_v3_runs set progress=progress+spent where id=run_row.id returning * into run_row;
    event:=jsonb_build_object('kind','grown','spentCoin',spent,'runId',run_row.id,'completed',run_row.progress=run_row.growth_cost);
  elsif p_action in ('harvest','fish_claim') then
    item_kind:=case when p_action='harvest' then 'crop' else 'fish' end;
    select * into run_row from public.farm_v3_runs where id=(p_payload->>'runId')::uuid
      and user_id=current_user_id and kind=item_kind for update;
    if not found then raise exception 'FARM_V3_RUN_NOT_FOUND'; end if;
    if run_row.claimed_at is not null then raise exception 'FARM_V3_ALREADY_CLAIMED'; end if;
    if run_row.progress<run_row.growth_cost then raise exception 'FARM_V3_NOT_COMPLETE'; end if;
    update public.farm_v3_runs set claimed_at=now() where id=run_row.id;
    insert into public.farm_v3_collections(user_id,kind,item_id) values(current_user_id,item_kind,run_row.item_id)
      on conflict(user_id,kind,item_id) do update set total=public.farm_v3_collections.total+1;
    select * into selected from public.farm_v3_catalog where kind=item_kind and item_id=run_row.item_id;
    event:=jsonb_build_object('kind','collected','name',selected.name,'itemKind',item_kind,'itemId',run_row.item_id);
  else
    select * into profile_row from public.farm_v3_profiles where user_id=current_user_id for update;
    if coalesce(p_payload->>'version','') !~ '^[0-9]{1,18}$' or (p_payload->>'version')::bigint<>profile_row.version then raise exception 'FARM_V3_PROFILE_CHANGED'; end if;
    if p_action='character' then
      if jsonb_typeof(p_payload->'characterId') is distinct from 'string' then raise exception 'FARM_V3_UNKNOWN_CHARACTER'; end if;
      select * into selected from public.farm_v3_catalog where kind='character' and item_id=p_payload->>'characterId';
      if not found then raise exception 'FARM_V3_UNKNOWN_CHARACTER'; end if;
      if not exists(select 1 from public.farm_v3_unlocks where user_id=current_user_id and kind='character' and item_id=selected.item_id)
        then raise exception 'FARM_V3_LOCKED'; end if;
      update public.farm_v3_profiles set character_id=selected.item_id where user_id=current_user_id;
      event:=jsonb_build_object('kind','character','characterId',selected.item_id,'name',selected.name);
    elsif p_action='avatar' then
      raise exception 'FARM_V3_AVATAR_RETIRED';
    elsif p_action='plaza' then
      if jsonb_typeof(p_payload->'public') is distinct from 'boolean' or jsonb_typeof(p_payload->'nickname') is distinct from 'string'
        or char_length(btrim(coalesce(p_payload->>'nickname',''))) not between 1 and 24 or (p_payload->>'nickname')~'[[:cntrl:]]'
        then raise exception 'FARM_V3_INVALID_PLAZA'; end if;
      next_x:=profile_row.plaza_x; next_y:=profile_row.plaza_y;
      if p_payload ? 'position' then
        if jsonb_typeof(p_payload->'position') is distinct from 'object'
          or jsonb_typeof(p_payload->'position'->'x') is distinct from 'number'
          or jsonb_typeof(p_payload->'position'->'y') is distinct from 'number'
          then raise exception 'FARM_V3_INVALID_POSITION'; end if;
        next_x:=(p_payload->'position'->>'x')::numeric; next_y:=(p_payload->'position'->>'y')::numeric;
        if next_x not between 5 and 95 or next_y not between 15 and 95 then raise exception 'FARM_V3_INVALID_POSITION'; end if;
      end if;
      update public.farm_v3_profiles set nickname=btrim(p_payload->>'nickname'),plaza_public=(p_payload->>'public')::boolean,
        plaza_x=round(next_x,2),plaza_y=round(next_y,2) where user_id=current_user_id;
      event:=jsonb_build_object('kind','plaza');
    else
      if jsonb_typeof(p_payload->'decorations') is distinct from 'array' or jsonb_array_length(p_payload->'decorations')>6 then raise exception 'FARM_V3_INVALID_DECOR'; end if;
      select coalesce(array_agg(distinct id),'{}'::text[]) into decor_ids from jsonb_array_elements_text(p_payload->'decorations') id;
      if exists(select 1 from unnest(decor_ids) id where not exists(select 1 from public.farm_v3_unlocks u
        where u.user_id=current_user_id and u.kind='decor' and u.item_id=id)) then raise exception 'FARM_V3_LOCKED'; end if;
      update public.farm_v3_profiles set decorations=decor_ids where user_id=current_user_id;
      event:=jsonb_build_object('kind','decor');
    end if;
    update public.farm_v3_profiles set version=version+1,updated_at=now() where user_id=current_user_id;
  end if;
  new_unlocks:=public.farm_v3_refresh_unlocks(current_user_id);
  event:=event||jsonb_build_object('unlocks',new_unlocks);
  -- Only immutable event facts need permanent storage. Rebuild the current
  -- state on retries instead of retaining a full catalog snapshot per Coin.
  perform public.farm_action_finish(current_user_id,p_request_id,jsonb_build_object('event',event));
  return public.farm_v3_result_json(current_user_id,event);
end;
$$;
revoke all on function public.perform_my_farm_v3_action(text,jsonb,uuid) from public,anon;
grant execute on function public.perform_my_farm_v3_action(text,jsonb,uuid) to authenticated;

create or replace function public.get_farm_v3_plaza(p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_page is null or p_page not between 0 and 100000 then raise exception 'FARM_V3_INVALID_PAGE'; end if;
  select jsonb_build_object('snapshotAt',now(),'page',p_page,
    'total',(select count(*) from public.farm_v3_profiles where plaza_public),
    'items',coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'nickname',p.nickname,'characterId',p.character_id,'position',jsonb_build_object('x',p.plaza_x,'y',p.plaza_y),'pose',p.plaza_pose,'zone',p.plaza_zone,'isMe',p.user_id=auth.uid()) order by p.user_id),'[]'::jsonb))
    into result from (select user_id,nickname,character_id,plaza_x,plaza_y,plaza_pose,plaza_zone from public.farm_v3_profiles
      where plaza_public order by user_id limit 12 offset p_page*12) p;
  return result;
end;
$$;
revoke all on function public.get_farm_v3_plaza(integer) from public,anon;
grant execute on function public.get_farm_v3_plaza(integer) to authenticated;

notify pgrst,'reload schema';


-- 099_plaza_speech.sql
-- One saved line per villager. Older forms omit speech and retain the last line.
alter table public.farm_v3_profiles add column if not exists plaza_message text not null default '';
alter table public.farm_v3_profiles drop constraint if exists farm_v3_plaza_message_check;
alter table public.farm_v3_profiles add constraint farm_v3_plaza_message_check
  check(char_length(plaza_message)<=80 and plaza_message !~ '[[:cntrl:]]' and plaza_message !~ U&'[\007F-\009F]');

create or replace function public.farm_v3_state_json(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'version',1,'charactersVersion',1,'plazaPositionVersion',1,'plazaSpeechVersion',1,
    'coinBalance',(select coin_balance from public.farm_wallets where user_id=p_user_id),
    'profile',(select jsonb_build_object('nickname',p.nickname,'characterId',p.character_id,'decorations',p.decorations,
      'plazaPublic',p.plaza_public,'speech',p.plaza_message,'position',jsonb_build_object('x',p.plaza_x,'y',p.plaza_y),'pose',p.plaza_pose,'zone',p.plaza_zone,'version',p.version) from public.farm_v3_profiles p where p.user_id=p_user_id),
    'runs',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'itemId',r.item_id,'slot',r.slot,
      'progress',r.progress,'cost',r.growth_cost) order by r.kind,r.slot) from public.farm_v3_runs r where r.user_id=p_user_id and r.claimed_at is null),'[]'::jsonb),
    'collections',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'count',c.total,'firstAt',c.first_at) order by c.kind,c.item_id)
      from public.farm_v3_collections c where c.user_id=p_user_id),'[]'::jsonb),
    'unlocks',coalesce((select jsonb_agg(jsonb_build_object('kind',u.kind,'id',u.item_id) order by u.kind,u.item_id)
      from public.farm_v3_unlocks u where u.user_id=p_user_id and u.kind in ('crop','fish','decor','character')),'[]'::jsonb),
    'catalog',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'name',c.name,'cost',c.growth_cost,
      'harvests',c.need_harvests,'fish',c.need_fish,'cropTypes',c.need_crop_types,'fishTypes',c.need_fish_types) order by c.sort_order)
      from public.farm_v3_catalog c where c.kind in ('crop','fish','decor','character')),'[]'::jsonb)
  );
$$;
revoke all on function public.farm_v3_state_json(uuid) from public,anon,authenticated;

create or replace function public.perform_my_farm_v3_action(p_action text,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  current_user_id uuid:=auth.uid(); cached jsonb; selected public.farm_v3_catalog%rowtype;
  run_row public.farm_v3_runs%rowtype; profile_row public.farm_v3_profiles%rowtype;
  item_kind text; selected_slot integer; amount integer; spent integer; balance bigint;
  event jsonb:='{}'::jsonb; new_unlocks jsonb; appearance jsonb; decor_ids text[]; next_x numeric; next_y numeric; next_speech text;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_action is null or p_action not in ('plant','grow','harvest','fish_start','fish_grow','fish_claim','character','avatar','plaza','decor') then raise exception 'FARM_V3_UNKNOWN_ACTION'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'FARM_V3_INVALID_INPUT'; end if;
  perform public.ensure_farm_v3_user(current_user_id);
  perform public.lock_my_farm_actions(current_user_id);
  cached:=public.begin_my_farm_action(current_user_id,p_request_id,'farm_v3:'||p_action);
  if cached is not null then return public.farm_v3_result_json(current_user_id,cached->'event'); end if;

  if p_action in ('plant','fish_start') then
    item_kind:=case when p_action='plant' then 'crop' else 'fish' end;
    select * into selected from public.farm_v3_catalog where kind=item_kind and item_id=p_payload->>'itemId';
    if not found then raise exception 'FARM_V3_UNKNOWN_ITEM'; end if;
    if not exists(select 1 from public.farm_v3_unlocks where user_id=current_user_id and kind=item_kind and item_id=selected.item_id) then raise exception 'FARM_V3_LOCKED'; end if;
    if item_kind='crop' then
      if coalesce(p_payload->>'slot','') !~ '^[0-3]$' then raise exception 'FARM_V3_INVALID_SLOT'; end if;
      selected_slot:=(p_payload->>'slot')::integer;
    end if;
    if exists(select 1 from public.farm_v3_runs where user_id=current_user_id and kind=item_kind
      and (item_kind='fish' or slot=selected_slot) and claimed_at is null) then raise exception 'FARM_V3_OCCUPIED'; end if;
    insert into public.farm_v3_runs(user_id,kind,item_id,slot,growth_cost)
      values(current_user_id,item_kind,selected.item_id,selected_slot,selected.growth_cost) returning * into run_row;
    event:=jsonb_build_object('kind','started','name',selected.name,'runId',run_row.id);
  elsif p_action in ('grow','fish_grow') then
    item_kind:=case when p_action='grow' then 'crop' else 'fish' end;
    if coalesce(p_payload->>'amount','') !~ '^[0-9]{1,3}$' then raise exception 'FARM_V3_INVALID_AMOUNT'; end if;
    amount:=(p_payload->>'amount')::integer;
    if amount not between 1 and 100 then raise exception 'FARM_V3_INVALID_AMOUNT'; end if;
    select * into run_row from public.farm_v3_runs where id=(p_payload->>'runId')::uuid
      and user_id=current_user_id and kind=item_kind for update;
    if not found or run_row.claimed_at is not null then raise exception 'FARM_V3_RUN_NOT_FOUND'; end if;
    if run_row.progress>=run_row.growth_cost then raise exception 'FARM_V3_COMPLETE'; end if;
    select coin_balance into balance from public.farm_wallets where user_id=current_user_id for update;
    if balance<1 then raise exception 'FARM_INSUFFICIENT_COIN'; end if;
    spent:=least(amount,run_row.growth_cost-run_row.progress,balance)::integer;
    perform public.apply_farm_wallet_change(current_user_id,'coin',-spent,'농장·낚시 Coin 사용','farm-v3-grow:'||p_request_id);
    update public.farm_v3_runs set progress=progress+spent where id=run_row.id returning * into run_row;
    event:=jsonb_build_object('kind','grown','spentCoin',spent,'runId',run_row.id,'completed',run_row.progress=run_row.growth_cost);
  elsif p_action in ('harvest','fish_claim') then
    item_kind:=case when p_action='harvest' then 'crop' else 'fish' end;
    select * into run_row from public.farm_v3_runs where id=(p_payload->>'runId')::uuid
      and user_id=current_user_id and kind=item_kind for update;
    if not found then raise exception 'FARM_V3_RUN_NOT_FOUND'; end if;
    if run_row.claimed_at is not null then raise exception 'FARM_V3_ALREADY_CLAIMED'; end if;
    if run_row.progress<run_row.growth_cost then raise exception 'FARM_V3_NOT_COMPLETE'; end if;
    update public.farm_v3_runs set claimed_at=now() where id=run_row.id;
    insert into public.farm_v3_collections(user_id,kind,item_id) values(current_user_id,item_kind,run_row.item_id)
      on conflict(user_id,kind,item_id) do update set total=public.farm_v3_collections.total+1;
    select * into selected from public.farm_v3_catalog where kind=item_kind and item_id=run_row.item_id;
    event:=jsonb_build_object('kind','collected','name',selected.name,'itemKind',item_kind,'itemId',run_row.item_id);
  else
    select * into profile_row from public.farm_v3_profiles where user_id=current_user_id for update;
    if coalesce(p_payload->>'version','') !~ '^[0-9]{1,18}$' or (p_payload->>'version')::bigint<>profile_row.version then raise exception 'FARM_V3_PROFILE_CHANGED'; end if;
    if p_action='character' then
      if jsonb_typeof(p_payload->'characterId') is distinct from 'string' then raise exception 'FARM_V3_UNKNOWN_CHARACTER'; end if;
      select * into selected from public.farm_v3_catalog where kind='character' and item_id=p_payload->>'characterId';
      if not found then raise exception 'FARM_V3_UNKNOWN_CHARACTER'; end if;
      if not exists(select 1 from public.farm_v3_unlocks where user_id=current_user_id and kind='character' and item_id=selected.item_id)
        then raise exception 'FARM_V3_LOCKED'; end if;
      update public.farm_v3_profiles set character_id=selected.item_id where user_id=current_user_id;
      event:=jsonb_build_object('kind','character','characterId',selected.item_id,'name',selected.name);
    elsif p_action='avatar' then
      raise exception 'FARM_V3_AVATAR_RETIRED';
    elsif p_action='plaza' then
      if jsonb_typeof(p_payload->'public') is distinct from 'boolean' or jsonb_typeof(p_payload->'nickname') is distinct from 'string'
        or char_length(btrim(coalesce(p_payload->>'nickname',''))) not between 1 and 24 or (p_payload->>'nickname')~'[[:cntrl:]]'
        then raise exception 'FARM_V3_INVALID_PLAZA'; end if;
      next_speech:=profile_row.plaza_message;
      if p_payload ? 'speech' then
        if jsonb_typeof(p_payload->'speech') is distinct from 'string'
          or char_length(p_payload->>'speech')>80 or (p_payload->>'speech')~'[[:cntrl:]]' or (p_payload->>'speech')~U&'[\007F-\009F]'
          then raise exception 'FARM_V3_INVALID_SPEECH'; end if;
        next_speech:=btrim(p_payload->>'speech');
      end if;
      next_x:=profile_row.plaza_x; next_y:=profile_row.plaza_y;
      if p_payload ? 'position' then
        if jsonb_typeof(p_payload->'position') is distinct from 'object'
          or jsonb_typeof(p_payload->'position'->'x') is distinct from 'number'
          or jsonb_typeof(p_payload->'position'->'y') is distinct from 'number'
          then raise exception 'FARM_V3_INVALID_POSITION'; end if;
        next_x:=(p_payload->'position'->>'x')::numeric; next_y:=(p_payload->'position'->>'y')::numeric;
        if next_x not between 5 and 95 or next_y not between 15 and 95 then raise exception 'FARM_V3_INVALID_POSITION'; end if;
      end if;
      update public.farm_v3_profiles set nickname=btrim(p_payload->>'nickname'),plaza_public=(p_payload->>'public')::boolean,
        plaza_x=round(next_x,2),plaza_y=round(next_y,2),plaza_message=next_speech where user_id=current_user_id;
      event:=jsonb_build_object('kind','plaza');
    else
      if jsonb_typeof(p_payload->'decorations') is distinct from 'array' or jsonb_array_length(p_payload->'decorations')>6 then raise exception 'FARM_V3_INVALID_DECOR'; end if;
      select coalesce(array_agg(distinct id),'{}'::text[]) into decor_ids from jsonb_array_elements_text(p_payload->'decorations') id;
      if exists(select 1 from unnest(decor_ids) id where not exists(select 1 from public.farm_v3_unlocks u
        where u.user_id=current_user_id and u.kind='decor' and u.item_id=id)) then raise exception 'FARM_V3_LOCKED'; end if;
      update public.farm_v3_profiles set decorations=decor_ids where user_id=current_user_id;
      event:=jsonb_build_object('kind','decor');
    end if;
    update public.farm_v3_profiles set version=version+1,updated_at=now() where user_id=current_user_id;
  end if;
  new_unlocks:=public.farm_v3_refresh_unlocks(current_user_id);
  event:=event||jsonb_build_object('unlocks',new_unlocks);
  -- Only immutable event facts need permanent storage. Rebuild the current
  -- state on retries instead of retaining a full catalog snapshot per Coin.
  perform public.farm_action_finish(current_user_id,p_request_id,jsonb_build_object('event',event));
  return public.farm_v3_result_json(current_user_id,event);
end;
$$;
revoke all on function public.perform_my_farm_v3_action(text,jsonb,uuid) from public,anon;
grant execute on function public.perform_my_farm_v3_action(text,jsonb,uuid) to authenticated;

create or replace function public.get_farm_v3_plaza(p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_page is null or p_page not between 0 and 100000 then raise exception 'FARM_V3_INVALID_PAGE'; end if;
  select jsonb_build_object('snapshotAt',now(),'page',p_page,
    'total',(select count(*) from public.farm_v3_profiles where plaza_public),
    'items',coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'nickname',p.nickname,'speech',p.plaza_message,'characterId',p.character_id,'position',jsonb_build_object('x',p.plaza_x,'y',p.plaza_y),'pose',p.plaza_pose,'zone',p.plaza_zone,'isMe',p.user_id=auth.uid()) order by p.user_id),'[]'::jsonb))
    into result from (select user_id,nickname,plaza_message,character_id,plaza_x,plaza_y,plaza_pose,plaza_zone from public.farm_v3_profiles
      where plaza_public order by user_id limit 12 offset p_page*12) p;
  return result;
end;
$$;
revoke all on function public.get_farm_v3_plaza(integer) from public,anon;
grant execute on function public.get_farm_v3_plaza(integer) to authenticated;

notify pgrst,'reload schema';


-- 100_public_plaza_and_crop_paths.sql
-- All signed-in farmers participate; retain the old column for older clients.
alter table public.farm_v3_profiles alter column plaza_public set default true;
update public.farm_v3_profiles set plaza_public=true,version=version+1,updated_at=now() where not plaza_public;

create table if not exists public.farm_v3_crop_requirements (
  item_id text not null,
  crop_id text not null,
  need_count integer not null check(need_count between 1 and 1000),
  kind text not null default 'crop' check(kind='crop'),
  primary key(item_id,crop_id),
  foreign key(kind,item_id) references public.farm_v3_catalog(kind,item_id),
  foreign key(kind,crop_id) references public.farm_v3_catalog(kind,item_id),
  check(item_id<>crop_id)
);
alter table public.farm_v3_crop_requirements enable row level security;
revoke all on public.farm_v3_crop_requirements from public,anon,authenticated;
grant select on public.farm_v3_crop_requirements to authenticated;
drop policy if exists "Read crop requirements" on public.farm_v3_crop_requirements;
create policy "Read crop requirements" on public.farm_v3_crop_requirements for select to authenticated using(true);
-- Replace catalog configuration only. Acquired unlocks and collections stay.
delete from public.farm_v3_crop_requirements;
insert into public.farm_v3_crop_requirements(item_id,crop_id,need_count) values
  ('corn','carrot',3),
  ('sweetPotato','potato',3),
  ('eggplant','strawberry',3),
  ('pepper','tomato',3),
  ('cucumber','pumpkin',3),
  ('onion','corn',4),
  ('garlic','sweetPotato',4),
  ('cabbage','eggplant',4),
  ('broccoli','pepper',4),
  ('watermelon','cucumber',4),
  ('melon','onion',5),
  ('rice','garlic',5),
  ('mushroom','cabbage',5),
  ('sunflower','broccoli',5),
  ('beet','watermelon',5),
  ('radish','melon',6),
  ('turnip','rice',6),
  ('chili','mushroom',6),
  ('lettuce','sunflower',6),
  ('spinach','beet',6),
  ('kale','radish',7),
  ('celery','turnip',7),
  ('pea','chili',7),
  ('bean','lettuce',7),
  ('peanut','spinach',7),
  ('wheat','kale',8),
  ('barley','celery',8),
  ('oat','pea',8),
  ('grape','bean',8),
  ('blueberry','peanut',8),
  ('raspberry','wheat',8),
  ('apple','barley',8),
  ('pear','oat',8),
  ('peach','grape',8),
  ('cherry','blueberry',8),
  ('lemon','raspberry',8),
  ('orange','apple',8),
  ('pineapple','pear',8),
  ('kiwi','peach',8),
  ('pumpkinSquash','cherry',8),
  ('daikon','lemon',8),
  ('edamame','orange',8),
  ('bokchoy','pineapple',8),
  ('chestnut','kiwi',8),
  ('fig','pumpkinSquash',8),
  ('plum','daikon',8),
  ('mango','edamame',8),
  ('passionFruit','bokchoy',8),
  ('bellFlower','chestnut',8),
  ('sweetCorn','fig',8),
  ('truffle','plum',8),
  ('lavender','mango',8);
update public.farm_v3_catalog set need_harvests=0,need_crop_types=0 where kind='crop';

create or replace function public.farm_v3_refresh_unlocks(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare harvested bigint; caught bigint; crop_types integer; fish_types integer; result jsonb; new_decor text[];
begin
  select coalesce(sum(total) filter(where kind='crop'),0), coalesce(sum(total) filter(where kind='fish'),0),
    count(*) filter(where kind='crop'), count(*) filter(where kind='fish')
  into harvested,caught,crop_types,fish_types from public.farm_v3_collections where user_id=p_user_id;
  with granted as (
    insert into public.farm_v3_unlocks(user_id,kind,item_id)
    select p_user_id,c.kind,c.item_id from public.farm_v3_catalog c
    where c.kind in ('crop','fish','decor','character') and c.need_harvests<=harvested and c.need_fish<=caught
      and c.need_crop_types<=crop_types and c.need_fish_types<=fish_types
      and not exists(select 1 from public.farm_v3_crop_requirements req
        left join public.farm_v3_collections collected on collected.user_id=p_user_id and collected.kind='crop' and collected.item_id=req.crop_id
        where c.kind='crop' and req.item_id=c.item_id and coalesce(collected.total,0)<req.need_count)
    on conflict(user_id,kind,item_id) do nothing returning kind,item_id
  ) select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'id',item_id)),'[]'::jsonb) into result from granted;
  select array_agg(entry->>'id') into new_decor from jsonb_array_elements(result) entry where entry->>'kind'='decor';
  if cardinality(new_decor)>0 then
    update public.farm_v3_profiles set decorations=decorations||new_decor,version=version+1,updated_at=now()
    where user_id=p_user_id;
  end if;
  return result;
end;
$$;
revoke all on function public.farm_v3_refresh_unlocks(uuid) from public,anon,authenticated;

create or replace function public.farm_v3_state_json(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'version',1,'charactersVersion',1,'plazaPositionVersion',1,'plazaSpeechVersion',1,'plazaAllUsersVersion',1,'cropUnlockVersion',1,
    'coinBalance',(select coin_balance from public.farm_wallets where user_id=p_user_id),
    'profile',(select jsonb_build_object('nickname',p.nickname,'characterId',p.character_id,'decorations',p.decorations,
      'plazaPublic',true,'speech',p.plaza_message,'position',jsonb_build_object('x',p.plaza_x,'y',p.plaza_y),'pose',p.plaza_pose,'zone',p.plaza_zone,'version',p.version) from public.farm_v3_profiles p where p.user_id=p_user_id),
    'runs',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'itemId',r.item_id,'slot',r.slot,
      'progress',r.progress,'cost',r.growth_cost) order by r.kind,r.slot) from public.farm_v3_runs r where r.user_id=p_user_id and r.claimed_at is null),'[]'::jsonb),
    'collections',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'count',c.total,'firstAt',c.first_at) order by c.kind,c.item_id)
      from public.farm_v3_collections c where c.user_id=p_user_id),'[]'::jsonb),
    'unlocks',coalesce((select jsonb_agg(jsonb_build_object('kind',u.kind,'id',u.item_id) order by u.kind,u.item_id)
      from public.farm_v3_unlocks u where u.user_id=p_user_id and u.kind in ('crop','fish','decor','character')),'[]'::jsonb),
    'catalog',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'name',c.name,'cost',c.growth_cost,
      'cropRequirements',coalesce((select jsonb_agg(jsonb_build_object('id',req.crop_id,'count',req.need_count) order by req.crop_id)
        from public.farm_v3_crop_requirements req where c.kind='crop' and req.item_id=c.item_id),'[]'::jsonb),
      'harvests',c.need_harvests,'fish',c.need_fish,'cropTypes',c.need_crop_types,'fishTypes',c.need_fish_types) order by c.sort_order)
      from public.farm_v3_catalog c where c.kind in ('crop','fish','decor','character')),'[]'::jsonb)
  );
$$;
revoke all on function public.farm_v3_state_json(uuid) from public,anon,authenticated;

create or replace function public.perform_my_farm_v3_action(p_action text,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  current_user_id uuid:=auth.uid(); cached jsonb; selected public.farm_v3_catalog%rowtype;
  run_row public.farm_v3_runs%rowtype; profile_row public.farm_v3_profiles%rowtype;
  item_kind text; selected_slot integer; amount integer; spent integer; balance bigint;
  event jsonb:='{}'::jsonb; new_unlocks jsonb; appearance jsonb; decor_ids text[]; next_x numeric; next_y numeric; next_speech text;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_action is null or p_action not in ('plant','grow','harvest','fish_start','fish_grow','fish_claim','character','avatar','plaza','decor') then raise exception 'FARM_V3_UNKNOWN_ACTION'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'FARM_V3_INVALID_INPUT'; end if;
  perform public.ensure_farm_v3_user(current_user_id);
  perform public.lock_my_farm_actions(current_user_id);
  cached:=public.begin_my_farm_action(current_user_id,p_request_id,'farm_v3:'||p_action);
  if cached is not null then return public.farm_v3_result_json(current_user_id,cached->'event'); end if;

  if p_action in ('plant','fish_start') then
    item_kind:=case when p_action='plant' then 'crop' else 'fish' end;
    select * into selected from public.farm_v3_catalog where kind=item_kind and item_id=p_payload->>'itemId';
    if not found then raise exception 'FARM_V3_UNKNOWN_ITEM'; end if;
    if not exists(select 1 from public.farm_v3_unlocks where user_id=current_user_id and kind=item_kind and item_id=selected.item_id) then raise exception 'FARM_V3_LOCKED'; end if;
    if item_kind='crop' then
      if coalesce(p_payload->>'slot','') !~ '^[0-3]$' then raise exception 'FARM_V3_INVALID_SLOT'; end if;
      selected_slot:=(p_payload->>'slot')::integer;
    end if;
    if exists(select 1 from public.farm_v3_runs where user_id=current_user_id and kind=item_kind
      and (item_kind='fish' or slot=selected_slot) and claimed_at is null) then raise exception 'FARM_V3_OCCUPIED'; end if;
    insert into public.farm_v3_runs(user_id,kind,item_id,slot,growth_cost)
      values(current_user_id,item_kind,selected.item_id,selected_slot,selected.growth_cost) returning * into run_row;
    event:=jsonb_build_object('kind','started','name',selected.name,'runId',run_row.id);
  elsif p_action in ('grow','fish_grow') then
    item_kind:=case when p_action='grow' then 'crop' else 'fish' end;
    if coalesce(p_payload->>'amount','') !~ '^[0-9]{1,3}$' then raise exception 'FARM_V3_INVALID_AMOUNT'; end if;
    amount:=(p_payload->>'amount')::integer;
    if amount not between 1 and 100 then raise exception 'FARM_V3_INVALID_AMOUNT'; end if;
    select * into run_row from public.farm_v3_runs where id=(p_payload->>'runId')::uuid
      and user_id=current_user_id and kind=item_kind for update;
    if not found or run_row.claimed_at is not null then raise exception 'FARM_V3_RUN_NOT_FOUND'; end if;
    if run_row.progress>=run_row.growth_cost then raise exception 'FARM_V3_COMPLETE'; end if;
    select coin_balance into balance from public.farm_wallets where user_id=current_user_id for update;
    if balance<1 then raise exception 'FARM_INSUFFICIENT_COIN'; end if;
    spent:=least(amount,run_row.growth_cost-run_row.progress,balance)::integer;
    perform public.apply_farm_wallet_change(current_user_id,'coin',-spent,'농장·낚시 Coin 사용','farm-v3-grow:'||p_request_id);
    update public.farm_v3_runs set progress=progress+spent where id=run_row.id returning * into run_row;
    event:=jsonb_build_object('kind','grown','spentCoin',spent,'runId',run_row.id,'completed',run_row.progress=run_row.growth_cost);
  elsif p_action in ('harvest','fish_claim') then
    item_kind:=case when p_action='harvest' then 'crop' else 'fish' end;
    select * into run_row from public.farm_v3_runs where id=(p_payload->>'runId')::uuid
      and user_id=current_user_id and kind=item_kind for update;
    if not found then raise exception 'FARM_V3_RUN_NOT_FOUND'; end if;
    if run_row.claimed_at is not null then raise exception 'FARM_V3_ALREADY_CLAIMED'; end if;
    if run_row.progress<run_row.growth_cost then raise exception 'FARM_V3_NOT_COMPLETE'; end if;
    update public.farm_v3_runs set claimed_at=now() where id=run_row.id;
    insert into public.farm_v3_collections(user_id,kind,item_id) values(current_user_id,item_kind,run_row.item_id)
      on conflict(user_id,kind,item_id) do update set total=public.farm_v3_collections.total+1;
    select * into selected from public.farm_v3_catalog where kind=item_kind and item_id=run_row.item_id;
    event:=jsonb_build_object('kind','collected','name',selected.name,'itemKind',item_kind,'itemId',run_row.item_id);
  else
    select * into profile_row from public.farm_v3_profiles where user_id=current_user_id for update;
    if coalesce(p_payload->>'version','') !~ '^[0-9]{1,18}$' or (p_payload->>'version')::bigint<>profile_row.version then raise exception 'FARM_V3_PROFILE_CHANGED'; end if;
    if p_action='character' then
      if jsonb_typeof(p_payload->'characterId') is distinct from 'string' then raise exception 'FARM_V3_UNKNOWN_CHARACTER'; end if;
      select * into selected from public.farm_v3_catalog where kind='character' and item_id=p_payload->>'characterId';
      if not found then raise exception 'FARM_V3_UNKNOWN_CHARACTER'; end if;
      if not exists(select 1 from public.farm_v3_unlocks where user_id=current_user_id and kind='character' and item_id=selected.item_id)
        then raise exception 'FARM_V3_LOCKED'; end if;
      update public.farm_v3_profiles set character_id=selected.item_id where user_id=current_user_id;
      event:=jsonb_build_object('kind','character','characterId',selected.item_id,'name',selected.name);
    elsif p_action='avatar' then
      raise exception 'FARM_V3_AVATAR_RETIRED';
    elsif p_action='plaza' then
      if jsonb_typeof(p_payload->'nickname') is distinct from 'string'
        or char_length(btrim(coalesce(p_payload->>'nickname',''))) not between 1 and 24 or (p_payload->>'nickname')~'[[:cntrl:]]'
        then raise exception 'FARM_V3_INVALID_PLAZA'; end if;
      next_speech:=profile_row.plaza_message;
      if p_payload ? 'speech' then
        if jsonb_typeof(p_payload->'speech') is distinct from 'string'
          or char_length(p_payload->>'speech')>80 or (p_payload->>'speech')~'[[:cntrl:]]' or (p_payload->>'speech')~U&'[\007F-\009F]'
          then raise exception 'FARM_V3_INVALID_SPEECH'; end if;
        next_speech:=btrim(p_payload->>'speech');
      end if;
      next_x:=profile_row.plaza_x; next_y:=profile_row.plaza_y;
      if p_payload ? 'position' then
        if jsonb_typeof(p_payload->'position') is distinct from 'object'
          or jsonb_typeof(p_payload->'position'->'x') is distinct from 'number'
          or jsonb_typeof(p_payload->'position'->'y') is distinct from 'number'
          then raise exception 'FARM_V3_INVALID_POSITION'; end if;
        next_x:=(p_payload->'position'->>'x')::numeric; next_y:=(p_payload->'position'->>'y')::numeric;
        if next_x not between 5 and 95 or next_y not between 15 and 95 then raise exception 'FARM_V3_INVALID_POSITION'; end if;
      end if;
      update public.farm_v3_profiles set nickname=btrim(p_payload->>'nickname'),plaza_public=true,
        plaza_x=round(next_x,2),plaza_y=round(next_y,2),plaza_message=next_speech where user_id=current_user_id;
      event:=jsonb_build_object('kind','plaza');
    else
      if jsonb_typeof(p_payload->'decorations') is distinct from 'array' or jsonb_array_length(p_payload->'decorations')>6 then raise exception 'FARM_V3_INVALID_DECOR'; end if;
      select coalesce(array_agg(distinct id),'{}'::text[]) into decor_ids from jsonb_array_elements_text(p_payload->'decorations') id;
      if exists(select 1 from unnest(decor_ids) id where not exists(select 1 from public.farm_v3_unlocks u
        where u.user_id=current_user_id and u.kind='decor' and u.item_id=id)) then raise exception 'FARM_V3_LOCKED'; end if;
      update public.farm_v3_profiles set decorations=decor_ids where user_id=current_user_id;
      event:=jsonb_build_object('kind','decor');
    end if;
    update public.farm_v3_profiles set version=version+1,updated_at=now() where user_id=current_user_id;
  end if;
  new_unlocks:=public.farm_v3_refresh_unlocks(current_user_id);
  event:=event||jsonb_build_object('unlocks',new_unlocks);
  -- Only immutable event facts need permanent storage. Rebuild the current
  -- state on retries instead of retaining a full catalog snapshot per Coin.
  perform public.farm_action_finish(current_user_id,p_request_id,jsonb_build_object('event',event));
  return public.farm_v3_result_json(current_user_id,event);
end;
$$;
revoke all on function public.perform_my_farm_v3_action(text,jsonb,uuid) from public,anon;
grant execute on function public.perform_my_farm_v3_action(text,jsonb,uuid) to authenticated;

create or replace function public.get_farm_v3_plaza(p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_page is null or p_page not between 0 and 100000 then raise exception 'FARM_V3_INVALID_PAGE'; end if;
  select jsonb_build_object('snapshotAt',now(),'page',p_page,
    'total',(select count(*) from public.farm_v3_profiles),
    'items',coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'nickname',p.nickname,'speech',p.plaza_message,'characterId',p.character_id,'position',jsonb_build_object('x',p.plaza_x,'y',p.plaza_y),'pose',p.plaza_pose,'zone',p.plaza_zone,'isMe',p.user_id=auth.uid()) order by p.user_id),'[]'::jsonb))
    into result from (select user_id,nickname,plaza_message,character_id,plaza_x,plaza_y,plaza_pose,plaza_zone from public.farm_v3_profiles
      order by user_id limit 12 offset p_page*12) p;
  return result;
end;
$$;
revoke all on function public.get_farm_v3_plaza(integer) from public,anon;
grant execute on function public.get_farm_v3_plaza(integer) to authenticated;

notify pgrst,'reload schema';


-- 101_manual_farm_decorations.sql
-- Previously every unlocked prop was equipped automatically. Clear the old
-- placements once; ownership, crops, wallets, character and plaza stay intact.
-- The marker ensures rerunning this migration preserves later manual choices.
alter table public.farm_v3_profiles add column if not exists decor_manual_ready boolean not null default false;
update public.farm_v3_profiles set decorations='{}'::text[],decor_manual_ready=true,
  version=version+case when cardinality(decorations)>0 then 1 else 0 end,
  updated_at=case when cardinality(decorations)>0 then now() else updated_at end
  where not decor_manual_ready;
alter table public.farm_v3_profiles alter column decor_manual_ready set default true;

create or replace function public.farm_v3_refresh_unlocks(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare harvested bigint; caught bigint; crop_types integer; fish_types integer; result jsonb;
begin
  select coalesce(sum(total) filter(where kind='crop'),0), coalesce(sum(total) filter(where kind='fish'),0),
    count(*) filter(where kind='crop'), count(*) filter(where kind='fish')
  into harvested,caught,crop_types,fish_types from public.farm_v3_collections where user_id=p_user_id;
  with granted as (
    insert into public.farm_v3_unlocks(user_id,kind,item_id)
    select p_user_id,c.kind,c.item_id from public.farm_v3_catalog c
    where c.kind in ('crop','fish','decor','character') and c.need_harvests<=harvested and c.need_fish<=caught
      and c.need_crop_types<=crop_types and c.need_fish_types<=fish_types
      and not exists(select 1 from public.farm_v3_crop_requirements req
        left join public.farm_v3_collections collected on collected.user_id=p_user_id and collected.kind='crop' and collected.item_id=req.crop_id
        where c.kind='crop' and req.item_id=c.item_id and coalesce(collected.total,0)<req.need_count)
    on conflict(user_id,kind,item_id) do nothing returning kind,item_id
  ) select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'id',item_id)),'[]'::jsonb) into result from granted;
  return result;
end;
$$;
revoke all on function public.farm_v3_refresh_unlocks(uuid) from public,anon,authenticated;

create or replace function public.farm_v3_state_json(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'version',1,'charactersVersion',1,'plazaPositionVersion',1,'plazaSpeechVersion',1,'plazaAllUsersVersion',1,'cropUnlockVersion',1,'manualDecorVersion',1,
    'coinBalance',(select coin_balance from public.farm_wallets where user_id=p_user_id),
    'profile',(select jsonb_build_object('nickname',p.nickname,'characterId',p.character_id,'decorations',p.decorations,
      'plazaPublic',true,'speech',p.plaza_message,'position',jsonb_build_object('x',p.plaza_x,'y',p.plaza_y),'pose',p.plaza_pose,'zone',p.plaza_zone,'version',p.version) from public.farm_v3_profiles p where p.user_id=p_user_id),
    'runs',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'itemId',r.item_id,'slot',r.slot,
      'progress',r.progress,'cost',r.growth_cost) order by r.kind,r.slot) from public.farm_v3_runs r where r.user_id=p_user_id and r.claimed_at is null),'[]'::jsonb),
    'collections',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'count',c.total,'firstAt',c.first_at) order by c.kind,c.item_id)
      from public.farm_v3_collections c where c.user_id=p_user_id),'[]'::jsonb),
    'unlocks',coalesce((select jsonb_agg(jsonb_build_object('kind',u.kind,'id',u.item_id) order by u.kind,u.item_id)
      from public.farm_v3_unlocks u where u.user_id=p_user_id and u.kind in ('crop','fish','decor','character')),'[]'::jsonb),
    'catalog',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'name',c.name,'cost',c.growth_cost,
      'cropRequirements',coalesce((select jsonb_agg(jsonb_build_object('id',req.crop_id,'count',req.need_count) order by req.crop_id)
        from public.farm_v3_crop_requirements req where c.kind='crop' and req.item_id=c.item_id),'[]'::jsonb),
      'harvests',c.need_harvests,'fish',c.need_fish,'cropTypes',c.need_crop_types,'fishTypes',c.need_fish_types) order by c.sort_order)
      from public.farm_v3_catalog c where c.kind in ('crop','fish','decor','character')),'[]'::jsonb)
  );
$$;
revoke all on function public.farm_v3_state_json(uuid) from public,anon,authenticated;

notify pgrst,'reload schema';


-- 102_farm_free_watering.sql
-- Each newly planted crop can be watered immediately, then every five hours.
-- Water adds one growth point for free. No time growth or withering is added.
alter table public.farm_v3_runs add column if not exists last_watered_at timestamptz;

create or replace function public.farm_v3_state_json(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'version',1,'charactersVersion',1,'plazaPositionVersion',1,'plazaSpeechVersion',1,'plazaAllUsersVersion',1,'cropUnlockVersion',1,'manualDecorVersion',1,'wateringVersion',1,'serverNow',now(),
    'coinBalance',(select coin_balance from public.farm_wallets where user_id=p_user_id),
    'profile',(select jsonb_build_object('nickname',p.nickname,'characterId',p.character_id,'decorations',p.decorations,
      'plazaPublic',true,'speech',p.plaza_message,'position',jsonb_build_object('x',p.plaza_x,'y',p.plaza_y),'pose',p.plaza_pose,'zone',p.plaza_zone,'version',p.version) from public.farm_v3_profiles p where p.user_id=p_user_id),
    'runs',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'itemId',r.item_id,'slot',r.slot,
      'progress',r.progress,'cost',r.growth_cost,'waterReadyAt',case when r.kind='crop' and r.last_watered_at is not null then r.last_watered_at+interval '5 hours' else null end) order by r.kind,r.slot) from public.farm_v3_runs r where r.user_id=p_user_id and r.claimed_at is null),'[]'::jsonb),
    'collections',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'count',c.total,'firstAt',c.first_at) order by c.kind,c.item_id)
      from public.farm_v3_collections c where c.user_id=p_user_id),'[]'::jsonb),
    'unlocks',coalesce((select jsonb_agg(jsonb_build_object('kind',u.kind,'id',u.item_id) order by u.kind,u.item_id)
      from public.farm_v3_unlocks u where u.user_id=p_user_id and u.kind in ('crop','fish','decor','character')),'[]'::jsonb),
    'catalog',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.item_id,'name',c.name,'cost',c.growth_cost,
      'cropRequirements',coalesce((select jsonb_agg(jsonb_build_object('id',req.crop_id,'count',req.need_count) order by req.crop_id)
        from public.farm_v3_crop_requirements req where c.kind='crop' and req.item_id=c.item_id),'[]'::jsonb),
      'harvests',c.need_harvests,'fish',c.need_fish,'cropTypes',c.need_crop_types,'fishTypes',c.need_fish_types) order by c.sort_order)
      from public.farm_v3_catalog c where c.kind in ('crop','fish','decor','character')),'[]'::jsonb)
  );
$$;
revoke all on function public.farm_v3_state_json(uuid) from public,anon,authenticated;

create or replace function public.perform_my_farm_v3_action(p_action text,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  current_user_id uuid:=auth.uid(); cached jsonb; selected public.farm_v3_catalog%rowtype;
  run_row public.farm_v3_runs%rowtype; profile_row public.farm_v3_profiles%rowtype;
  item_kind text; selected_slot integer; amount integer; spent integer; balance bigint;
  event jsonb:='{}'::jsonb; new_unlocks jsonb; appearance jsonb; decor_ids text[]; next_x numeric; next_y numeric; next_speech text;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_action is null or p_action not in ('plant','water','grow','harvest','fish_start','fish_grow','fish_claim','character','avatar','plaza','decor') then raise exception 'FARM_V3_UNKNOWN_ACTION'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'FARM_V3_INVALID_INPUT'; end if;
  perform public.ensure_farm_v3_user(current_user_id);
  perform public.lock_my_farm_actions(current_user_id);
  cached:=public.begin_my_farm_action(current_user_id,p_request_id,'farm_v3:'||p_action);
  if cached is not null then return public.farm_v3_result_json(current_user_id,cached->'event'); end if;

  if p_action in ('plant','fish_start') then
    item_kind:=case when p_action='plant' then 'crop' else 'fish' end;
    select * into selected from public.farm_v3_catalog where kind=item_kind and item_id=p_payload->>'itemId';
    if not found then raise exception 'FARM_V3_UNKNOWN_ITEM'; end if;
    if not exists(select 1 from public.farm_v3_unlocks where user_id=current_user_id and kind=item_kind and item_id=selected.item_id) then raise exception 'FARM_V3_LOCKED'; end if;
    if item_kind='crop' then
      if coalesce(p_payload->>'slot','') !~ '^[0-3]$' then raise exception 'FARM_V3_INVALID_SLOT'; end if;
      selected_slot:=(p_payload->>'slot')::integer;
    end if;
    if exists(select 1 from public.farm_v3_runs where user_id=current_user_id and kind=item_kind
      and (item_kind='fish' or slot=selected_slot) and claimed_at is null) then raise exception 'FARM_V3_OCCUPIED'; end if;
    insert into public.farm_v3_runs(user_id,kind,item_id,slot,growth_cost)
      values(current_user_id,item_kind,selected.item_id,selected_slot,selected.growth_cost) returning * into run_row;
    event:=jsonb_build_object('kind','started','name',selected.name,'runId',run_row.id);
  elsif p_action='water' then
    select * into run_row from public.farm_v3_runs where id=(p_payload->>'runId')::uuid
      and user_id=current_user_id and kind='crop' for update;
    if not found or run_row.claimed_at is not null then raise exception 'FARM_V3_RUN_NOT_FOUND'; end if;
    if run_row.progress>=run_row.growth_cost then raise exception 'FARM_V3_COMPLETE'; end if;
    if run_row.last_watered_at is not null and run_row.last_watered_at>now()-interval '5 hours'
      then raise exception 'FARM_V3_WATER_COOLDOWN'; end if;
    update public.farm_v3_runs set progress=least(growth_cost,progress+1),last_watered_at=now()
      where id=run_row.id returning * into run_row;
    event:=jsonb_build_object('kind','watered','runId',run_row.id,'growth',1,
      'completed',run_row.progress=run_row.growth_cost,'nextWaterAt',run_row.last_watered_at+interval '5 hours');
  elsif p_action in ('grow','fish_grow') then
    item_kind:=case when p_action='grow' then 'crop' else 'fish' end;
    if coalesce(p_payload->>'amount','') !~ '^[0-9]{1,3}$' then raise exception 'FARM_V3_INVALID_AMOUNT'; end if;
    amount:=(p_payload->>'amount')::integer;
    if amount not between 1 and 100 then raise exception 'FARM_V3_INVALID_AMOUNT'; end if;
    select * into run_row from public.farm_v3_runs where id=(p_payload->>'runId')::uuid
      and user_id=current_user_id and kind=item_kind for update;
    if not found or run_row.claimed_at is not null then raise exception 'FARM_V3_RUN_NOT_FOUND'; end if;
    if run_row.progress>=run_row.growth_cost then raise exception 'FARM_V3_COMPLETE'; end if;
    select coin_balance into balance from public.farm_wallets where user_id=current_user_id for update;
    if balance<1 then raise exception 'FARM_INSUFFICIENT_COIN'; end if;
    spent:=least(amount,run_row.growth_cost-run_row.progress,balance)::integer;
    perform public.apply_farm_wallet_change(current_user_id,'coin',-spent,'농장·낚시 Coin 사용','farm-v3-grow:'||p_request_id);
    update public.farm_v3_runs set progress=progress+spent where id=run_row.id returning * into run_row;
    event:=jsonb_build_object('kind','grown','spentCoin',spent,'runId',run_row.id,'completed',run_row.progress=run_row.growth_cost);
  elsif p_action in ('harvest','fish_claim') then
    item_kind:=case when p_action='harvest' then 'crop' else 'fish' end;
    select * into run_row from public.farm_v3_runs where id=(p_payload->>'runId')::uuid
      and user_id=current_user_id and kind=item_kind for update;
    if not found then raise exception 'FARM_V3_RUN_NOT_FOUND'; end if;
    if run_row.claimed_at is not null then raise exception 'FARM_V3_ALREADY_CLAIMED'; end if;
    if run_row.progress<run_row.growth_cost then raise exception 'FARM_V3_NOT_COMPLETE'; end if;
    update public.farm_v3_runs set claimed_at=now() where id=run_row.id;
    insert into public.farm_v3_collections(user_id,kind,item_id) values(current_user_id,item_kind,run_row.item_id)
      on conflict(user_id,kind,item_id) do update set total=public.farm_v3_collections.total+1;
    select * into selected from public.farm_v3_catalog where kind=item_kind and item_id=run_row.item_id;
    event:=jsonb_build_object('kind','collected','name',selected.name,'itemKind',item_kind,'itemId',run_row.item_id);
  else
    select * into profile_row from public.farm_v3_profiles where user_id=current_user_id for update;
    if coalesce(p_payload->>'version','') !~ '^[0-9]{1,18}$' or (p_payload->>'version')::bigint<>profile_row.version then raise exception 'FARM_V3_PROFILE_CHANGED'; end if;
    if p_action='character' then
      if jsonb_typeof(p_payload->'characterId') is distinct from 'string' then raise exception 'FARM_V3_UNKNOWN_CHARACTER'; end if;
      select * into selected from public.farm_v3_catalog where kind='character' and item_id=p_payload->>'characterId';
      if not found then raise exception 'FARM_V3_UNKNOWN_CHARACTER'; end if;
      if not exists(select 1 from public.farm_v3_unlocks where user_id=current_user_id and kind='character' and item_id=selected.item_id)
        then raise exception 'FARM_V3_LOCKED'; end if;
      update public.farm_v3_profiles set character_id=selected.item_id where user_id=current_user_id;
      event:=jsonb_build_object('kind','character','characterId',selected.item_id,'name',selected.name);
    elsif p_action='avatar' then
      raise exception 'FARM_V3_AVATAR_RETIRED';
    elsif p_action='plaza' then
      if jsonb_typeof(p_payload->'nickname') is distinct from 'string'
        or char_length(btrim(coalesce(p_payload->>'nickname',''))) not between 1 and 24 or (p_payload->>'nickname')~'[[:cntrl:]]'
        then raise exception 'FARM_V3_INVALID_PLAZA'; end if;
      next_speech:=profile_row.plaza_message;
      if p_payload ? 'speech' then
        if jsonb_typeof(p_payload->'speech') is distinct from 'string'
          or char_length(p_payload->>'speech')>80 or (p_payload->>'speech')~'[[:cntrl:]]' or (p_payload->>'speech')~U&'[\007F-\009F]'
          then raise exception 'FARM_V3_INVALID_SPEECH'; end if;
        next_speech:=btrim(p_payload->>'speech');
      end if;
      next_x:=profile_row.plaza_x; next_y:=profile_row.plaza_y;
      if p_payload ? 'position' then
        if jsonb_typeof(p_payload->'position') is distinct from 'object'
          or jsonb_typeof(p_payload->'position'->'x') is distinct from 'number'
          or jsonb_typeof(p_payload->'position'->'y') is distinct from 'number'
          then raise exception 'FARM_V3_INVALID_POSITION'; end if;
        next_x:=(p_payload->'position'->>'x')::numeric; next_y:=(p_payload->'position'->>'y')::numeric;
        if next_x not between 5 and 95 or next_y not between 15 and 95 then raise exception 'FARM_V3_INVALID_POSITION'; end if;
      end if;
      update public.farm_v3_profiles set nickname=btrim(p_payload->>'nickname'),plaza_public=true,
        plaza_x=round(next_x,2),plaza_y=round(next_y,2),plaza_message=next_speech where user_id=current_user_id;
      event:=jsonb_build_object('kind','plaza');
    else
      if jsonb_typeof(p_payload->'decorations') is distinct from 'array' or jsonb_array_length(p_payload->'decorations')>6 then raise exception 'FARM_V3_INVALID_DECOR'; end if;
      select coalesce(array_agg(distinct id),'{}'::text[]) into decor_ids from jsonb_array_elements_text(p_payload->'decorations') id;
      if exists(select 1 from unnest(decor_ids) id where not exists(select 1 from public.farm_v3_unlocks u
        where u.user_id=current_user_id and u.kind='decor' and u.item_id=id)) then raise exception 'FARM_V3_LOCKED'; end if;
      update public.farm_v3_profiles set decorations=decor_ids where user_id=current_user_id;
      event:=jsonb_build_object('kind','decor');
    end if;
    update public.farm_v3_profiles set version=version+1,updated_at=now() where user_id=current_user_id;
  end if;
  new_unlocks:=public.farm_v3_refresh_unlocks(current_user_id);
  event:=event||jsonb_build_object('unlocks',new_unlocks);
  -- Only immutable event facts need permanent storage. Rebuild the current
  -- state on retries instead of retaining a full catalog snapshot per Coin.
  perform public.farm_action_finish(current_user_id,p_request_id,jsonb_build_object('event',event));
  return public.farm_v3_result_json(current_user_id,event);
end;
$$;
revoke all on function public.perform_my_farm_v3_action(text,jsonb,uuid) from public,anon;
grant execute on function public.perform_my_farm_v3_action(text,jsonb,uuid) to authenticated;

notify pgrst,'reload schema';

commit;
