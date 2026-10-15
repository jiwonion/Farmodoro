begin;

-- Configuration only. Existing unlocks, collections, active runs, profiles,
-- wallets and ledger entries are retained, including old total-based unlocks.
insert into public.farm_v3_catalog(kind,item_id,name,growth_cost,need_harvests,need_fish,need_crop_types,need_fish_types,sort_order) values
  ('fish','minnow','피라미',2,0,0,0,0,57),
  ('fish','crucian','붕어',3,0,0,0,0,58),
  ('fish','carp','잉어',4,0,0,0,0,59),
  ('fish','trout','송어',4,0,0,0,0,60),
  ('fish','catfish','메기',5,0,0,0,0,61),
  ('fish','koi','비단잉어',6,0,0,0,0,62),
  ('fish','perch','농어',6,0,0,0,0,63),
  ('fish','salmon','연어',7,0,0,0,0,64),
  ('fish','loach','미꾸라지',3,0,0,0,0,65),
  ('fish','smelt','빙어',3,0,0,0,0,66),
  ('fish','bluegill','블루길',4,0,0,0,0,67),
  ('fish','sweetfish','은어',4,0,0,0,0,68),
  ('fish','eel','장어',5,0,0,0,0,69),
  ('fish','snakehead','가물치',5,0,0,0,0,70),
  ('fish','bass','배스',5,0,0,0,0,71),
  ('fish','blueTang','블루탱',6,0,0,0,0,72),
  ('fish','clownfish','흰동가리',6,0,0,0,0,73),
  ('fish','pufferfish','복어',6,0,0,0,0,74),
  ('fish','seaBream','도미',7,0,0,0,0,75),
  ('fish','flounder','넙치',7,0,0,0,0,76),
  ('fish','mackerel','고등어',7,0,0,0,0,77),
  ('fish','tuna','참치',8,0,0,0,0,78),
  ('fish','swordfish','황새치',8,0,0,0,0,79),
  ('fish','sturgeon','철갑상어',9,0,0,0,0,80),
  ('character','sprout-slime','새싹 슬라임',0,0,0,0,0,107),
  ('character','aqua-slime','물방울 슬라임',0,0,10,0,0,108),
  ('character','berry-slime','딸기 젤리',0,25,0,0,0,109),
  ('character','mushroom','버섯 친구',0,60,0,0,0,110),
  ('character','jelly-cat','젤리 고양이',0,120,0,0,0,111),
  ('character','cloud-puff','구름 친구',0,100,60,0,0,112),
  ('character','star-slime','별빛 슬라임',0,0,150,0,0,113),
  ('character','royal-slime','왕관 슬라임',0,300,200,0,0,114),
  ('character','peach-slime','복숭아 젤리',0,40,0,8,0,115),
  ('character','fox-puff','여우 친구',0,80,20,12,0,116),
  ('character','lotus-slime','연꽃 슬라임',0,0,45,0,8,117),
  ('character','moon-bunny','달토끼',0,160,80,18,10,118),
  ('character','honey-bear','꿀곰',0,220,0,24,0,119),
  ('character','crystal-slime','수정 슬라임',0,0,240,0,16,120),
  ('character','snow-penguin','눈꽃 펭귄',0,280,160,30,18,121),
  ('character','dragon-sprout','새싹 용',0,450,300,40,24,122)
on conflict(kind,item_id) do update set name=excluded.name,growth_cost=excluded.growth_cost,
  need_harvests=excluded.need_harvests,need_fish=excluded.need_fish,
  need_crop_types=excluded.need_crop_types,need_fish_types=excluded.need_fish_types,sort_order=excluded.sort_order;

create table if not exists public.farm_v3_fish_requirements (
  item_id text not null,
  fish_id text not null,
  need_count integer not null check(need_count between 1 and 1000),
  kind text not null default 'fish' check(kind='fish'),
  primary key(item_id,fish_id),
  foreign key(kind,item_id) references public.farm_v3_catalog(kind,item_id),
  foreign key(kind,fish_id) references public.farm_v3_catalog(kind,item_id),
  check(item_id<>fish_id)
);
alter table public.farm_v3_fish_requirements enable row level security;
revoke all on public.farm_v3_fish_requirements from public,anon,authenticated;
grant select on public.farm_v3_fish_requirements to authenticated;
drop policy if exists "Read fish requirements" on public.farm_v3_fish_requirements;
create policy "Read fish requirements" on public.farm_v3_fish_requirements for select to authenticated using(true);
delete from public.farm_v3_fish_requirements;
insert into public.farm_v3_fish_requirements(item_id,fish_id,need_count) values
  ('carp','minnow',3),
  ('trout','crucian',3),
  ('catfish','carp',4),
  ('koi','trout',4),
  ('perch','catfish',5),
  ('salmon','koi',5),
  ('loach','perch',6),
  ('smelt','salmon',6),
  ('bluegill','loach',7),
  ('sweetfish','smelt',7),
  ('eel','bluegill',8),
  ('snakehead','sweetfish',8),
  ('bass','eel',8),
  ('blueTang','snakehead',8),
  ('clownfish','bass',8),
  ('pufferfish','blueTang',8),
  ('seaBream','clownfish',8),
  ('flounder','pufferfish',8),
  ('mackerel','seaBream',8),
  ('tuna','flounder',8),
  ('swordfish','mackerel',8),
  ('sturgeon','tuna',8);

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
      and not exists(select 1 from public.farm_v3_fish_requirements req
        left join public.farm_v3_collections collected on collected.user_id=p_user_id and collected.kind='fish' and collected.item_id=req.fish_id
        where c.kind='fish' and req.item_id=c.item_id and coalesce(collected.total,0)<req.need_count)
    on conflict(user_id,kind,item_id) do nothing returning kind,item_id
  ) select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'id',item_id)),'[]'::jsonb) into result from granted;
  return result;
end;
$$;
revoke all on function public.farm_v3_refresh_unlocks(uuid) from public,anon,authenticated;

create or replace function public.farm_v3_state_json(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'version',1,'charactersVersion',1,'plazaPositionVersion',1,'plazaSpeechVersion',1,'plazaAllUsersVersion',1,'cropUnlockVersion',1,'fishUnlockVersion',1,'manualDecorVersion',1,'wateringVersion',1,'serverNow',now(),
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
      'fishRequirements',coalesce((select jsonb_agg(jsonb_build_object('id',req.fish_id,'count',req.need_count) order by req.fish_id)
        from public.farm_v3_fish_requirements req where c.kind='fish' and req.item_id=c.item_id),'[]'::jsonb),
      'harvests',c.need_harvests,'fish',c.need_fish,'cropTypes',c.need_crop_types,'fishTypes',c.need_fish_types) order by c.sort_order)
      from public.farm_v3_catalog c where c.kind in ('crop','fish','decor','character')),'[]'::jsonb)
  );
$$;
revoke all on function public.farm_v3_state_json(uuid) from public,anon,authenticated;

-- Existing state/action RPCs call ensure_farm_v3_user and refresh_unlocks.
-- Catch claims increment the matching species before refreshing these paths;
-- fish starts and representative selection retain server ownership checks.
notify pgrst,'reload schema';
commit;
