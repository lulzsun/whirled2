# Spec: Shop currency and purchase system

Status: **reviewed — M1 in progress**
Owner: @lulzsun
Last updated: 2026-08-23

## 0. Decisions

Settled in review, 2026-08-23:

1. **Duplicate purchases are allowed.** Buying an item you already own
   creates another copy in your stuff. Trading and gifting are planned for
   the future (not implemented here), and both imply owning transferable
   copies — a strict one-copy rule would fight that. See §6 for the
   double-submit consequence.
2. **No house cut on coin sales; a cut is planned for bars.** Creators keep
   100% of coin prices. When real-money bars arrive (future, out of scope),
   bar sales will take a house cut — so the purchase flow computes creator
   income as `price - fee` with `fee = 0` for coins, rather than assuming
   income equals price. See §6.
3. **The shop stays browsable logged-out.**
4. **Starting amounts stand** (1,000 signup / 100 daily) as tunable
   constants.
5. **The currency is named "coins."**

## 1. Summary

The shop page (branch `feat/shop-page`) is a UI scaffold with placeholder
items and prices. This spec plans the systems behind it: a **coin currency**,
per-user **wallets**, an append-only **transaction ledger**, shop
**listings**, and the **purchase flow** that turns a listing into a `stuff`
record in the buyer's inventory.

Design follows original Whirled's economy where it makes sense (creators list
their uploads for sale, buyers receive a copy, creators earn the sale price)
and deliberately diverges where it does not (no real-money currency — see
Non-goals).

## 2. Goals

-   **G1** — Every user has a coin balance, visible in the header, that cannot
    go negative and cannot drift from its transaction history.
-   **G2** — A creator can list an item they uploaded for sale at a price;
    the shop page shows real listings instead of placeholders.
-   **G3** — A buyer with enough coins can buy a listing and immediately sees
    the item in their stuff; the creator is credited.
-   **G4** — Every balance change is recorded in an append-only ledger with
    enough context to audit or replay it.
-   **G5** — All mutations happen server-side inside transactions. The
    PocketBase record API cannot create, update, or delete wallets, ledger
    entries, or listings directly.

## 3. Non-goals

-   **Real-money currency ("bars").** Whirled's bars required a payment
    processor. That is a hard external dependency, which the one-executable
    constraint weighs against, plus legal/tax surface. The schema keeps a
    `currency` discriminator so a second currency can exist later, but no
    bars in this milestone and nothing here assumes them. Two things _are_
    planned for now (§0.2): bar sales will take a house cut, so income is
    computed as `price - fee` from day one; and the ledger `type` enum
    reserves nothing bars-specific — a bar transaction is the same row with
    `currency = 1`.
-   **Player-to-player trading / gifting.** Planned, not implemented. What
    this spec does to prepare (and no more): duplicate purchases are allowed
    so copies are meaningfully ownable (§0.1), a transfer is representable
    as a `stuff` row changing `owner_id` plus two ledger rows when coins are
    involved, and the ledger enum reserves `TradeIn`/`TradeOut` values.
-   **Secondary market / resale**, listing fees, price history, sales tax.
-   **Game payouts.** The game server (`game/server/`) is the obvious future
    faucet, but wiring rewards into gameplay is its own project. The ledger
    reserves a transaction type for it.
-   **Fraud/abuse tooling** beyond what the ledger itself provides.

## 4. Currency design

One currency: **coins**. Integer only — there is no fractional coin, and no
float ever touches an amount (SQLite REAL and Go float64 both invite drift).

Supply:

| Faucet                          | Amount | When                       |
| ------------------------------- | ------ | -------------------------- |
| Signup grant                    | 1,000  | On user creation           |
| Daily login bonus               | 100    | First auth'd page load/day |
| Game rewards (future, reserved) | —      | —                          |

Sinks: purchases move coins buyer → creator, so purchases of user-created
items are not a sink, only a transfer. True sinks (removal from supply):
purchases of **admin/seed items** (creator is the system, coins are burned),
and any future listing fee. A small economy does not need aggressive sinks on
day one, but seeded catalog items priced in coins give the initial supply
somewhere to go.

Amounts above are starting values, tuned later; they live as constants in one
Go file so tuning is a one-line change.

## 5. Data model

Three new collections, bootstrapped in `utils/db.go` following the existing
pattern (create-if-missing, `nil` API rules unless stated).

### 5.1 `wallets`

One row per user, created alongside the user the same way `profiles` is.

```
CREATE TABLE wallets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,        -- relation -> users, cascade delete
    coins INTEGER NOT NULL,       -- current balance, >= 0
    last_daily DATE,              -- last daily-bonus credit
    created DATE, updated DATE
);
CREATE UNIQUE INDEX idx_wallet_user ON wallets (user_id);
```

API rules: `ViewRule: user_id = @request.auth.id`, everything else `nil`.
The balance is a **cache** of the ledger; the ledger is the truth. A
consistency check (sum of ledger deltas == balance) is cheap to run in a
debug route.

### 5.2 `transactions`

Append-only ledger. Never updated, never deleted (no cascade delete —
`user_id` is a plain text column, not a relation, so history survives
account deletion).

```
CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,        -- whose balance changed
    amount INTEGER NOT NULL,      -- signed delta, non-zero
    balance INTEGER NOT NULL,     -- balance after applying amount
    currency INTEGER NOT NULL,    -- 0 = coins (future-proofing)
    type INTEGER NOT NULL,        -- enum below
    ref_id TEXT,                  -- listing id, counterparty id, etc.
    note TEXT,                    -- human-readable context
    created DATE
);
CREATE INDEX idx_tx_user ON transactions (user_id, created);
```

`type` enum (Go iota constants in `utils/economy.go`; the client never sees
these, so they stay out of `proto/`): `Unknown`, `SignupGrant`, `DailyBonus`,
`PurchaseSpend`, `SaleIncome`, `AdminAdjust`, `GameReward` (reserved),
`TradeIn` (reserved), `TradeOut` (reserved).

A purchase writes **two** rows: `PurchaseSpend` (buyer, negative) and
`SaleIncome` (creator, positive), both carrying the listing id in `ref_id`.

API rules: all `nil`. Users see their history through a server-rendered
page, not the record API.

### 5.3 `listings`

What the shop sells. Points at the same `avatars`/`furniture` records the
`stuff` system already uses, discriminated by the existing `buf.Type` enum.

```
CREATE TABLE listings (
    id TEXT PRIMARY KEY,
    creator_id TEXT,              -- relation -> users; empty = system/seed item
    type INTEGER NOT NULL,        -- buf.Type: Avatar, Furniture, ...
    item_id TEXT NOT NULL,        -- id in avatars/furniture/... collection
    price INTEGER NOT NULL,       -- coins, >= 0 (0 = free)
    is_listed BOOL,               -- creator can delist without deleting
    is_featured BOOL,             -- drives the featured banner
    purchases INTEGER,            -- denormalized sale count, for sorting
    created DATE, updated DATE
);
CREATE UNIQUE INDEX idx_listing_item ON listings (type, item_id);
```

API rules: all `nil`; listing/delisting goes through server routes so price
validation and ownership checks live in one place.

The unique `(type, item_id)` index means an item is listed at most once —
re-listing edits the row rather than duplicating it.

## 6. Purchase flow

`POST /shop/{category}/{listingId}/buy`, auth required, htmx-driven.

All inside one `app.RunInTransaction`:

1. Load listing; must exist and be `is_listed`.
2. Debit buyer with a **conditional update**:
   `UPDATE wallets SET coins = coins - {price} WHERE user_id = {buyer} AND coins >= {price}`.
   Zero rows affected ⇒ insufficient funds ⇒ rollback, htmx error via the
   existing `#error-alert` path. The condition inside the UPDATE is what
   makes concurrent purchases safe — never read-check-write the balance.
3. Credit creator's wallet (skip when `creator_id` is empty — system items
   burn the coins).
4. Append the ledger rows (spend, and income when there is a creator).
5. Create the `stuff` record `{owner_id: buyer, stuff_id: item_id, type}` —
   exactly what `OnRecordAfterCreateSuccess("avatars")` already does when
   granting a creator their own upload.
6. Increment `listings.purchases`.

Response: htmx fragment updating the buy button to "Owned ✓" (or a
re-render of the card) plus an `HX-Trigger` event the header listens to so
the balance refreshes.

Decisions folded in:

-   **Duplicate purchases are allowed** (§0.1) — buying again grants another
    copy, like Whirled's furniture. That means a double-click is a real
    double purchase, not a rejected no-op, so the client must guard: the buy
    button disables itself for the request's duration (htmx
    `hx-disabled-elt="this"`). The conditional debit keeps even an
    unguarded double-submit _safe_ (never a negative balance) — the guard is
    about intent, not integrity.
-   **Creator income is `price - fee`, and `fee = 0` for coins** (§0.2).
    Whirled took a cut; we don't for coins. The fee term exists in the flow
    now so future bar sales can take a house cut without restructuring the
    ledger — a nonzero fee is simply burned (debit ≠ credit, difference
    leaves supply).
-   **Free listings (price 0)** run the same flow; the ledger rows are
    skipped (zero-amount entries are noise).

## 7. Selling flow

Entry point is the **stuff page**, not the shop: an item detail page
(`stuffPreview.gohtml`) gains a "Sell in shop" control for items the viewer
_created_ (not merely owns — you cannot resell someone else's work; this is
what `creator_id` checks enforce).

-   `POST /shop/list` `{type, item_id, price}` — creates/updates the listing,
    server-validates creator ownership and `0 <= price <= 1,000,000`.
-   `POST /shop/delist` `{listingId}` — sets `is_listed = false`.

Deleting the underlying avatar/furniture must delist it: extend the existing
`OnRecordAfterDeleteSuccess("stuff")` cleanup (which already deletes the
creator's source record) to also remove the listing. Buyers' already-granted
`stuff` copies keep working only if the source record survives — this is the
same dangling-item problem the stuff page already has a TODO for, and this
spec does not solve it, only avoids making it worse: **delisting always works
even when the source is gone.**

## 8. Shop page changes

The scaffold already has the right shape; it swaps data sources:

-   `GET /shop/{category}` — query `listings` joined to the item table and
    creator, `WHERE is_listed AND type = {category}`, sorted by `created`
    (the "Sort by new" control becomes real: new / most purchased / price).
-   Cards show real thumbnails (same `/api/files/...` URL scheme as the stuff
    page), creator nickname linking to their profile, price, and a Buy button
    (or "Owned", or "Log in to buy" for guests — the page stays browsable
    unauthenticated).
-   Featured banner: `is_featured` listings, hand-picked via admin for now.
-   Pagination: real, using the same LIMIT/OFFSET approach as profile
    comments.
-   Search stays disabled in this milestone.

Header (`web/templates/components/profileHeader.gohtml` area): coin balance
with the coin icon, rendered from base data (`AppendToBaseData` gains a
wallet lookup for auth'd users), refreshed via the `HX-Trigger` event from
purchases.

## 9. Milestones

Each lands separately, in order; the shop stays functional (placeholder or
real) between them.

-   **M1 — Wallet + ledger.** Collections in `utils/db.go`, signup grant via
    `OnRecordAfterCreateSuccess("users")`, wallet backfill for existing users
    at bootstrap, balance in header. No spending exists yet.
-   **M2 — Listings, read path.** `listings` collection, seed listings for
    the default avatars/furniture, shop page renders real data, category +
    sort + pagination, featured banner.
-   **M3 — Buy.** The §6 transaction, ownership checks, htmx buy states,
    balance refresh. Acceptance: two sessions racing to spend one wallet's
    last coins produce exactly one grant and no negative balance.
-   **M4 — Sell.** Creator listing/delisting from the item page, delist on
    delete, creator income.
-   **M5 — Faucets.** Daily bonus (checked in idle-aware middleware or on
    first auth'd request of the day, guarded by `last_daily` with the same
    conditional-update trick), transaction history page.

## 10. Open questions

All questions from the initial draft were resolved in review — see §0.
