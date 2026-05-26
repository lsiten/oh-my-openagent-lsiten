---
name: plan-compliance-review
description: "Plan compliance review. 3 parallel reviewers compare .omo/plans/*.md against git diff to verify implementation matches plan. Validates feature completeness, technical approach adherence, edge case coverage. Triggers: Auto-invoked by work-with-pr after implementation, or manual '/plan-compliance-review [plan-file]'."
---

# PLAN-COMPLIANCE-REVIEW — Implementation vs Plan Verification

> **MANDATORY**: Say "PLAN COMPLIANCE REVIEW MODE ENABLED!" when this skill loads.

## WHAT THIS IS

3 reviewers compare plan document against code implementation to verify compliance.

**Reviewers:**
- **Feature Completeness Reviewer**: Every plan TODO implemented? Missing features? Scope drift?
- **Technical Adherence Reviewer**: Architecture/interface/data-flow matches plan? Deviations?
- **Edge Case Coverage Reviewer**: Plan's edge cases handled? Tests cover boundaries?

**Inputs:**
1. Plan file: `.omo/plans/*.md`
2. Implementation: `git diff` (or specified branch)

**Output**: `.agents/review-output/plan_compliance_review_{timestamp}/summary.md`

---

## HARD PRECONDITIONS

1. **Team Mode must be enabled.** If `team_*` tools unavailable, STOP.

2. **Plan file must exist.** If no plan, ask user to specify.

3. **Git repository with changes.** Must have commits to review.

4. **Running in main session** (not background agent).

---

## EXECUTION WORKFLOW

### Phase 0: Gather Inputs

**Step 1: Locate plan file**

If user provides path → use it.
If invoked from work-with-pr → plan path passed as arg.
Otherwise → find latest:

```bash
PLAN_FILE=$(ls -t .omo/plans/*.md 2>/dev/null | head -1)
```

Read plan:
```typescript
const planContent = await Read(PLAN_FILE)
```

**Step 2: Get implementation diff**

If branch specified:
```bash
BRANCH_NAME="feature/xxx"
git diff origin/dev...${BRANCH_NAME}
```

If in worktree (work-with-pr context):
```bash
cd ${WORKTREE_PATH}
git diff origin/dev...HEAD
```

Otherwise (current branch):
```bash
git diff origin/dev...HEAD
```

```typescript
const gitDiff = await Bash({ 
  command: `cd ${WORKTREE_PATH || '.'} && git diff origin/dev...HEAD`,
  description: "Get implementation diff for compliance review"
})
```

If diff is empty:
```
Error: No changes to review. Implementation is identical to base branch.
```

**Step 3: Truncate if needed**

If diff > 100KB, summarize changed files + show critical sections only:
```typescript
const diffSummary = await Bash({
  command: `git diff --stat origin/dev...HEAD`,
  description: "Get diff summary"
})

const criticalFiles = extractCriticalFiles(planContent) // Files mentioned in plan
const filteredDiff = await Bash({
  command: `git diff origin/dev...HEAD -- ${criticalFiles.join(' ')}`,
  description: "Get diff for plan-critical files"
})
```

### Phase 1: Create Review Team

```typescript
const teamResult = await team_create({
  inline_spec: {
    name: "plan-compliance-review",
    description: "Plan compliance review - verify implementation matches plan",
    members: [
      {
        name: "feature-completeness-reviewer",
        kind: "category",
        category: "unspecified-high",
        prompt: `You are the Feature Completeness Reviewer in a plan compliance review team.

Your ONLY job: verify all plan TODOs are implemented.

Review process:
1. Extract ALL TODO items from plan (list them)
2. For each TODO, check if implementation contains corresponding code
3. Identify missing features
4. Identify scope drift (features NOT in plan but implemented)

Output format:

## BLOCKING ISSUES (MUST FIX)
- [ ] TODO #N: [description] — NOT IMPLEMENTED or PARTIALLY IMPLEMENTED (explain what's missing)

## WARNINGS (SHOULD FIX)
- Scope drift detected: [feature X] implemented but NOT in plan

## TODO CHECKLIST
- [x] TODO #1: [description] — ✅ Implemented in [file:line]
- [ ] TODO #2: [description] — ❌ Missing

## DECISION
✅ PASS / ❌ FAIL

Be specific. Cite file:line for implemented features.`
      },
      {
        name: "technical-adherence-reviewer",
        kind: "category",
        category: "ultrabrain",
        prompt: `You are the Technical Adherence Reviewer in a plan compliance review team.

Your ONLY job: verify implementation follows plan's technical approach.

Review dimensions:
1. Plan's architecture vs implementation architecture - match?
2. Module boundaries - match plan's design?
3. Interface definitions - match plan's API contracts?
4. Data flow - follows plan's diagram?
5. Deviations from plan - justified or arbitrary?

Output format:

## BLOCKING ISSUES (MUST FIX)
1. [file:line] Deviation from plan: Plan requires [X], implementation uses [Y] — [explain impact]

## WARNINGS (SHOULD FIX)
1. [file:line] Minor deviation: [description] — [suggestion]

## DECISION
✅ PASS / ❌ FAIL

Be specific. Cite file:line and quote plan sections.`
      },
      {
        name: "edge-case-coverage-reviewer",
        kind: "category",
        category: "unspecified-high",
        prompt: `You are the Edge Case Coverage Reviewer in a plan compliance review team.

Your ONLY job: verify plan's edge cases are handled.

Review dimensions:
1. Plan mentions edge cases (error handling, extreme values, concurrency, etc.) - are they implemented?
2. Plan requires specific error handling - is it present?
3. Plan specifies boundary conditions - are they tested?
4. Plan requires validation - is it implemented?

Output format:

## BLOCKING ISSUES (MUST FIX)
1. Plan requires handling [edge case X] — NOT FOUND in implementation
2. Plan requires test for [boundary Y] — NO TEST FOUND

## WARNINGS (SHOULD FIX)
1. Edge case [Z] handled but not tested

## DECISION
✅ PASS / ❌ FAIL

Be specific. Cite plan sections and file:line.`
      }
    ]
  }
})

const teamRunId = teamResult.teamRunId
```

### Phase 2: Send Review Task (Parallel)

```typescript
const reviewPrompt = `<plan-compliance-review-task>
Compare the plan document against the implementation to verify compliance.

<plan>
${planContent}
</plan>

<implementation-diff>
${gitDiff}
</implementation-diff>

Your task: Apply your review dimension and verify implementation matches plan.

Output:
1. BLOCKING ISSUES (MUST FIX)
2. WARNINGS (SHOULD FIX)
3. DECISION (PASS/FAIL)

Each issue ≤3 sentences. Cite file:line and plan sections.
</plan-compliance-review-task>`

// Parallel dispatch
await team_send_message({ teamRunId, to: "feature-completeness-reviewer", kind: "message", content: reviewPrompt })
await team_send_message({ teamRunId, to: "technical-adherence-reviewer", kind: "message", content: reviewPrompt })
await team_send_message({ teamRunId, to: "edge-case-coverage-reviewer", kind: "message", content: reviewPrompt })
```

**[WAIT]** End turn. Wait for 3 reviewers.

### Phase 3: Merge Results

```typescript
// Parse replies
const featureResult = parseReviewerOutput(featureReply)
const technicalResult = parseReviewerOutput(technicalReply)
const edgeCaseResult = parseReviewerOutput(edgeCaseReply)

// Overall decision
const allPass = featureResult.decision === "PASS" && 
                technicalResult.decision === "PASS" && 
                edgeCaseResult.decision === "PASS"

// Create output
const timestamp = formatTimestamp()
const outputDir = `.agents/review-output/plan_compliance_review_${timestamp}`
await Bash({ command: `mkdir -p ${outputDir}` })

await Write(`${outputDir}/reviewer1-feature-completeness.md`, featureReply)
await Write(`${outputDir}/reviewer2-technical-adherence.md`, technicalReply)
await Write(`${outputDir}/reviewer3-edge-case-coverage.md`, edgeCaseReply)

const summary = `# Plan Compliance Review Summary

**Plan File**: ${PLAN_FILE}
**Branch**: ${BRANCH_NAME || 'current'}
**Review Date**: ${timestamp}

---

## Review Results

| Reviewer | Decision |
|----------|----------|
| Feature Completeness | ${featureResult.decision} |
| Technical Adherence | ${technicalResult.decision} |
| Edge Case Coverage | ${edgeCaseResult.decision} |

---

## BLOCKING ISSUES (MUST FIX)

${mergeBlockingIssues([featureResult, technicalResult, edgeCaseResult])}

---

## WARNINGS (SHOULD FIX)

${mergeWarnings([featureResult, technicalResult, edgeCaseResult])}

---

## TODO CHECKLIST

${featureResult.todoChecklist || 'See reviewer1-feature-completeness.md'}

---

## OVERALL DECISION

${allPass ? 
  "✅ **PASS** - Implementation complies with plan." : 
  "❌ **FAIL** - Implementation deviates from plan. Fix blocking issues."}

---

## Next Steps

${allPass ? 
  "Proceed to quality-review (code quality gate)." : 
  "Fix blocking issues, commit changes, and re-run plan-compliance-review."}
`

await Write(`${outputDir}/summary.md`, summary)
```

### Phase 4: Output Result

```
Plan compliance review complete.

Report: .agents/review-output/plan_compliance_review_${timestamp}/summary.md

${allPass ? 
  "✅ Implementation matches plan. Proceeding to quality review..." : 
  "❌ Implementation deviates from plan. Fix and re-review."}
```

### Phase 5: Cleanup Team

```typescript
await team_shutdown_request({ teamRunId, member: "feature-completeness-reviewer" })
await team_shutdown_request({ teamRunId, member: "technical-adherence-reviewer" })
await team_shutdown_request({ teamRunId, member: "edge-case-coverage-reviewer" })

await team_approve_shutdown({ teamRunId, member: "feature-completeness-reviewer" })
await team_approve_shutdown({ teamRunId, member: "technical-adherence-reviewer" })
await team_approve_shutdown({ teamRunId, member: "edge-case-coverage-reviewer" })

await team_delete({ teamRunId })
```

---

## ANTI-PATTERNS

| Violation | Why it fails |
|-----------|--------------|
| Review plan quality instead of compliance | Wrong skill - use plan-review |
| Review code quality | Wrong skill - use quality-review |
| Serial reviewer calls | Slow |
| Skip diff truncation for huge diffs | Context overflow |
| Accept scope drift as "bonus features" | Breaks plan discipline |

---

## NOTES

- This skill is compliance-focused: "Does code match plan?"
- NOT quality-focused: "Is code good?" (that's quality-review)
- Scope drift (extra features not in plan) is flagged as warning - user decides if acceptable
- Reviewers operate independently
- Typically auto-invoked by work-with-pr Phase 1.5 Gate 1
