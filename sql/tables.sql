-- Create profiles table
CREATE TABLE profiles (
  id uuid unique primary key references auth.users (id),
  created_at timestamp with time zone default now() not null,
  username unique text not null CHECK (char_length(username) <= 15),
  nickname text not null CHECK (char_length(nickname) <= 15),
  birthday date not null,
  avatar_url text not null,
  is_deleted boolean default false not null
);

create policy "Allow individual read access" on public.profiles for select using ( auth.uid() = id );
create policy "Allow individual insert access" on public.profiles for insert with check ( auth.uid() = id );
create policy "Allow individual update access" on public.profiles for update using ( auth.uid() = id );
alter table public.profiles enable row level security;

-- Create comments table
CREATE TABLE comments (
  id bigint unique primary key GENERATED ALWAYS AS IDENTITY,
  profile_id uuid not null references profiles (id),
  user_id uuid not null references profiles (id) default uid(),
  parent_id bigint references comments (id),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() null,
  content text not null CHECK (char_length(content) <= 280),
  is_deleted boolean default false not null
);

create policy "Allow individual read access" on public.comments for select using ( auth.uid() = user_id );
create policy "Allow individual insert access" on public.comments for insert with check ( auth.uid() = user_id );
create policy "Allow individual update access" on public.comments for update using ( auth.uid() = user_id );
alter table public.comments enable row level security;

-- Create votes table
CREATE TABLE votes (
  user_id uuid not null references profiles (id) default uid(),
  comment_id bigint not null references comments (id),
  value int default 0 not null,
  PRIMARY KEY(user_id, comment_id),
  constraint vote_quantity check (value <= 1 and value >= -1)
);

create policy "Allow individual read access" on public.votes for select using ( auth.uid() = user_id );
create policy "Allow individual insert access" on public.votes for insert with check ( auth.uid() = user_id );
create policy "Allow individual update access" on public.votes for update using ( auth.uid() = user_id );
alter table public.votes enable row level security;

-- Create message groups table
CREATE TABLE message_groups (
  id bigint unique primary key GENERATED ALWAYS AS IDENTITY,
  owner_id uuid not null references profiles (id),
  title text CHECK (char_length(title) <= 280),
  created_at timestamp with time zone default now() not null
);

-- Create messages table
CREATE TABLE messages (
  id bigint unique primary key GENERATED ALWAYS AS IDENTITY,
  group_id bigint not null references message_groups (id),
  user_id uuid not null references profiles (id) default uid(),
  content text not null CHECK (char_length(content) BETWEEN 1 AND 2001),
  created_at timestamp with time zone default now() not null
);

-- Create users table for message groups
CREATE TABLE message_group_users (
  user_id uuid not null references profiles (id),
  group_id bigint not null references message_groups (id),
  PRIMARY KEY(user_id, group_id)
);

-- Create all rls policies for messages, message_groups, and message_group_users
create policy "Allow individual read access" on public.message_group_users for select using ( auth.uid() = user_id );
create policy "Allow individual read access" on public.message_groups for select using (
  EXISTS( 
    SELECT 1 FROM message_group_users mgp WHERE mgp.group_id = message_groups.id AND auth.uid() = mgp.user_id
  )
);
create policy "Allow individual read access" on public.messages for select using (
  EXISTS( 
    SELECT 1 FROM message_group_users mgp WHERE mgp.group_id = messages.group_id AND auth.uid() = mgp.user_id
  )
);
alter table public.message_group_users enable row level security;
alter table public.message_groups enable row level security;
alter table public.messages enable row level security;
alter publication supabase_realtime add table public.messages;