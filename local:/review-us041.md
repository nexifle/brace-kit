# US-041 Composer modes — review diff hunk (supplied, do NOT re-run git diff)

Changeset under review (SlideCreatorShell.tsx + .gitignore). This is the exact diff provided to the reviewer; trust it as authoritative.

## .gitignore
- `.agent` -> `.agents`
- adds: `.cocoindex_code`, `scripts`, `tasks`, `skills`, `!src/skills/`, `ITERATION_GOTCHAS.md`, `sandbox-tutorial.md`

## SlideCreatorShell.tsx (US-041 composer modes, Amendment A.6)
- Imports Loader2, Square icons; `type SlideSessionStatus`; `slideComposerPlaceholder` from utils/slideComposer.
- Composer component now takes `sessionStatus` instead of `busy`.
- Composer mode logic:
  - `running = sessionStatus==='running'`; `waiting = sessionStatus==='waiting_user'`; `typed = !running&&!waiting`; `disabled = !typed||blocked`; `canSend = typed&&!blocked`.
  - waiting_user -> renders a muted bar "Waiting for your answer above" + Cancel (onStop) + footer "Your answer resumes the plan".
  - running -> textarea disabled w/ placeholder 'Generating…', Stop button primary, footer "Stop generating anytime · no edits send".
  - else -> send enabled; placeholder from slideComposerPlaceholder; textarea disabled when !typed.
- ChatRail: reads `sessionStatus` from store, passes to Composer.
- ChatDock: reads `sessionStatus`; closed single-bar has waiting state (non-editable "Waiting for your answer" + ArrowUpRight open-question -> onToggle); running -> Stop.
- Shell: `promptPlaceholder = slideComposerPlaceholder(activeProject, phase, sessionStatus)`.

## Amendment A.6 composer rules (PRD task source)
- 3. Composer: Enabled when sessionStatus in idle|done|stopped|error|waiting_user(false) and not running.
- Exception: when waiting_user, primary input is AskPrompt (composer may stay for cancel-only or hidden).
- When running: composer replaced by Stop primary control.
- Placeholder copy (exact): no project `Describe the deck you want…`; plan_ready `Edit the plan above, or press Build slides`; ready `Ask for changes, e.g. "Make the title darker"`; error `Fix settings or retry your request…`.
- US-041 AC: running -> Stop primary (send hidden/disabled); waiting_user -> AskPrompt primary, freeform composer not used for normal send; plan_ready|ready|stopped|error|idle -> send enabled with exact A.6 placeholders; cannot send empty; cannot start second phase while running; typecheck passes; verify in browser (dev-browser skill unavailable in this env — noted).

## Files to inspect
- src/components/slides/SlideCreatorShell.tsx
- src/utils/slideComposer.ts (new, helper the shell imports)
- .gitignore
Review ONLY these. May read the PRD tasks/prd-slide-creator.md (Amendment A.6) and types as needed.
