# Spec: Shop listing page (preview, comments, ratings, tags)

Status: **implementing**
Owner: @lulzsun
Last updated: 2026-08-23
Companion to: [shop-currency.md](shop-currency.md)

## 1. Summary

Every shop listing gets a detail page at `/shop/{category}/{listingId}` —
the equivalent of original Whirled's catalog item page. It shows the item in
the live 3D preview (the same `preview` component the stuff pages use), the
listing info (name, description, creator, price, buy button), and three
social layers: **threaded comments**, **1–5 star ratings**, and
**member-added tags**.

## 2. Goals

-   **G1** — A shop card click lands on a page that previews the actual item
    (3D/SWF render, not a thumbnail).
-   **G2** — Members can comment on a listing with the same threaded
    comment system profiles already have — one comment machinery, not two.
-   **G3** — Members can rate a listing 1–5 stars; the page shows the
    average, the count, and your own rating; re-rating replaces your rating.
-   **G4** — Members can add tags to a listing; tags render as chips and are
    normalized so the vocabulary stays usable.
-   **G5** — Guests see everything read-only; all writes require auth and go
    through server-checked paths.

## 3. Non-goals

-   Tag removal / moderation, tag search, tag-based browsing (future — tags
    are collected now so browsing has data later).
-   Comment voting (the up/down arrows in the comment component are already
    decorative on profiles; they stay decorative here).
-   Rating-weighted shop sort ("best rated" — easy follow-up once ratings
    exist; the `popular` sort stays purchase-based for now).
-   Buying (arrives with economy M3; the buy button here is the same
    disabled placeholder as the shop grid).
-   Editing name/description/price from this page (that is the seller flow,
    economy M4).

## 4. Decisions

1. **Comments are generalized, not duplicated.** The existing `comments`
   collection gains an optional `listing_id` column and `profile_id`
   becomes optional; a comment belongs to exactly one thread host (profile
   or listing). The recursive-CTE query is copied once with `listing_id` as
   the key (`sql/shop/getListingComments.sql`) — the query text is the
   price of reuse, the templates and tree-builder are shared. The comment
   templates' hardcoded `/profile/{username}` thread URLs become a
   `ThreadUrl` the server supplies — which also fixes a latent bug where
   "+ More replies" pointed at the comment _author's_ profile instead of
   the profile being viewed.
2. **Anyone authenticated can rate or tag**, ownership not required (matches
   original Whirled, where rating was a member action, not a buyer action).
   One rating per user per listing, enforced by a unique index; rating again
   updates in place.
3. **Ratings live in their own collection, not as a counter on listings.**
   Same reasoning as the transactions ledger: the source of truth is the
   per-user rows; averages are computed on read (SQLite AVG over an indexed
   `listing_id` is nothing at this scale).
4. **Tags are normalized server-side**: trimmed, lowercased, must match
   `^[a-z0-9-]{2,24}$`, at most 24 tags per listing, unique per listing.
   Tags are shared by the listing (Whirled-style folksonomy), not per-user
   labels — the row remembers who added a tag, but duplicates by other
   users are rejected rather than counted.

## 5. Data model

### 5.1 `comments` (migration)

Existing collection, two changes at bootstrap: add optional `listing_id`
(plain text, like `parent_id`), relax `profile_id` to optional. Profile
comments keep `listing_id = ''`; listing comments keep `profile_id = ''`.
No existing rows change meaning.

### 5.2 `ratings`

```
CREATE TABLE ratings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,        -- relation -> users, cascade delete
    listing_id TEXT NOT NULL,     -- plain text; survives nothing (see below)
    stars INTEGER NOT NULL,       -- 1..5
    created DATE, updated DATE
);
CREATE UNIQUE INDEX idx_rating_user_listing ON ratings (user_id, listing_id);
```

All API rules `nil`; writes go through `POST /shop/{category}/{id}/rate`.

### 5.3 `listing_tags`

```
CREATE TABLE listing_tags (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    user_id TEXT NOT NULL,        -- who added it (relation, cascade delete)
    tag TEXT NOT NULL,            -- normalized, ^[a-z0-9-]{2,24}$
    created DATE
);
CREATE UNIQUE INDEX idx_tag_listing ON listing_tags (listing_id, tag);
```

All API rules `nil`; writes go through `POST /shop/{category}/{id}/tags`.

Ratings, tags, and comments reference listings by plain text id — when a
listing is deleted its social data becomes orphaned rows, same tradeoff the
ledger makes; cleanup can batch later and nothing renders them meanwhile.

## 6. Routes

-   `GET /shop/{category}/{listingId}` — the page. Joins listing → item
    (file, scale, description) → creator, aggregates ratings
    (`AVG`, `COUNT`, and the viewer's row), loads tags and the comment
    tree. Supports the same `viewReplies`/`replyOffset` partials as the
    profile page, answered with the shared comment fragment template.
-   `POST /shop/{category}/{listingId}/rate` — auth required; body `stars`
    (1..5); upserts the viewer's rating; returns the rating widget fragment
    (htmx `outerHTML` swap on `#listing-rating`).
-   `POST /shop/{category}/{listingId}/tags` — auth required; body `tag`;
    normalizes, validates, inserts; returns the tags fragment (swap on
    `#listing-tags`). Validation failures use the standard `#error-alert`
    path.
-   Comments post to the existing `/api/collections/comments/records` with
    `listing_id` instead of `profile_id` in the hidden form fields; the
    existing create hook already returns the rendered fragment.

## 7. Page layout

Two-column like `stuffPreview.gohtml` (stacking on narrow widths):

-   **Left**: item name header + live `preview` iframe (`File` resolved to
    the item's `/api/files/...` URL, `Type` = category, `Scale` from the
    item record).
-   **Right, info card**: creator identity (avatar circle, nickname,
    @username → profile), description, price + disabled buy button, the
    rating block (average stars, `x.y (N)`, and "your rating" interactive
    stars when authed), and the tag chips + add-tag input when authed.
-   **Below**: comment box (authed) and the threaded comment tree.
-   Shop grid and featured cards link here; the card's disabled buy button
    stays on the card.

## 8. Verification

Exercise on the dev server as an authenticated user: open a seed listing,
confirm the 3D preview renders; rate it twice (confirm the second rating
replaces, not adds); add a valid tag and an invalid one (confirm the error
path); comment, reply to the comment, and confirm the same thread renders
on reload; confirm the profile comment flow still works end-to-end (the
shared machinery changed under it).
