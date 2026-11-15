# Wonderbot 🤖

Picks up Linear tickets for the booking system and opens PRs in `booking-ui` and
`booking-system` for review. It never merges: you do.

## How it works

```
Linear: move ticket to "Ready for Wonderbot"
        │
        ▼
Scheduled run (02:00, 13:00, 18:00 UTC) or "Run workflow" button
        │
        ├─ fewer than 5 open wonderbot PRs?            no → stop
        ├─ take Ready tickets, highest priority first,
        │  skipping any with an unfinished "blocked by"
        ├─ move each to In Progress (so it can't be picked twice)
        ▼
One job per ticket, in parallel
        │
        ├─ Claude reads the ticket + both repos
        ├─ too many unknowns? → questions on the ticket, status "Needs Info"
        └─ otherwise → branch wonderbot/boo-xx-…, code + tests, runs checks,
                       opens PR(s) labelled "wonderbot", ticket → "In Review"
        ▼
You review and merge → Linear moves the ticket to Done
```

- **Dependencies:** a ticket waits until every ticket that blocks it is Done (or Canceled).
  Since Done happens on merge, dependent work always starts from merged code.
- **Cap:** at most 5 open wonderbot PRs across both repos (change it with the
  `WONDERBOT_MAX_OPEN_PRS` variable). A ticket that touches both repos opens 2 PRs.
- **Needs Info and failures don't use a slot:** the cap counts open PRs, and these tickets
  have none.
- **Failures:** the ticket goes to "Needs Info" with a link to the logs, so it isn't retried
  on every run. Move it back to Ready to retry.
- **Answers:** reply to Wonderbot's questions in a Linear comment, then move the ticket back
  to Ready. The next run reads the comments.
- **Run one ticket now:** Actions → Wonderbot → Run workflow → enter e.g. `BOO-24`. This
  skips the status check and the cap.

The rules Claude follows (checks to run, when to ask, PR template) are in [`CLAUDE.md`](CLAUDE.md).
Edit that file to change its behaviour.

## Setup (one-off, ~20 minutes)

### 1. Linear

1. **Settings → Teams → Booking-System → Workflow:** add two statuses:
   - `Ready for Wonderbot` in the **Unstarted** group
   - `Needs Info` in the **Unstarted** group
2. **Settings → Security & access → Personal API keys:** create a key. You'll store it as
   `LINEAR_API_KEY`.
3. **Settings → Integrations → GitHub:** make sure both `booking-ui` and `booking-system` are
   connected, with "PR merged → Done" turned on. Branch names contain the ticket ID, so PRs link
   to tickets automatically.

### 2. GitHub App (lets the workflow work across both repos)

The workflow's built-in token only covers the repo it runs in, and PRs it opens don't trigger
CI. A small GitHub App fixes both.

1. GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App**
   - Name: something unique, e.g. `wonderbot-bbg`
   - Homepage URL: this repo's URL
   - Webhook: **untick "Active"**
   - Repository permissions: **Contents** read & write, **Pull requests** read & write,
     **Issues** read & write (for the PR label), **Metadata** read
2. Create it, note the **App ID**, then **Generate a private key** (downloads a `.pem`).
3. **Install App** → your account → **Only select repositories** → `booking-ui` and
   `booking-system`.

### 3. Claude token

On your laptop run `claude setup-token` (uses your Pro/Max subscription). Copy the token.
Alternatively, use an Anthropic API key as `ANTHROPIC_API_KEY` instead (billed per use).

### 4. This repo's secrets and variables

**Settings → Secrets and variables → Actions**

| Type | Name | Value |
|---|---|---|
| Secret | `CLAUDE_CODE_OAUTH_TOKEN` | from step 3 (or `ANTHROPIC_API_KEY`) |
| Secret | `LINEAR_API_KEY` | from step 1 |
| Secret | `WONDERBOT_APP_PRIVATE_KEY` | full contents of the `.pem` |
| Variable | `WONDERBOT_APP_ID` | the App ID |
| Variable | `WONDERBOT_MAX_OPEN_PRS` | optional, defaults to `5` |

### 5. Protect the default branches

In `booking-ui` (`main`) and `booking-system` (`master`): **Settings → Branches → Add rule**
→ tick **Require a pull request before merging** with **1 approval**, plus **Require status
checks to pass**. Wonderbot then can't merge even by mistake, and you approve its PRs as the
reviewer.

### 6. Try it

Pick a small, well-written ticket, move it to **Ready for Wonderbot**, then
**Actions → Wonderbot → Run workflow**. Watch the run, and check the PR and the Linear comment.

## Writing tickets that work well

See [`docs/ticket-template.md`](docs/ticket-template.md). Clear acceptance criteria are the
biggest factor in PR quality.

## Usage and cost

- Each ticket uses Claude usage from your subscription (or API credits), roughly the same as a
  longer Claude Code session.
- If this repo is private, runner time counts against your GitHub Actions minutes (2,000/month
  free on personal accounts). A ticket typically takes 10–40 minutes. Runs with nothing to do
  take under a minute.

## Tuning

- **Schedule:** edit the `cron` line in `.github/workflows/wonderbot.yml`.
- **Status names / team:** the `env:` block at the top of the workflow.
- **Claude's behaviour:** `CLAUDE.md`.
