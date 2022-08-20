CREATE TABLE posts (
    id uuid primary key DEFAULT gen_random_uuid(),
    post_type text check(post_type in ('profile','room')),
    user_id uuid not null references profiles (id),
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() null
);

CREATE TABLE comments (
    id bigint primary key GENERATED ALWAYS AS IDENTITY,
    post_id uuid not null references posts (id),
    user_id uuid not null references profiles (id),
    ancestors bigint[],
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() null,
    content text null,
    is_deleted boolean default false not null
);
