# Ticket template

Paste this into a Linear issue template for the Booking-System team (Settings → Teams →
Booking-System → Templates).

```markdown
## What
<One or two sentences: what should change, from the user's point of view.>

## Why
<The reason, so trade-offs can be made sensibly.>

## Acceptance criteria
- [ ] <Observable behaviour 1>
- [ ] <Observable behaviour 2>
- [ ] <Edge case: empty state / error / permissions>

## Scope
- Repos: <booking-ui | booking-system | both>
- Out of scope: <things not to do in this ticket>

## Notes (optional)
<Pointers: relevant files, endpoints, designs, related tickets, decisions already made.>
```

Tips:

- Use **blocked by** in Linear for real dependencies. Wonderbot won't start a ticket until its
  blockers are Done.
- For a feature that needs an API change and UI work, either keep it as one ticket (Wonderbot
  opens linked PRs in both repos) or split it into a backend ticket that blocks a frontend one.
- A short "Out of scope" line prevents most over-building.
