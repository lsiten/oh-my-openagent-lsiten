---
name: plan-review
description: "Plan document review. 3 parallel reviewers validate .omo/plans/*.md for completeness, technical feasibility, and risk assessment. Outputs blocking issues + recommendations + pass/fail decision. Triggers: Auto-invoked by Prometheus after plan generation, or manual '/plan-review [plan-file]'."
---

# PLAN-REVIEW — Plan Document Review

> **MANDATORY**: Say "PLAN REVIEW MODE ENABLED!" when this skill loads.

## WHAT THIS IS

3 reviewers validate the work plan document itself (NOT implementation code).

**Reviewers:**
- **Completeness Reviewer**: Goals, scope, dependencies, TODO granularity
- **Feasibility Reviewer**: Technical approach, architecture, performance, edge cases
- **Risk Reviewer**: Potential risks, rollback strategy, test coverage, compatibility

**Output**: `.agents/review-output/plan_review_{timestamp}/summary.md`

---

## HARD PRECONDITIONS

1. **Team Mode must be enabled.** If `team_*` tools unavailable, STOP and tell user:
   > "plan-review requires team-mode. Set `team_mode.enabled: true` in `~/.config/opencode/oh-my-opencode.jsonc` and restart opencode."

2. **Plan file must exist.** If no plan found, STOP.

3. **Running in main session** (not background agent).

---

## EXECUTION WORKFLOW

### Phase 0: Locate Plan File

If user provides path → use it.
Otherwise → find latest plan:

```bash
PLAN_FILE=$(ls -t .omo/plans/*.md 2>/dev/null | head -1)
```

If not found:
```
Error: No plan file found in .omo/plans/

Run `/start-work` (Prometheus) to generate a plan first.
```

Read plan content:
```typescript
const planContent = await Read(PLAN_FILE)
```

### Phase 1: Create Review Team

Call `team_create` ONCE with 3 reviewers:

```typescript
const teamResult = await team_create({
  inline_spec: {
    name: "plan-review",
    description: "Plan document review team - validate completeness, feasibility, risk",
    members: [
      {
        name: "completeness-reviewer",
        kind: "category",
        category: "unspecified-high",
        prompt: `You are the Completeness Reviewer in a plan document review team.

Your ONLY job: validate plan completeness and structure.

Review dimensions:
1. Objectives clearly defined and measurable?
2. Scope boundaries explicit (IN/OUT)?
3. Missing critical modules or functionalities?
4. Dependencies complete (internal modules, external services, third-party libs)?
5. TODO granularity reasonable (not too broad, not too granular)?
6. Success criteria and verification strategy defined?

Output format:

## BLOCKING ISSUES (MUST FIX)
1. [Specific issue] — [Suggestion]

## WARNINGS (SHOULD FIX)
1. [Specific issue] — [Suggestion]

## DECISION
✅ PASS / ❌ FAIL

Keep each issue ≤3 sentences. Be specific and actionable.`
      },
      {
        name: "feasibility-reviewer",
        kind: "category",
        category: "ultrabrain",
        prompt: `You are the Feasibility Reviewer in a plan document review team.

Your ONLY job: validate technical feasibility.

Review dimensions:
1. Technical approach reasonable? Better alternatives exist?
2. Architecture design fits requirements?
3. Performance bottlenecks anticipated (concurrency, data volume, latency)?
4. Edge case handling comprehensive?
5. Third-party dependencies stable and controllable?
6. Resource constraints (time, infrastructure, team skills) considered?

Output format:

## BLOCKING ISSUES (MUST FIX)
1. [Specific issue] — [Suggestion]

## WARNINGS (SHOULD FIX)
1. [Specific issue] — [Suggestion]

## DECISION
✅ PASS / ❌ FAIL

Keep each issue ≤3 sentences. Be specific and actionable.`
      },
      {
        name: "risk-reviewer",
        kind: "category",
        category: "unspecified-high",
        prompt: `You are the Risk Reviewer in a plan document review team.

Your ONLY job: identify risks and validate mitigation strategies.

Review dimensions:
1. Potential risks identified (technical, business, compatibility)?
2. Rollback strategy clear and feasible?
3. Test coverage sufficient? Blind spots?
4. Impact assessment on existing features?
5. Production deployment risks considered?
6. Monitoring and observability strategy defined?

Output format:

## BLOCKING ISSUES (MUST FIX)
1. [Risk description] — [Missing mitigation]

## WARNINGS (SHOULD FIX)
1. [Risk description] — [Suggested mitigation]

## DECISION
✅ PASS / ❌ FAIL

Keep each issue ≤3 sentences. Be specific and actionable.`
      }
    ]
  }
})

const teamRunId = teamResult.teamRunId
```

If `team_create` fails, surface error and stop.

### Phase 2: Send Review Task (Parallel)

Send identical prompt to all 3 reviewers **in parallel** (3 `team_send_message` calls in same response):

```typescript
const reviewPrompt = `<plan-review-task>
Review the following work plan:

<plan>
${planContent}
</plan>

Apply your review dimension and output:
1. BLOCKING ISSUES (MUST FIX)
2. WARNINGS (SHOULD FIX)
3. DECISION (PASS/FAIL)

Each issue ≤3 sentences. Be specific and actionable.
</plan-review-task>`

// Parallel dispatch
await team_send_message({ teamRunId, to: "completeness-reviewer", kind: "message", content: reviewPrompt })
await team_send_message({ teamRunId, to: "feasibility-reviewer", kind: "message", content: reviewPrompt })
await team_send_message({ teamRunId, to: "risk-reviewer", kind: "message", content: reviewPrompt })
```

**[WAIT]** End turn. Wait for all 3 reviewers to reply via `<peer_message>` blocks.

### Phase 3: Merge Review Results

When all 3 replies received, aggregate results:

```typescript
// Parse each reviewer's output
const completenessResult = parseReviewerOutput(completenessReply)
const feasibilityResult = parseReviewerOutput(feasibilityReply)
const riskResult = parseReviewerOutput(riskReply)

// Determine overall decision
const allPass = completenessResult.decision === "PASS" && 
                feasibilityResult.decision === "PASS" && 
                riskResult.decision === "PASS"

// Create output directory
const timestamp = formatTimestamp() // YYYYMMDD_HHmmss
const outputDir = `.agents/review-output/plan_review_${timestamp}`
await Bash({ command: `mkdir -p ${outputDir}` })

// Write individual reports
await Write(`${outputDir}/reviewer1-completeness.md`, completenessReply)
await Write(`${outputDir}/reviewer2-feasibility.md`, feasibilityReply)
await Write(`${outputDir}/reviewer3-risk.md`, riskReply)

// Merge summary
const summary = `# Plan Review Summary

**Plan File**: ${PLAN_FILE}
**Review Date**: ${timestamp}

---

## Review Results

| Reviewer | Decision |
|----------|----------|
| Completeness Reviewer | ${completenessResult.decision} |
| Feasibility Reviewer | ${feasibilityResult.decision} |
| Risk Reviewer | ${riskResult.decision} |

---

## BLOCKING ISSUES (MUST FIX)

${mergeBlockingIssues([completenessResult, feasibilityResult, riskResult])}

---

## WARNINGS (SHOULD FIX)

${mergeWarnings([completenessResult, feasibilityResult, riskResult])}

---

## OVERALL DECISION

${allPass ? "✅ **PASS** - Plan approved for implementation." : "❌ **FAIL** - Fix blocking issues and re-review."}

---

## Next Steps

${allPass ? 
  "Run `/start-work` to begin implementation." : 
  "Fix blocking issues in the plan, then re-run `/plan-review`."}
`

await Write(`${outputDir}/summary.md`, summary)
```

### Phase 4: Output Result

Tell user:

```
Plan review complete.

Review report: .agents/review-output/plan_review_${timestamp}/summary.md

${allPass ? 
  "✅ Plan approved. Ready for implementation." : 
  "❌ Plan has blocking issues. Review the report and fix."}
```

### Phase 5: Cleanup Team

```typescript
await team_shutdown_request({ teamRunId, member: "completeness-reviewer" })
await team_shutdown_request({ teamRunId, member: "feasibility-reviewer" })
await team_shutdown_request({ teamRunId, member: "risk-reviewer" })

// Lead approves (has authority)
await team_approve_shutdown({ teamRunId, member: "completeness-reviewer" })
await team_approve_shutdown({ teamRunId, member: "feasibility-reviewer" })
await team_approve_shutdown({ teamRunId, member: "risk-reviewer" })

await team_delete({ teamRunId })
```

Confirm cleanup: "Plan review team disbanded."

---

## ANTI-PATTERNS

| Violation | Why it fails |
|-----------|--------------|
| Serial reviewer calls | Slow, loses parallelism |
| Reviewers reference each other | Breaks independent review |
| Skip team cleanup | Leaks runtime state |
| Review implementation code | Wrong skill - use plan-compliance-review |
| Soft-pedal issues | Defeats purpose of review |

---

## NOTES

- Reviewers operate independently - no cross-referencing
- Reviewers only see plan document - no codebase access needed at this stage
- If user manually invokes with path: `/plan-review .omo/plans/custom-plan.md`
- Can be auto-invoked by Prometheus (see Prometheus prompt modification)
