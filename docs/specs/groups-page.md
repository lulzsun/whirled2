# Spec: Groups page

Status: **implemented (M1–M4 landed)**
Owner: @lulzsun
Last updated: 2026-08-24

## 1. Summary

The header has a disabled "Groups" tab
([header.gohtml](../../web/templates/components/header.gohtml)). This spec
plans what goes behind it: user-created **groups**, each of which works like a
small subreddit — a feed of **posts**, threaded **comments** under each post,
and a **membership/role system** where the group's creator (admin) moderates
content and can promote other members to moderator.

Original Whirled had groups too (msoy `GroupRecord` / `GroupMembershipRecord`
with `MEMBER`/`MANAGER` ranks, plus a separate forum system of threads and
messages per group). We keep its shape where it fits — named groups, a
two-tier member/manager split, one discussion area per group — but the
interaction model is deliberately Reddit, not phpBB: a group _is_ its feed,
posts are voted/sorted content rather than forum threads, and moderation is a
first-class page.

This milestone is the basic skeleton. Features that make groups _social_
(invites, group rooms, discovery/search, post flair, etc.) attach later.

## 2. Goals

-   **G1** — Any logged-in user can create a group with a unique name; they
    become its **admin**.
-   **G2** — `/groups` lists groups and links to `/groups/{name}`, a public
    page showing the group's info and its feed of posts, newest first.
-   **G3** — Members can join/leave a group, create posts in it, and comment
    on posts (reusing the existing comment component and collection).
-   **G4** — The admin and moderators can **remove any post or comment** in
    their group. The admin can additionally **promote/demote moderators** and
    **remove members**.
-   **G5** — All mutations go through server-side routes that check roles;
    the PocketBase record API cannot create/update/delete groups, memberships,
    or posts directly (same posture as the economy collections).

## 3. Non-goals (attach later)

-   **Group rooms.** msoy groups owned scenes ("group hall"). Our `rooms`
    collection makes this a natural follow-up (a `group_id` on rooms), but
    it is out of scope here.
-   **Private / invite-only groups.** msoy had `POLICY_INVITE_ONLY` /
    `EXCLUSIVE`. The schema reserves a `privacy` field so this can arrive
    without a migration, but this milestone every group is public: anyone can
    read, any logged-in user can join.
-   **Voting on posts.** The comment component already renders inert
    up/downvote buttons; making votes real (score, sort by hot/top) is its own
    feature and applies to profile/listing comments too — do it once,
    globally, not here.
-   **Post media.** Posts are title + text body. Image/file posts touch the
    upload pipeline and its security posture; later.
-   **Discovery**: search, tags/categories, trending. `/groups` is a plain
    paginated list for now.
-   **Bans and audit logs.** Removing a member does not stop them rejoining.
    A `group_bans` collection and a mod-action log are the obvious next
    moderation features; the routes are shaped so they slot in.
-   **Notifications, group chat, per-group avatars/theming.**

## 4. Roles

Three roles, one per membership row:

| Role          | Who                                | Can                                                                                                  |
| ------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **admin**     | The creator. Exactly one per group | Everything below, plus: promote/demote moderators, remove members, edit group info, delete the group |
| **moderator** | Assigned by the admin              | Remove any post or comment in the group, remove members (not moderators)                             |
| **member**    | Anyone who joins                   | Post, comment, delete **their own** posts/comments, leave                                            |

Rules that keep this simple:

-   The admin role is not transferable in this milestone (no ownership
    handoff). The admin cannot leave their own group; they can only delete it.
-   Moderators cannot touch other moderators or the admin.
-   Non-members can read everything but cannot post or comment. (Reddit
    allows commenting without joining; requiring membership is one less
    spam surface and makes "remove member" meaningful. Revisit later.)
-   Roles are stored as an int enum (`0 = member`, `1 = moderator`,
    `2 = admin`) so "at least moderator" is `role >= 1` — mirrors msoy's
    `Rank` ordering.

## 5. Data model

Three new collections in `utils/db.go`, following the existing
create-if-missing pattern, plus one migration to `comments`.

### 5.1 `groups`

```
CREATE TABLE groups (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,     -- relation -> users; the admin
    name TEXT NOT NULL,         -- URL slug, unique, 3–30 chars [a-zA-Z0-9_]
    display_name TEXT NOT NULL, -- shown name, 1–50 chars
    description TEXT,           -- 0–500 chars
    privacy INTEGER NOT NULL,   -- 0 = public; reserved (see §3)
    is_deleted BOOL,
    created DATE, updated DATE
);
CREATE UNIQUE INDEX idx_group_name ON groups (name);
```

`name` is the identity in URLs (`/groups/cool_cats`), case-insensitive
unique like usernames. `owner_id` denormalizes the admin (also present as
the `role = 2` membership row) so "is admin" checks don't need a join.

API rules: `ListRule`/`ViewRule` `""` (public), everything else `nil` —
creation goes through our route so we can validate the slug and create the
admin membership in the same transaction.

### 5.2 `group_members`

```
CREATE TABLE group_members (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,     -- relation -> groups, cascade delete
    user_id TEXT NOT NULL,      -- relation -> users, cascade delete
    role INTEGER NOT NULL,      -- 0 member / 1 moderator / 2 admin (§4)
    created DATE, updated DATE
);
CREATE UNIQUE INDEX idx_group_member ON group_members (group_id, user_id);
```

API rules: `ListRule`/`ViewRule` `""` (member lists are public), mutations
`nil` — join/leave/promote go through routes.

### 5.3 `group_posts`

```
CREATE TABLE group_posts (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,     -- relation -> groups, cascade delete
    user_id TEXT NOT NULL,      -- relation -> users; the author
    title TEXT NOT NULL,        -- 1–120 chars
    content TEXT,               -- 0–5000 chars, plain text for now
    is_deleted BOOL,            -- soft delete, like comments
    created DATE, updated DATE
);
CREATE INDEX idx_group_posts ON group_posts (group_id, created);
```

Soft delete keeps the comment thread under a removed post addressable
(Reddit's `[removed]` behavior). A deleted post renders a tombstone.

API rules: `ListRule`/`ViewRule` `""`, mutations `nil`.

### 5.4 `comments` migration

Same move the shop listing page made: add an optional `post_id` text column
to `comments` (see the existing migration in
[db.go](../../utils/db.go) around `listing_id`). A comment belongs to
exactly one thread host — profile, listing, or now a group post. The
comment-create hook in [profile.go](../../api/profile.go) gains a branch:
when `post_id` is set, require the author to be a member of the post's
group (§4).

## 6. Routes

New file `api/group.go`, registered like the other route files in
[main.go](../../main.go). All pages are Go templates + htmx fragments,
same split as profile/shop (full page render vs. `HX-Request` partial).

### Pages (GET)

| Route                          | What                                                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /groups`                  | Paginated list of groups (name, description, member count) + "Create group" button for logged-in users                                 |
| `GET /groups/{name}`           | Group page: info card (description, member count, join/leave button), post feed newest-first, paginated                                |
| `GET /groups/{name}/post/{id}` | Single post + its comment thread (reuses the `comment` template and the `list2tree` pagination from profile.go)                        |
| `GET /groups/{name}/manage`    | Admin/mod panel: member list with roles; admin sees promote/demote/remove controls, plus edit-info and delete-group. 404s for non-mods |

### Mutations (POST, auth required, role-checked server-side)

| Route                                       | Who        | What                                                                                                      |
| ------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `POST /groups`                              | any user   | Create group; validates slug, creates group + admin membership in one transaction                         |
| `POST /groups/{name}/join`                  | any user   | Insert membership (`role = 0`); no-op if already a member                                                 |
| `POST /groups/{name}/leave`                 | member     | Delete own membership; rejected for the admin                                                             |
| `POST /groups/{name}/posts`                 | member     | Create post                                                                                               |
| `POST /groups/{name}/post/{id}/delete`      | author/mod | Soft-delete the post                                                                                      |
| `POST /groups/{name}/comment/{id}/delete`   | author/mod | Soft-delete a comment in this group (sets `is_deleted`, same rendering path as existing deleted comments) |
| `POST /groups/{name}/members/{user}/role`   | admin      | Body `role=0                                                                                              | 1`; promote/demote moderator |
| `POST /groups/{name}/members/{user}/remove` | admin/mod  | Delete the membership; mods cannot remove mods/admin (§4)                                                 |
| `POST /groups/{name}/edit`                  | admin      | Update display name / description                                                                         |
| `POST /groups/{name}/delete`                | admin      | Soft-delete the group (`is_deleted`; page 404s)                                                           |

Role checks are one helper: `getGroupRole(app, groupId, userId) (int, error)`
— look up the membership row, return -1 for non-members. Every mutation
route resolves the group by `name`, calls this, and compares against the
required rank. Deletion cascades are handled by the relations' cascade
flags (memberships and posts die with a hard-deleted group), but since
delete is soft, nothing cascades in practice — the pages just stop serving.

### htmx notes

Follow the lesson recorded from the coin-balance bug: fragments that swap
themselves (join/leave button, role dropdowns, post-delete) must carry
`hx-target="this"` (or an explicit id target) because `hx-target="#page"`
inherits from the header nav. Full-page links (`/groups`, group page, post
page) use the standard `hx-target="#page"` + `hx-push-url` pattern.

**Removing a comment swaps only the comment's body.** `comment.gohtml` is
split into `commentBody` (the comment) and `comment` (the body plus its
replies, which live in a sibling `_comment_children` element). The delete
route returns `commentBody` alone and targets `#_{id}_comment_parent`;
returning the whole `comment` template would emit a second, empty children
element and leave the original replies orphaned beside it with duplicate ids.
Measured: after the swap the tombstone is in place, the reply count is
unchanged, and there is exactly one parent and one children element.

**Join/leave answers with two fragments.** The control and the member count
both change on a join, but they sit in different corners of the info card, so
forcing them into one swap target would mean re-rendering the whole card.
Instead `renderGroupMembership` writes `groupJoin` (the swap target, keyed by
`#group-membership`) followed by `groupMemberCount` carrying
`hx-swap-oob="true"`. The `Oob` flag exists so the copy rendered as part of
the full page does not carry the attribute. Note htmx leaves `hx-swap-oob` on
the swapped-in element in the live DOM; it is inert there (the attribute only
means anything on an element in a _response_) and repeated join/leave
round-trips were measured to swap cleanly with no duplicated elements.

## 7. Templates

-   `web/templates/pages/groups.gohtml` — the list page.
-   `web/templates/pages/group.gohtml` — group page with post feed.
-   `web/templates/pages/groupPost.gohtml` — post + comment thread; embeds
    the existing `comment` / `commentBox` components (commentBox needs the
    hidden thread-host field parameterized, as the listing page did).
-   `web/templates/pages/groupManage.gohtml` — the manage panel.
-   `web/templates/components/postCard.gohtml` — one post in the feed
    (title, author, relative time, comment count, mod delete button).
-   Enable the header "Groups" tab (remove `cursor-not-allowed`, add
    `href="/groups"`).

**Escaping.** Pages here are parsed with `text/template`, not
`html/template` (see `AppendToBaseTmplFiles` in [base.go](../../api/base.go)),
so nothing the templates interpolate is contextually escaped. Group display
names and descriptions are free text, so `api/group.go` escapes them in Go
before they reach the template. The same applies to post titles, post bodies,
and the comment bodies rendered on a post page — and, because the shared
comment-create hook answers with an HTML fragment, to that fragment too when
its host is a group post (`api/profile.go`). Without that last one an author
would briefly see their own markup rendered before the next page load escaped
it.

This is a local fix for a repo-wide property. Existing user content elsewhere
(profile and listing comment bodies, item names, nicknames) is still rendered
unescaped, which is why the fragment escaping is scoped to group comments
rather than applied to the shared hook wholesale: escaping every fragment
while page loads still render raw would only move the inconsistency around. A
global move to `html/template` is the real fix, and it would need these
per-field escapes removed to avoid double-escaping.

One inherited wart worth knowing: `comment.gohtml` renders its reply box for
everyone, including logged-out visitors, so a non-member sees a reply control
that the server will reject. That predates groups and is shared with the
profile and listing pages; the gate itself is enforced server-side in the
comment-create hook.

## 8. Milestones

-   **M1 — Schema + create/browse.** _Landed._ Collections and migration
    (§5), `POST /groups`, `/groups` list page, `/groups/{name}` page rendering
    an empty feed, header tab enabled. Member count already comes from
    `group_members`, so it reads correctly once M2 adds joining.
-   **M2 — Membership.** _Landed._ Join/leave, live member count, and the
    posting gate. The gate is in place as the `{{ if .Membership.IsMember }}`
    branch that M3's post box drops into; for now it only varies the
    empty-feed copy, since shipping an inert post control would be worse than
    shipping none.
-   **M3 — Posts + comments.** _Landed._ Create post, feed, post page,
    comments wired to `post_id`, author self-delete. The post-comments query
    (`sql/group/getPostComments.sql`) is the listing query with the host
    column swapped, so the tree/pagination behaviour is identical by
    construction. Removed posts stay in the feed as `[removed]` tombstones
    whose threads remain readable but closed to new comments.
-   **M4 — Moderation.** _Landed._ Mod delete on posts and comments, the
    manage page, promote/demote/remove-member, group edit and delete.

The permission rules live in four predicates in `api/group.go` —
`canDeleteGroupPostBy`, `canDeleteGroupCommentBy`, `canRemoveMember`,
`canSetMemberRole` — and each is called by both the route that enforces it and
the template flag that offers the control, so a button can never appear
without the matching permission behind it. They are pure functions of
(viewer role, target, self), which is what let the whole matrix be table-tested
at once rather than inferred from clicking.

Each milestone is verifiable by running `npm run dev` and clicking through;
role checks are additionally verified by hand-crafting requests as the wrong
user (there is no test suite).

## 9. Open questions

1.  Should group names be renameable? (Currently no — the slug is the URL
    identity. Display name is editable.)
2.  Post editing: allow authors to edit content after posting? (Currently
    no; delete-and-repost. Cheap to add.)
3.  Does deleting a group free its name for re-registration? (Currently no,
    because soft delete keeps the row and the unique index. Fine for now.)
