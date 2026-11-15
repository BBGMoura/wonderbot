// Fetches the full ticket (description, comments, parent, relations) and builds the
// prompt Claude receives. The standing rules live in CLAUDE.md; this file is only the
// per-ticket part.

import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { linear } from "./linear.mjs";

const issueId = process.env.ISSUE_ID;

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/, "");
}

function multilineOutput(name, value) {
  // Random delimiter so ticket text can never terminate the block early.
  const delim = `EOF_${randomUUID()}`;
  const block = `${name}<<${delim}\n${value}\n${delim}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, block);
  else process.stdout.write(block);
}

async function main() {
  const { issue } = await linear(
    `query($id: String!) {
      issue(id: $id) {
        identifier title description url priorityLabel
        labels { nodes { name } }
        parent { identifier title description }
        project { name }
        relations { nodes { type relatedIssue { identifier title state { name } } } }
        inverseRelations { nodes { type issue { identifier title state { name } } } }
        comments(first: 50) { nodes { body createdAt user { name } } }
      }
    }`,
    { id: issueId },
  );

  const branch = `wonderbot/${issue.identifier.toLowerCase()}-${slugify(issue.title)}`;

  const comments = [...issue.comments.nodes]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .filter((c) => !c.body.startsWith("🤖 Wonderbot picked this up"))
    .map((c) => `**${c.user?.name ?? "Unknown"}** (${c.createdAt.slice(0, 10)}):\n${c.body}`)
    .join("\n\n---\n\n");

  const related = [
    ...issue.relations.nodes.map((r) => `- this ticket ${r.type} ${r.relatedIssue.identifier} "${r.relatedIssue.title}" (${r.relatedIssue.state.name})`),
    ...issue.inverseRelations.nodes.map((r) => `- ${r.issue.identifier} "${r.issue.title}" (${r.issue.state.name}) ${r.type} this ticket`),
  ].join("\n");

  const prompt = `
You are Wonderbot, working on Linear ticket ${issue.identifier}. Follow the rules in CLAUDE.md
(this repo's, plus booking-ui/CLAUDE.md and booking-system/CLAUDE.md if present).

# Ticket ${issue.identifier}: ${issue.title}

URL: ${issue.url}
Priority: ${issue.priorityLabel}
Labels: ${issue.labels.nodes.map((l) => l.name).join(", ") || "none"}
Project: ${issue.project?.name ?? "none"}

## Description

${issue.description?.trim() || "(no description)"}

${issue.parent ? `## Parent ticket ${issue.parent.identifier}: ${issue.parent.title}\n\n${issue.parent.description?.trim() || "(no description)"}\n` : ""}
${related ? `## Related tickets\n\n${related}\n` : ""}
${comments ? `## Comments (oldest first — later answers override earlier questions)\n\n${comments}\n` : ""}

# Your task

1. Read the ticket and the relevant code in booking-ui/ and booking-system/. Work out which
   repo(s) the change belongs in.
2. Decide whether you can do it well. If unknowns would materially change the implementation
   (see "When to ask instead of build" in CLAUDE.md), do NOT write code. Return outcome
   "needs_info" with specific questions.
3. Otherwise, in each repo you change:
   - create the branch \`${branch}\` from the default branch
   - implement the change, with tests
   - run that repo's checks (listed in CLAUDE.md) and fix failures
   - commit as \`${issue.identifier}: <short summary>\` and push the branch
   - open a PR with \`gh pr create\` using the PR body template in CLAUDE.md,
     title \`${issue.identifier}: ${issue.title}\`, label \`wonderbot\`
   - if you open PRs in both repos, edit each PR body to link the other
4. Return the structured result.
`.trim();

  multilineOutput("prompt", prompt);
  multilineOutput("branch", branch);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
