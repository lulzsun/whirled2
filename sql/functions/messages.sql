-- Create a function to retrieve user's messages with limits
DROP FUNCTION IF EXISTS public.get_message_groups;
CREATE FUNCTION public.get_message_groups(msg_limit bigint default 10, msg_offset bigint default 0)
RETURNS TABLE (
  group_id bigint,
  title text, 
  msg text, 
  msg_username text, 
  msg_nickname text,
  msg_avatar text,
  owner_username text, 
  owner_nickname text,
  owner_avatar text,
  created_at timestamp with time zone,
  users jsonb,
  full_count bigint
)
AS $$
BEGIN
  RETURN QUERY
  select 
    mgu.group_id,
    mg.title,
    msg.content as msg,
    pr.username as msg_username,
    pr.nickname as msg_nickname,
    pr.avatar_url as msg_avatar,
    p.username as owner_username,
    p.nickname as owner_nickname,
    p.avatar_url as owner_avatar,
    msg.created_at as created_at,
    mgus.jsonb_agg as users,
    count(*) OVER() AS full_count
  from message_group_users mgu
  left join message_groups mg on mg.id = mgu.group_id
  left join profiles p on p.id = mg.owner_id
  left join ( 
    SELECT DISTINCT ON (group_id) 
      me.content, 
      me.user_id,
      me.group_id,
      me.created_at
    FROM messages me
    order by group_id, me.created_at desc
  ) msg on msg.group_id = mgu.group_id
  left join profiles pr on pr.id = msg.user_id
  left join (
    SELECT jsonb_agg(
      json_build_object(
        'username', p.username, 
        'nickname', p.nickname, 
        'avatar_url', p.avatar_url
      )
    ), t.group_id FROM message_group_users t 
    left join profiles p on p.id = t.user_id
    group by t.group_id
  ) mgus on mgus.group_id = mgu.group_id
  where mgu.user_id = auth.uid()
  order by msg.created_at desc
  limit msg_limit -- max msgs
  offset msg_offset; -- offset msgs (for pagination)
END;
$$ LANGUAGE plpgsql security definer;

-- Create a function to retrieve full message thread
DROP FUNCTION IF EXISTS public.get_messages;
CREATE FUNCTION public.get_messages(msg_id bigint, msg_limit bigint default 10, msg_offset bigint default 0)
RETURNS TABLE (
  id bigint,
  username text,
  nickname text,
  avatar_url text,
  content text, 
  created_at timestamp with time zone,
  users jsonb,
  full_count bigint
)
AS $$
BEGIN
  RETURN QUERY
  select 
    m.id,
    p.username,
    p.nickname,
    p.avatar_url,
    m.content,
    m.created_at,
    mgus.jsonb_agg as users,
    count(*) OVER() AS full_count
  from messages m 
  left join profiles p on p.id = m.user_id
  left join message_group_users mgu on mgu.user_id = auth.uid() and mgu.group_id = msg_id
  left join (
    SELECT jsonb_agg(
      json_build_object(
        'id', p.id,
        'username', p.username, 
        'nickname', p.nickname, 
        'avatar_url', p.avatar_url
      )
    ), t.group_id FROM message_group_users t 
    left join profiles p on p.id = t.user_id
    group by t.group_id
  ) mgus on mgus.group_id = mgu.group_id
  where mgu.user_id = auth.uid()
  and m.group_id = msg_id
  order by m.created_at desc
  limit msg_limit -- max msgs
  offset msg_offset; -- offset msgs (for pagination)
END;
$$ LANGUAGE plpgsql security definer;

-- Create a function to allow users to compose a new message
DROP FUNCTION IF EXISTS public.compose_message;
CREATE FUNCTION public.compose_message(
  usernames text[], 
  subject text,
  body text
) RETURNS TABLE (
  group_id bigint,
  content text,
  users jsonb
) AS $$
BEGIN
  RETURN QUERY
  WITH pi as (
    SELECT * FROM profiles p WHERE p.username=ANY(array[usernames])
  ),
  gg as (
    INSERT INTO message_groups (
      owner_id,
      title
    ) VALUES (
      auth.uid(),
      subject
    )
    RETURNING *
  ),
  gu as (
    INSERT INTO message_group_users (
      user_id,
      group_id
    ) 
    SELECT pi.id, gg.id FROM pi, gg
    RETURNING *
  ),
  mgus as (
    SELECT jsonb_agg(
      json_build_object(
        'id', pi.id,
        'username', pi.username, 
        'nickname', pi.nickname, 
        'avatar_url', pi.avatar_url
      )
    ), gu.group_id FROM gu, pi
    where gu.user_id = pi.id
    group by gu.group_id
  ),
  mm as (
    INSERT INTO messages (
      user_id,
      group_id,
      content
    ) 
    SELECT pi.id, gg.id, body FROM pi, gg where pi.id = auth.uid()
    RETURNING *
  )
  SELECT gg.id, body as content, mgus.jsonb_agg as users FROM gg, mgus;
END;
$$ LANGUAGE plpgsql security definer;

-- Create a function to allow users to reply to a message group
DROP FUNCTION IF EXISTS public.send_message;
CREATE FUNCTION public.send_message(
  _group_id bigint,
  body text
) RETURNS TABLE (
  group_id bigint,
  msg_id bigint,
  content text,
  users jsonb
) AS $$
BEGIN
  RETURN QUERY
  WITH mgus as (
    SELECT jsonb_agg(
      json_build_object(
        'id', p.id,
        'username', p.username, 
        'nickname', p.nickname, 
        'avatar_url', p.avatar_url
      )
    ), t.group_id FROM message_group_users t 
    left join profiles p on p.id = t.user_id
    where t.group_id = _group_id
    group by t.group_id
  ),
  mm as (
    INSERT INTO messages (
      user_id,
      group_id,
      content
    ) 
    values (
      auth.uid(),
      _group_id,
      body
    )
    RETURNING *
  )
  SELECT _group_id as group_id, mm.id as msg_id, body as content, mgus.jsonb_agg as users FROM mgus, mm limit 1;
END;
$$ LANGUAGE plpgsql security definer;