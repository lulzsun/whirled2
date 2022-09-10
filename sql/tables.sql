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

-- Create messages table
CREATE TABLE messages (
  id bigint unique primary key GENERATED ALWAYS AS IDENTITY,
  parent_id bigint references messages (id),
  latest_reply bigint references messages (id),
  sender_id uuid not null references profiles (id) default uid(),
  reciever_id uuid not null references profiles (id) default uid(),
  title text not null CHECK (char_length(content) <= 280),
  content text not null CHECK (char_length(content) BETWEEN 1 AND 2001),
  created_at timestamp with time zone default now() not null,
  sender_is_read boolean default false not null,
  reciever_is_read boolean default false not null,
  sender_is_deleted boolean default false not null,
  reciever_is_deleted boolean default false not null
);

alter table public.messages enable row level security;