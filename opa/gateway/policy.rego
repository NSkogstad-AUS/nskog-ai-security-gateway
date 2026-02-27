# AI Security Gateway – OPA policy bundle
#
# Query endpoint: POST http://localhost:8181/v1/data/gateway/policy
# Input shape:    { "input": <ToolCallIntent> }
# Output shape:   { "result": { "result": "allow"|"deny", "reason": "...", ... } }
#
# To run locally:
#   docker compose up opa
#   # or without Docker:
#   opa run --server --watch ./opa/
#
# To test a specific request manually:
#   curl -s -X POST http://localhost:8181/v1/data/gateway/policy \
#     -H 'Content-Type: application/json' \
#     -d '{
#       "input": {
#         "correlation_id": "test-1",
#         "agent_id":       "code-agent",
#         "tool_name":      "gh_push_file",
#         "risk_tier":      "write",
#         "tool_args":      { "owner": "acme", "repo": "api", "path": "main.py",
#                             "content": "print(1)", "message": "fix", "branch": "main" }
#       }
#     }' | jq .result

package gateway.policy

import rego.v1

# ---------------------------------------------------------------------------
# Gateway configuration
# Operators: edit these sets to change policy without touching rule logic.
# ---------------------------------------------------------------------------

# Branches that no agent may push to directly.
protected_branches := {"main", "master"}

# Agents in this set are limited to read-tier tools only.
readonly_agent_ids := {
	"readonly-bot",
	"monitoring-agent",
	"reporting-agent",
}

# ---------------------------------------------------------------------------
# Final decision document
#
# The gateway OPA client reads these top-level fields:
#   result            "allow" | "deny" | "redact"
#   reason            human-readable explanation
#   reason_codes      machine-readable codes (from the gateway's allowed set)
#   approval_required true → pause execution pending human review
#   rule_id           which decision branch matched (surfaced in policy trace)
#   matched_rules     every specific rule that fired (surfaced in policy trace)
# ---------------------------------------------------------------------------

# Fail closed: deny unless an allow rule explicitly fires.
default result := "deny"

default reason := "no allow rule matched; request denied by default"

default reason_codes := ["policy.deny"]

default approval_required := false

default rule_id := "deny.default_closed"

default matched_rules := []

# deny wins: any deny rule overrides all allow rules.
result := "deny" if {
	count(deny_reasons) > 0
}

result := "allow" if {
	count(deny_reasons) == 0
	count(allow_reasons) > 0
}

approval_required := true if {
	count(deny_reasons) == 0
	count(approval_reasons) > 0
}

# reason reflects the first-priority outcome.
reason := concat("; ", deny_reasons) if {
	count(deny_reasons) > 0
}

reason := "tool call allowed; pending human approval before execution" if {
	count(deny_reasons) == 0
	count(approval_reasons) > 0
}

reason := "tool call allowed by policy" if {
	count(deny_reasons) == 0
	count(allow_reasons) > 0
	count(approval_reasons) == 0
}

# reason_codes must stay within the gateway's allowed set.
reason_codes := ["policy.deny"] if {
	count(deny_reasons) > 0
}

reason_codes := ["policy.approval_required"] if {
	count(deny_reasons) == 0
	count(approval_reasons) > 0
}

reason_codes := ["policy.allow.local_default"] if {
	count(deny_reasons) == 0
	count(allow_reasons) > 0
	count(approval_reasons) == 0
}

# rule_id summarises which branch of the decision tree was taken.
rule_id := "deny.explicit_rule" if {
	count(deny_reasons) > 0
}

rule_id := "allow.approval_required" if {
	count(deny_reasons) == 0
	count(approval_reasons) > 0
}

rule_id := "allow.direct" if {
	count(deny_reasons) == 0
	count(allow_reasons) > 0
	count(approval_reasons) == 0
}

# matched_rules collects every rule ID that fired for this request.
matched_rules := [r | some r in union({deny_reasons, allow_reasons, approval_reasons})]

# ---------------------------------------------------------------------------
# Deny rules  (deny wins over all allow rules)
# ---------------------------------------------------------------------------

# Block direct pushes to protected branches.
# If the agent omits the branch field the connector defaults to the repo's
# default branch (typically "main"), so we treat absence as "main".
deny_reasons contains "gh.push_to_protected_branch" if {
	input.tool_name == "gh_push_file"
	branch := object.get(input.tool_args, "branch", "main")
	branch in protected_branches
}

# Require an explicit commit message on PR merges.
# Without this an agent can merge silently; forcing a message ensures the
# intent is recorded in the audit log and the git history.
deny_reasons contains "gh.merge_pr_requires_explicit_commit_message" if {
	input.tool_name == "gh_merge_pull_request"
	commit_title := object.get(input.tool_args, "commit_title", "")
	commit_message := object.get(input.tool_args, "commit_message", "")
	count(trim_space(commit_title)) == 0
	count(trim_space(commit_message)) == 0
}

# Readonly agents may not invoke write- or admin-tier tools.
deny_reasons contains "agent.readonly_agent_escalation_denied" if {
	input.agent_id in readonly_agent_ids
	input.risk_tier in {"write", "admin"}
}

# ---------------------------------------------------------------------------
# Approval rules  (allow, but pause for human review before execution)
# ---------------------------------------------------------------------------

# Every admin-tier tool call requires a human sign-off.
approval_reasons contains "policy.admin_tier_requires_approval" if {
	input.risk_tier == "admin"
}

# PR merges always need a reviewer regardless of tier.
# (gh_merge_pull_request is admin tier, but this makes the intent explicit
# and ensures a second approval_reasons entry appears in matched_rules.)
approval_reasons contains "gh.merge_pr_requires_human_approval" if {
	input.tool_name == "gh_merge_pull_request"
}

# ---------------------------------------------------------------------------
# Allow rules
# ---------------------------------------------------------------------------

# Read-tier tools are always allowed for every agent.
allow_reasons contains "policy.read_tier_always_allowed" if {
	input.risk_tier == "read"
}

# Write-tier tools are allowed by default for non-readonly agents.
# Specific deny rules above constrain high-risk write operations.
allow_reasons contains "policy.write_tier_default_allowed" if {
	input.risk_tier == "write"
	not input.agent_id in readonly_agent_ids
}

# Admin-tier tools are conditionally allowed; execution is deferred until
# a human approves (approval_reasons above ensures approval_required=true).
allow_reasons contains "policy.admin_tier_allowed_pending_approval" if {
	input.risk_tier == "admin"
	not input.agent_id in readonly_agent_ids
}
