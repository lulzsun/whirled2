CREATE TABLE comments (
    id bigint unique primary key GENERATED ALWAYS AS IDENTITY,
    profile_id uuid not null references profiles (id),
    user_id uuid not null references profiles (id),
    parent_id bigint references comments (id),
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() null,
    content text null,
    is_deleted boolean default false not null
);

CREATE TABLE votes (
    user_id uuid not null references profiles (id),
    comment_id bigint not null references comments (id),
    is_upvote boolean not null,
    PRIMARY KEY(user_id, comment_id)
);