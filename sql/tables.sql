create policy "Allow individual read access" on public.profiles for select using ( auth.uid() = id );
create policy "Allow individual insert access" on public.profiles for insert with check ( auth.uid() = id );
create policy "Allow individual update access" on public.profiles for update using ( auth.uid() = id );

CREATE TABLE profiles (
    id uuid unique primary key references auth.users (id),
    created_at timestamp with time zone default now() not null,
    username unique text not null,
    nickname text not null,
    birthday date not null,
    avatar_url text not null,
    is_deleted boolean default false not null
);

CREATE TABLE comments (
    id bigint unique primary key GENERATED ALWAYS AS IDENTITY,
    profile_id uuid not null references profiles (id),
    user_id uuid not null references profiles (id),
    parent_id bigint references comments (id),
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() null,
    content text not null,
    is_deleted boolean default false not null
);

CREATE TABLE votes (
    user_id uuid not null references profiles (id),
    comment_id bigint not null references comments (id),
    is_upvote boolean not null,
    PRIMARY KEY(user_id, comment_id)
);