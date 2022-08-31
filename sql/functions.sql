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
  max_depth bigint default 100, _parent_id bigint default -1)
RETURNS TABLE (
  id bigint, parent_id bigint, content text, user_id uuid, 
  created_at timestamp with time zone, updated_at timestamp with time zone, depth int,
  path bigint[], username text, nickname text, avatar_url text, hidden_children bigint,
  votes bigint
)
AS $$
BEGIN
  RETURN QUERY
  with recursive entries (id, parent_id) as ((
      select 
        pc.id, pc.parent_id, pc.content, pc.user_id, pc.created_at, pc.updated_at,
        0 as _depth, array[pc.id] AS _path
      from comments as pc
      where 
      ((pc.parent_id is null and _parent_id = -1) or (pc.parent_id = _parent_id and _parent_id != -1))
      and pc.profile_id = _profile_id
      order by pc.id desc
      limit parent_limit -- max root comments
      offset parent_offset -- offset root comments (for pagination)
    ) 
    union all (
      select 
        comments.id, comments.parent_id, comments.content, comments.user_id, comments.created_at, comments.updated_at,
        _depth+1 as _depth, entries._path || comments.id
      from entries inner join comments on (comments.parent_id = entries.id) 
    )
  )
  SELECT * FROM (
  select DISTINCT ON (_path[1:max_depth])
    entries.*, 
    profiles.username, profiles.nickname, profiles.avatar_url,
    count(*) OVER (PARTITION BY _path[1:max_depth]) - 1 AS hidden_children, 
    coalesce((
      select sum(v.value)
      from votes v
      where v.comment_id = entries.id
    ), 0) as votes
  from entries left join profiles on entries.user_id = profiles.id ORDER BY _path[1:max_depth], _path <> _path[1:max_depth]) s order by id desc;
END;
$$ LANGUAGE plpgsql security definer;

-- Create a function & trigger to insert votes after inserting into comments
-- This will auto upvote the user's own comment
DROP FUNCTION IF EXISTS public.create_vote_after_comment;
CREATE function public.create_vote_after_comment()
returns trigger as $$
begin
  insert into public.votes(user_id, comment_id, value)
  values(new.user_id, new.id, 1);
  return new;
end;
$$ language plpgsql security definer;

DROP trigger IF EXISTS on_new_comment on public.profiles;
CREATE trigger on_new_comment
  after insert on public.comments
  for each row execute procedure public.create_vote_after_new_comment();