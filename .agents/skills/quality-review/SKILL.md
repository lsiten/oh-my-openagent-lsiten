---
name: quality-review
description: "Code quality review. 3 parallel reviewers audit git diff for code quality (naming, comments, complexity), performance & security (bottlenecks, vulnerabilities), and test coverage (boundary conditions, error paths). Outputs blocking issues + warnings + pass/fail. Triggers: Auto-invoked by work-with-pr after plan-compliance-review passes, or manual '/quality-review'."
---

# QUALITY-REVIEW — Code Quality Audit

> **MANDATORY**: Say "QUALITY REVIEW MODE ENABLED!" when this skill loads.

## WHAT THIS IS

3 reviewers audit code implementation for quality, performance, security, and test coverage.

**Reviewers:**
- **Code Quality Reviewer**: Naming conventions, comments, complexity, duplication, readability
- **Performance & Security Reviewer**: Performance bottlenecks (loops, N+1, memory leaks), security vulnerabilities (XSS, injection, hardcoded secrets, path traversal)
- **Test Coverage Reviewer**: Test sufficiency, boundary conditions, error handling paths, integration needs

**Input**: `git diff` (or specified branch)

**Output**: `.agents/review-output/quality_review_{timestamp}/summary.md`

---

## HARD PRECONDITIONS

1. **Team Mode must be enabled.** If `team_*` tools unavailable, STOP.

2. **Git repository with changes.** Must have diff to review.

3. **Running in main session** (not background agent).

---

## EXECUTION WORKFLOW

### Phase 0: Get Implementation Diff

If branch specified:
```bash
BRANCH_NAME="feature/xxx"
git diff origin/dev...${BRANCH_NAME}
```

If in worktree:
```bash
cd ${WORKTREE_PATH}
git diff origin/dev...HEAD
```

Otherwise:
```bash
git diff origin/dev...HEAD
```

```typescript
const gitDiff = await Bash({
  command: `cd ${WORKTREE_PATH || '.'} && git diff origin/dev...HEAD`,
  description: "Get implementation diff for quality review"
})
```

If empty:
```
Error: No changes to review.
```

Truncate if > 100KB:
```typescript
const diffStat = await Bash({
  command: `git diff --stat origin/dev...HEAD`,
  description: "Get diff summary"
})

// If too large, focus on source files (skip generated/vendor)
const filteredDiff = await Bash({
  command: `git diff origin/dev...HEAD -- '*.ts' '*.js' '*.py' '*.go' ':!*.test.*' ':!dist/' ':!node_modules/'`,
  description: "Get source file diff only"
})
```

### Phase 1: Create Review Team

```typescript
const teamResult = await team_create({
  inline_spec: {
    name: "quality-review",
    description: "Code quality audit - validate code quality, performance, security, tests",
    members: [
      {
        name: "code-quality-reviewer",
        kind: "category",
        category: "unspecified-high",
        prompt: `You are the Code Quality Reviewer in a quality audit team.

Your ONLY job: audit code quality and maintainability.

Review dimensions:
1. Naming conventions - descriptive? Consistent? Follow project style?
2. Comments - clear? Up-to-date? Avoid stating the obvious?
3. Complexity - functions too long? Deep nesting? Cyclomatic complexity high?
4. Duplication - repeated code blocks? Extract to helper?
5. Readability - clear logic flow? Avoid magic numbers? Self-documenting?

Output format:

## BLOCKING ISSUES (MUST FIX - severely impacts maintainability)
1. [file:line] [Issue] — [Fix suggestion]

## WARNINGS (SHOULD FIX - impacts maintainability)
1. [file:line] [Issue] — [Suggestion]

## MINOR SUGGESTIONS (MAY FIX - nice-to-have)
1. [file:line] [Issue] — [Suggestion]

## DECISION
✅ PASS / ⚠️ WARN / ❌ FAIL

PASS = no blocking issues
WARN = warnings but no blocking
FAIL = blocking issues exist

Keep each issue ≤3 sentences. Cite file:line.`
      },
      {
        name: "performance-security-reviewer",
        kind: "category",
        category: "ultrabrain",
        prompt: `You are the Performance & Security Reviewer in a quality audit team.

Your ONLY job: identify performance bottlenecks and security vulnerabilities.

Review dimensions:

**Performance:**
1. Infinite loops or unbounded recursion?
2. N+1 query problems?
3. Memory leaks (unclosed resources, growing arrays)?
4. Inefficient algorithms (O(n²) when O(n) exists)?
5. Blocking operations on hot paths?

**Security:**
1. XSS vulnerabilities (unescaped user input in HTML)?
2. SQL injection (string concatenation in queries)?
3. Command injection (unsanitized shell commands)?
4. Hardcoded secrets (API keys, passwords, tokens)?
5. Path traversal (unchecked file paths)?
6. Missing input validation at boundaries?

Output format:

## BLOCKING ISSUES (MUST FIX - security vulnerabilities or severe performance problems)
1. [file:line] [Vulnerability/Performance issue] — [Fix]

## WARNINGS (SHOULD FIX - potential issues)
1. [file:line] [Issue] — [Suggestion]

## DECISION
✅ PASS / ⚠️ WARN / ❌ FAIL

Keep each issue ≤3 sentences. Cite file:line. Be specific about impact.`
      },
      {
        name: "test-coverage-reviewer",
        kind: "category",
        category: "unspecified-high",
        prompt: `You are the Test Coverage Reviewer in a quality audit team.

Your ONLY job: audit test coverage and quality.

Review dimensions:
1. Tests exist for new/modified code?
2. Boundary conditions covered (empty input, max values, nulls)?
3. Error handling paths tested?
4. Happy path AND failure paths covered?
5. Integration tests for cross-module interactions?
6. Test quality - clear assertions? Good test data? Independent tests?

Output format:

## BLOCKING ISSUES (MUST FIX - critical paths untested)
1. [file:line] [Function/module] has NO TESTS
2. [file:line] Error handling path NOT TESTED

## WARNINGS (SHOULD FIX - incomplete coverage)
1. [file:line] Missing boundary condition test for [scenario]

## MINOR SUGGESTIONS (MAY FIX)
1. Test could be more specific: [suggestion]

## DECISION
✅ PASS / ⚠️ WARN / ❌ FAIL

Keep each issue ≤3 sentences. Cite file:line for untested code.`
      }
    ]
  }
})

const teamRunId = teamResult.teamRunId
```

### Phase 2: Send Review Task (Parallel)

```typescript
const reviewPrompt = `<quality-review-task>
Audit the following code changes for quality, performance, security, and test coverage.

<implementation-diff>
${gitDiff}
</implementation-diff>

Your task: Apply your review dimension and identify issues.

Output:
1. BLOCKING ISSUES (MUST FIX)
2. WARNINGS (SHOULD FIX)
3. MINOR SUGGESTIONS (MAY FIX) - optional
4. DECISION (PASS/WARN/FAIL)

Each issue ≤3 sentences. Cite file:line.
</quality-review-task>`

// Parallel dispatch
await team_send_message({ teamRunId, to: "code-quality-reviewer", kind: "message", content: reviewPrompt })
await team_send_message({ teamRunId, to: "performance-security-reviewer", kind: "message", content: reviewPrompt })
await team_send_message({ teamRunId, to: "test-coverage-reviewer", kind: "message", content: reviewPrompt })
```

**[WAIT]** End turn. Wait for 3 reviewers.

### Phase 3: Merge Results

```typescript
// Parse replies
const qualityResult = parseReviewerOutput(qualityReply)
const perfSecResult = parseReviewerOutput(perfSecReply)
const testResult = parseReviewerOutput(testReply)

// Overall decision
const hasBlockingIssues = [qualityResult, perfSecResult, testResult].some(r => r.blockingIssues?.length > 0)
const hasWarnings = [qualityResult, perfSecResult, testResult].some(r => r.warnings?.length > 0)

const overallDecision = hasBlockingIssues ? "FAIL" : (hasWarnings ? "WARN" : "PASS")

// Create output
const timestamp = formatTimestamp()
const outputDir = `.agents/review-output/quality_review_${timestamp}`
await Bash({ command: `mkdir -p ${outputDir}` })

await Write(`${outputDir}/reviewer1-code-quality.md`, qualityReply)
await Write(`${outputDir}/reviewer2-performance-security.md`, perfSecReply)
await Write(`${outputDir}/reviewer3-test-coverage.md`, testReply)

const summary = `# Quality Review Summary

**Branch**: ${BRANCH_NAME || 'current'}
**Review Date**: ${timestamp}

---

## Review Results

| Reviewer | Decision |
|----------|----------|
| Code Quality | ${qualityResult.decision} |
| Performance & Security | ${perfSecResult.decision} |
| Test Coverage | ${testResult.decision} |

---

## BLOCKING ISSUES (MUST FIX)

${mergeBlockingIssues([qualityResult, perfSecResult, testResult])}

${!hasBlockingIssues ? '_No blocking issues found._' : ''}

---

## WARNINGS (SHOULD FIX)

${mergeWarnings([qualityResult, perfSecResult, testResult])}

${!hasWarnings && !hasBlockingIssues ? '_No warnings._' : ''}

---

## MINOR SUGGESTIONS (MAY FIX)

${mergeSuggestions([qualityResult, perfSecResult, testResult])}

---

## OVERALL DECISION

${overallDecision === "PASS" ? 
  "✅ **PASS** - Code quality approved. No blocking issues or warnings." : 
  overallDecision === "WARN" ? 
  "⚠️ **WARN** - Code quality acceptable but has warnings. Recommend fixing before PR." : 
  "❌ **FAIL** - Code has blocking issues. Must fix before proceeding."}

---

## Next Steps

${overallDecision === "PASS" ? 
  "Proceed to PR creation (work-with-pr Phase 2)." : 
  overallDecision === "WARN" ? 
  "User decision: Fix warnings or proceed to PR?" : 
  "Fix blocking issues, commit, and re-run quality-review."}
`

await Write(`${outputDir}/summary.md`, summary)
```

### Phase 4: Output Result

```
Quality review complete.

Report: .agents/review-output/quality_review_${timestamp}/summary.md

${overallDecision === "PASS" ? 
  "✅ Code quality approved. Proceeding to PR..." : 
  overallDecision === "WARN" ? 
  "⚠️ Code has warnings. Continue to PR? (y/n)" : 
  "❌ Code has blocking issues. Fix and re-review."}
```

If WARN, wait for user input before proceeding.

### Phase 5: Cleanup Team

```typescript
await team_shutdown_request({ teamRunId, member: "code-quality-reviewer" })
await team_shutdown_request({ teamRunId, member: "performance-security-reviewer" })
await team_shutdown_request({ teamRunId, member: "test-coverage-reviewer" })

await team_approve_shutdown({ teamRunId, member: "code-quality-reviewer" })
await team_approve_shutdown({ teamRunId, member: "performance-security-reviewer" })
await team_approve_shutdown({ teamRunId, member: "test-coverage-reviewer" })

await team_delete({ teamRunId })
```

---

## ANTI-PATTERNS

| Violation | Why it fails |
|-----------|--------------|
| Review plan compliance | Wrong skill - use plan-compliance-review |
| Accept all warnings as "minor" | Defeats purpose of review |
| Skip security review "because it's internal" | Internal code can have vulnerabilities |
| Ignore test coverage "we'll add tests later" | Technical debt accumulates |
| Serial reviewer calls | Slow |

---

## SEVERITY GUIDELINES

**BLOCKING (MUST FIX):**
- Security vulnerabilities (injection, XSS, hardcoded secrets)
- Critical performance issues (infinite loops, severe memory leaks)
- Completely untested critical paths
- Code that will break in production

**WARNING (SHOULD FIX):**
- Maintainability issues (high complexity, poor naming)
- Potential performance problems (inefficient algorithms)
- Incomplete test coverage
- Missing input validation

**MINOR (MAY FIX):**
- Style inconsistencies
- Trivial refactoring opportunities
- Comment improvements

---

## NOTES

- This skill is quality-focused: "Is code good?"
- NOT compliance-focused: "Does code match plan?" (that's plan-compliance-review)
- Reviewers operate independently
- Typically auto-invoked by work-with-pr Phase 1.5 Gate 2 (after plan-compliance-review passes)
- Can be manually invoked: `/quality-review` or `/quality-review --branch feature/xxx`
