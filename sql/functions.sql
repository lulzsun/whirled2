-- Create a function & trigger to insert a profile after inserting into auth.users
DROP FUNCTION IF EXISTS public.create_profile_for_user;
CREATE function public.create_profile_for_user()
returns trigger as $$
begin
  insert into public.profiles(id, username, nickname, birthday)
  values(new.id, new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'username', TO_DATE(new.raw_user_meta_data->>'birthday', 'MM/DD/YYYY'));
  return new;
end;
$$ language plpgsql security definer;

DROP trigger IF EXISTS on_auth_user_created on auth.users;
CREATE trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_user();

-- Create a function & trigger to insert stuff after inserting into profiles
DROP FUNCTION IF EXISTS public.create_stuff_for_user;
CREATE function public.create_stuff_for_user()
returns trigger as $$
begin
  insert into public.stuff(id)
  values(new.id);
  return new;
end;
$$ language plpgsql security definer;

DROP trigger IF EXISTS on_auth_user_created on public.profiles;
CREATE trigger on_auth_user_created
  after insert on public.profiles
  for each row execute procedure public.create_stuff_for_user();

-- Create a function to retrieve profile comments with limits
DROP FUNCTION IF EXISTS public.get_profile_comments;
CREATE FUNCTION public.get_profile_comments(
  _profile_id uuid, parent_limit bigint default 100, parent_offset bigint default 0,
  max_depth bigint default -1, _parent_id bigint default -1)
RETURNS TABLE (
  id bigint, parent_id bigint, content text, user_id uuid, 
  created_at timestamp with time zone, updated_at timestamp with time zone, depth bigint,
  username text, nickname text, avatar_url text
)
AS $$
BEGIN
  RETURN QUERY
  with recursive entries (id, parent_id) as ((
      select 
        pc.id, pc.parent_id, pc.content, pc.user_id, pc.created_at, pc.updated_at,
        CAST(0 as bigint) as _depth
      from comments as pc
      where 
      ((pc.parent_id is null and _parent_id = -1) or (pc.parent_id = _parent_id and _parent_id != -1))
      and pc.profile_id = _profile_id
      order by pc.id 
      limit parent_limit -- max root comments
      offset parent_offset -- offset root comments (for pagination)
    ) 
    union all (
      select 
        comments.id, comments.parent_id, comments.content, comments.user_id, comments.created_at, comments.updated_at,
        _depth+1 as _depth
      from entries inner join comments on (comments.parent_id = entries.id) 
      where not _depth = max_depth -- max child comments
    )
  )
  select 
    entries.*, 
    profiles.username, profiles.nickname, profiles.avatar_url 
  from entries left join profiles on entries.user_id = profiles.id;
END;
$$ LANGUAGE plpgsql security definer;