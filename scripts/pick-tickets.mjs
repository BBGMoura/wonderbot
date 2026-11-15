// Decides which Linear tickets this run should work on, claims them (moves them to
// In Progress) and writes a job matrix to GITHUB_OUTPUT.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { linear, getStates, stateId, moveIssue, comment, config, runUrl } from "./linear.mjs";

const cfg = config();
const repos = (process.env.TARGET_REPOS || "").split(",").map((r) => r.trim()).filter(Boolean);
const maxOpenPrs = Number(process.env.MAX_OPEN_PRS || 5);
const label = process.env.PR_LABEL || "wonderbot";
const manualTicket = (process.env.MANUAL_TICKET || "").trim().toUpperCase();

function output(name, value) {
  const line = `${name}=${value}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, line);
  else process.stdout.write(line);
}

function openWonderbotPrs() {
  let total = 0;
  for (const repo of repos) {
    const out = execFileSync("gh", ["pr", "list", "-R", repo, "--label", label, "--state", "open", "--json", "number"], {
      encoding: "utf8",
    });
    total += JSON.parse(out).length;
  }
  return total;
}

const ISSUE_FIELDS = `
  id identifier title priority sortOrder
  state { name }
  inverseRelations { nodes { type issue { identifier state { type } } } }
`;

// A ticket is blocked while any ticket that "blocks" it is not finished. Canceled
// blockers count as finished, otherwise one abandoned ticket would freeze its dependants.
function openBlockers(issue) {
  return issue.inverseRelations.nodes
    .filter((r) => r.type === "blocks")
    .filter((r) => !["completed", "canceled"].includes(r.issue.state.type))
    .map((r) => r.issue.identifier);
}

async function readyIssues() {
  const data = await linear(
    `query($team: String!, $state: String!) {
      issues(first: 100, filter: { team: { key: { eq: $team } }, state: { name: { eq: $state } } }) {
        nodes { ${ISSUE_FIELDS} }
      }
    }`,
    { team: cfg.team, state: cfg.ready },
  );
  // Linear priority: 1 urgent … 4 low, 0 = none. "None" goes last, then board order.
  const rank = (p) => (p === 0 ? 99 : p);
  return data.issues.nodes.sort((a, b) => rank(a.priority) - rank(b.priority) || a.sortOrder - b.sortOrder);
}

async function main() {
  const states = await getStates(cfg.team);
  const inProgressId = stateId(states, cfg.inProgress);
  stateId(states, cfg.ready);
  stateId(states, cfg.needsInfo);

  let picked = [];

  if (manualTicket) {
    // A manually named ticket skips the status check and the PR cap: you asked for it explicitly.
    const data = await linear(`query($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`, { id: manualTicket });
    const blockers = openBlockers(data.issue);
    if (blockers.length) console.log(`::warning::${manualTicket} is blocked by ${blockers.join(", ")} — running anyway because it was requested by name.`);
    picked = [data.issue];
  } else {
    const open = openWonderbotPrs();
    const slots = Math.max(0, maxOpenPrs - open);
    console.log(`Open wonderbot PRs: ${open}/${maxOpenPrs} → ${slots} free slot(s).`);

    if (slots > 0) {
      for (const issue of await readyIssues()) {
        const blockers = openBlockers(issue);
        if (blockers.length) {
          console.log(`Skipping ${issue.identifier}: blocked by ${blockers.join(", ")}`);
          continue;
        }
        picked.push(issue);
        if (picked.length === slots) break;
      }
    }
  }

  // Claim before any work starts, so the next scheduled run can't pick the same ticket.
  for (const issue of picked) {
    await moveIssue(issue.id, inProgressId);
    await comment(issue.id, `🤖 Wonderbot picked this up. [Follow the run](${runUrl()})`);
    console.log(`Picked ${issue.identifier}: ${issue.title}`);
  }

  if (!picked.length) console.log("Nothing to pick up.");

  const matrix = { include: picked.map((i) => ({ id: i.id, identifier: i.identifier })) };
  output("matrix", JSON.stringify(matrix));
  output("count", picked.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
