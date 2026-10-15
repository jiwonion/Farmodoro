begin;

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
commit;
