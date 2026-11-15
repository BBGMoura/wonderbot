// Runs after Claude, whatever happened, and writes the outcome back to Linear.
// Claude never gets the Linear key: it only returns a structured result, and this
// script decides what to do with it.

import { getStates, stateId, moveIssue, comment, config, runUrl } from "./linear.mjs";

const cfg = config();
const issueId = process.env.ISSUE_ID;
const conclusion = process.env.CLAUDE_CONCLUSION || "failure";

function parseResult() {
  try {
    return JSON.parse(process.env.STRUCTURED_OUTPUT || "");
  } catch {
    return null;
  }
}

async function main() {
  const states = await getStates(cfg.team);
  const result = parseResult();
  const outcome = conclusion === "success" && result ? result.outcome : "failed";

  if (outcome === "pr_opened") {
    const prs = (result.pull_requests || []).map((p) => `- ${p.repo}: ${p.url}`).join("\n");
    await comment(issueId, `🤖 **Wonderbot opened PR(s) for review**\n\n${prs}\n\n${result.summary ?? ""}`);
    await moveIssue(issueId, stateId(states, cfg.inReview));
    return;
  }

  if (outcome === "needs_info") {
    const questions = (result.questions || []).map((q, i) => `${i + 1}. ${q}`).join("\n");
    await comment(
      issueId,
      `🤖 **Wonderbot needs more info before starting**\n\n${result.summary ?? ""}\n\n${questions}\n\n` +
        `Answer in a comment, then move the ticket back to "${cfg.ready}".`,
    );
    await moveIssue(issueId, stateId(states, cfg.needsInfo));
    return;
  }

  // Failures go to Needs Info rather than back to Ready, so a ticket that keeps
  // failing doesn't get retried (and billed) on every scheduled run.
  const why = result?.summary ? `\n\n${result.summary}` : "";
  await comment(
    issueId,
    `🤖 **Wonderbot couldn't finish this ticket.**${why}\n\n[Run logs](${runUrl()}). ` +
      `Check for a half-pushed \`wonderbot/\` branch, then move the ticket back to "${cfg.ready}" to retry.`,
  );
  await moveIssue(issueId, stateId(states, cfg.needsInfo));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
