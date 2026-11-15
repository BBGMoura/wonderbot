// Minimal Linear GraphQL client. No dependencies, so the workflow doesn't need `npm install`.

const LINEAR_API = "https://api.linear.app/graphql";

export async function linear(query, variables = {}) {
  const key = process.env.LINEAR_API_KEY;
  if (!key) throw new Error("LINEAR_API_KEY is not set");

  const res = await fetch(LINEAR_API, {
    method: "POST",
    // Personal API keys go in the header as-is, without "Bearer".
    headers: { "Content-Type": "application/json", Authorization: key },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`Linear API error: ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.data;
}

export async function getStates(teamKey) {
  const data = await linear(
    `query($team: String!) {
      workflowStates(filter: { team: { key: { eq: $team } } }) { nodes { id name type } }
    }`,
    { team: teamKey },
  );
  return data.workflowStates.nodes;
}

// Looks a status up by name and fails loudly, so a typo in config or a missing
// Linear status stops the run instead of silently doing nothing.
export function stateId(states, name) {
  const match = states.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (!match) {
    const names = states.map((s) => s.name).join(", ");
    throw new Error(`Linear status "${name}" not found. Existing statuses: ${names}`);
  }
  return match.id;
}

export async function moveIssue(issueId, stateIdValue) {
  await linear(
    `mutation($id: String!, $state: String!) {
      issueUpdate(id: $id, input: { stateId: $state }) { success }
    }`,
    { id: issueId, state: stateIdValue },
  );
}

export async function comment(issueId, body) {
  await linear(
    `mutation($id: String!, $body: String!) {
      commentCreate(input: { issueId: $id, body: $body }) { success }
    }`,
    { id: issueId, body },
  );
}

export function config() {
  return {
    team: process.env.LINEAR_TEAM_KEY || "BOO",
    ready: process.env.READY_STATUS || "Ready for Wonderbot",
    inProgress: process.env.IN_PROGRESS_STATUS || "In Progress",
    inReview: process.env.IN_REVIEW_STATUS || "In Review",
    needsInfo: process.env.NEEDS_INFO_STATUS || "Needs Info",
  };
}

export function runUrl() {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  return GITHUB_RUN_ID ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : "(local run)";
}
