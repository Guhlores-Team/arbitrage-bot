# Core data model

The engine and the web UI describe the **same record** with two vocabularies.
This is the Rosetta Stone so they aren't confusing.

## One record, two names

| Layer | Name | Type | Where |
|-------|------|------|-------|
| Backend | **Opportunity** | `OpportunityView` | `src/view.ts` |
| Web UI | **Deal** | `Deal` | `web/src/types.ts` |

`Deal` is a subset of `OpportunityView` — the API returns the full opportunity
object and the dashboard types only the fields it renders. Same `id`, same row.

## Lifecycle: `status`

Every record has a single lifecycle field, `status`, with four values:

```
new | bought | sold | skipped
```

The game UI themes these as stages. Exact mapping (`web/src/lib.ts` STAGES):

| status   | label  | quest (game theme) |
|----------|--------|--------------------|
| `new`    | Triage | Scouting           |
| `bought` | Buying | Fighting           |
| `sold`   | Sold   | Looted             |
| `skipped`| Passed | Fled               |

So "Triage/Scouting → Buying/Fighting → Sold/Looted → Passed/Fled" is just a
re-skin of `new → bought → sold → skipped`. Outcome edits go through
`POST /api/.../outcome` and persist on the record (`store.setOpportunityOutcome`).

## What persists vs. what's derived

Two different stores, deliberately:

- **Opportunities** persist in the JSON store with their outcome fields
  (`status`, `boughtPrice`, `soldPrice`, `actualProfit`, `notes`).
- **GameState** (`src/store.ts`, served at `/api/game`) persists ONLY the player's
  choices that can't be computed: `name`, `classId`, `claimedQuests`, `bonusXp`,
  `skills`, `equipped`, `lastSeenLevel`.

Hero **gold, XP, and level are DERIVED from the deals on the client** — they are
never stored. Claimed quests add `bonusXp` on top of the deal-derived XP, which is
the one place game progress feeds back in.

**`gold = realized P/L (honest)`** — it sums `actualProfit` from `sold` deals
(set only when both `boughtPrice` and `soldPrice` are known), not projected net.
Projected/fee-adjusted net is shown separately and never counted as gold.
