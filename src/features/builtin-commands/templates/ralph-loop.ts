export const RALPH_LOOP_TEMPLATE = `You are starting a Ralph Loop - a self-referential development loop that runs until task completion.

## How Ralph Loop Works

1. You will work on the task continuously
2. When you believe the task is FULLY complete, output: \`<promise>{{COMPLETION_PROMISE}}</promise>\`
3. If you don't output the promise, the loop will automatically inject another prompt to continue
4. Maximum iterations: Configurable (default 100)

## Rules

- Focus on completing the task fully, not partially
- Don't output the completion promise until the task is truly done
- Each iteration should make meaningful progress toward the goal
- If stuck, try different approaches
- Use todos to track your progress

## Exit Conditions

1. **Completion**: Output your completion promise tag when fully complete
2. **Max Iterations**: Loop stops automatically at limit
3. **Cancel**: User runs \`/cancel-ralph\` command

## Your Task

Parse the arguments below and begin working on the task. The format is:
\`"task description" [--completion-promise=TEXT] [--max-iterations=N] [--strategy=reset|continue]\`

Default completion promise is "DONE" and default max iterations is 100.`

export const ULW_LOOP_TEMPLATE = `You are starting an ULTRAWORK Loop - a self-referential development loop with mandatory checkpoints.

## Workflow Phases (STRICT SEQUENCE)

### Phase 1: Requirement Clarification (BLOCKING - WAIT FOR USER)
**Goal**: Ensure you understand what to build before planning how.

**MANDATORY OUTPUT FORMAT**:
\`\`\`markdown
## 📋 Requirement Clarification

**Task**: [restate user's request in your words]

**My Understanding**:
- Goal: [what user wants to achieve]
- Scope: [what's included / what's excluded]
- Constraints: [any limitations or requirements]

**Questions** (if any):
1. [question about ambiguity 1]
2. [question about ambiguity 2]

---
**User**: Please confirm above is correct, or clarify. Type "yes" to proceed to design phase.
\`\`\`

**STOP HERE. DO NOT CONTINUE TO PHASE 2 UNTIL USER RESPONDS.**

**Completion Gate**: User explicitly types "yes", "correct", "proceed", or "确认"

**FORBIDDEN ACTIONS**:
- Proceeding to Phase 2 without user response
- Making assumptions and auto-continuing
- Writing any code or technical design in Phase 1
- Using tool calls (Read/Grep/etc) before user confirms understanding

---

### Phase 2: Technical Design (BLOCKING - WAIT FOR USER)
**Goal**: Plan the solution architecture before touching code.

**ONLY START THIS AFTER USER CONFIRMED PHASE 1**

**MANDATORY OUTPUT FORMAT**:
\`\`\`markdown
## 🏗️ Technical Design

**Approach**: [high-level technical strategy]

**Files to Change**:
- \`path/to/file1.ts\`: [what changes and why]
- \`path/to/file2.ts\`: [what changes and why]

**Implementation Steps**:
1. [step 1]
2. [step 2]
3. [step 3]

**Risks & Mitigation**:
- Risk: [potential issue] → Mitigation: [how to handle]

**Success Criteria**:
- [ ] [how to verify it works - test 1]
- [ ] [how to verify it works - test 2]

---
**User**: Please approve design. Type "yes" to start implementation, or request changes.
\`\`\`

**STOP HERE. DO NOT WRITE CODE UNTIL USER APPROVES.**

**Completion Gate**: User explicitly approves design

**FORBIDDEN ACTIONS**:
- Writing any code before user approval
- Using Edit/Write tools in Phase 2
- Auto-proceeding to Phase 3
- Making code changes "to show example"

---

### Phase 3: Implementation
**Goal**: Execute approved plan with continuous verification.

**ONLY START AFTER USER APPROVED PHASE 2 DESIGN**

**Isolation Strategy** (for parallel work):
- If multiple requirements in progress, use \`git worktree\` for isolation
- Each requirement gets separate worktree: \`git worktree add ../task-{name} -b feature/{name}\`
- Work in isolated worktree to avoid conflicts
- Keep main worktree clean

**Actions**:
1. NOW you can use tool calls (Edit, Write, Read, Bash, etc)
2. Implement according to approved design
3. Write tests as you go (if applicable)
4. Verify each step works before moving to next
5. If blocked or design needs adjustment, surface to user immediately
6. When implementation complete, **DO NOT MERGE YET** - move to Phase 4

**FORBIDDEN ACTIONS**:
- Deviating from approved design without asking
- Skipping testing
- Assuming completion without verification
- Auto-merging without approval

---

### Phase 4: Merge Confirmation
**Goal**: Get explicit approval before merging changes.

**Actions**:
1. Present summary of changes:
   - Files modified
   - Tests added/updated
   - Key behavior changes
2. Show git diff or commit log if helpful
3. Ask: "Ready to merge? (yes/no/show details)"
4. **ONLY merge after explicit "yes"**
5. After merge, emit: \`<promise>{{COMPLETION_PROMISE}}</promise>\`

**Completion Gate**: User confirms merge + Oracle verification

**FORBIDDEN**: Auto-merge, merge without asking, assume approval from Phase 2 design

---

## Phase State Tracking

Use todos to track phase progress:
\`\`\`
- [x] Phase 1: Requirements clarified with user
- [x] Phase 2: Design approved by user
- [ ] Phase 3: Implementation in progress (worktree: feature/xyz)
- [ ] Phase 4: Merge approval pending
\`\`\`

## Exit Conditions

1. **Success**: User approves merge (Phase 4) + Oracle verifies
2. **Cancel**: User runs \`/cancel-ralph\`
3. **Max iterations**: 500 (ultrawork mode) / 100 (normal mode)

## Critical Rules

- **BLOCKING PHASES**: Phase 1 and 2 are BLOCKING - you MUST stop and wait for user response
- **NO PHASE SKIPPING**: Always confirm → design → implement → merge approval
- **USER GATES REQUIRED**: Cannot proceed to next phase without explicit user approval
- **NO TOOL CALLS IN PHASE 1/2**: FORBIDDEN to use Read/Grep/Edit/Write until Phase 3
- **DESIGN BEFORE CODE**: Never write implementation before design is approved
- **NO AUTO-MERGE**: MUST get explicit merge approval before merging to main branch
- **WORKTREE FOR PARALLEL WORK**: Use git worktree when multiple requirements active
- **SURFACE BLOCKERS EARLY**: If stuck or design flawed, stop and ask user

## Your Task

Arguments format: \`"task description" [--completion-promise=TEXT] [--strategy=reset|continue]\`

Default completion promise: "DONE"

---

## ⚠️ START HERE - PHASE 1 ONLY

**YOU MUST START WITH PHASE 1 OUTPUT FORMAT SHOWN ABOVE.**

**DO NOT**:
- ❌ Start coding immediately
- ❌ Use tool calls (Read, Grep, Edit, Write, Bash)
- ❌ Jump to Phase 2 or Phase 3
- ❌ Make any file changes

**DO**:
- ✅ Output the Phase 1 markdown format
- ✅ State your understanding
- ✅ Ask clarifying questions if needed
- ✅ STOP and WAIT for user confirmation

**After user confirms, move to Phase 2 design. After user approves design, move to Phase 3 implementation.**`

export const CANCEL_RALPH_TEMPLATE = `Cancel the currently active Ralph Loop.

This will:
1. Stop the loop from continuing
2. Clear the loop state file
3. Allow the session to end normally

Check if a loop is active and cancel it. Inform the user of the result.`
