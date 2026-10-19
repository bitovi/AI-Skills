# Turning a spec into skills

Read the final `skill-spec.json` from the canvas workspace and write the new skills from it. Do not invent steps that are not on the canvas.

**Every node (step) becomes its own skill. The workflow is not one big skill.** Each node skill does one job and can be run on its own. A thin **entry skill** wires them together in order; it holds no step logic.

## Layout

```
<skills dir>/
  <workflow>/SKILL.md               # entry skill: decide the path, run node skills in order
  <workflow>-<step-id>/SKILL.md     # one folder per step, e.g. morning-brew-calendar
```

All folders are siblings in the target skills directory so each is discoverable.

## Node skill (one per step)

- `name`: `<workflow>-<step-id>`, kebab-case.
- `description`: starts with "Use when...", states when this single job is needed (also usable alone). Do not describe the whole workflow.
- Body, in this order:
  1. **Job**: the step `summary` and `detail`.
  2. **Only if**: the `runWhen` condition written out in words (omit if none).
  3. **Inputs**: one line per entry in `reads`: the input name, or the artifact's path under the work folder, its format, and which node wrote it. If an artifact it reads is missing, or marked skipped or failed in the manifest, say what to do (carry on without it, or stop and report).
  4. **Outputs**: one line per entry in `produces`: the exact path under the work folder and the format, taken from `artifacts`. Parallel nodes write to separate files so they do not collide.
  5. **Report back**: the node ends by replying with one line per artifact: `<artifact id> <path> written|failed <one-line note>`. The entry skill uses this to update the manifest.
- A join node starts with "Wait for all of: ..." then merges, dedupes and ranks, and states what to do if a branch was skipped or failed.
- Nodes never call other nodes. Only the entry skill orders them.

## Entry skill

- `name`: kebab-case from `spec.name`. `description` holds the triggers from the interview, not a workflow summary.
- **Decide the path**: for each `dynamic` input, how to determine its value and which node skills each value turns on or off.
- **Inputs**: each `data` input and what is expected.
- **Run order**: invoke each node skill with the Skill tool, in dependency order. For a `parallelGroup`, launch those nodes at the same time (for example one subagent each, in a single message), each told which node skill to invoke and what to return. Then invoke the join node.
- **Plan file**: for an `intermediate` output, the entry skill writes the plan or checklist early and updates it as nodes finish, and says what adds or removes items (the `when` conditions).
- **Manifest**: see "Tracking outputs" below.
- **Final output**: the deliverable (the artifact named by the `final` output's `artifact`) and its format. If any branch failed or was skipped, still deliver and say what is missing, using the manifest.

## Tracking outputs

Nodes do not share memory, so the entry skill tracks every artifact explicitly in `<workDir>/manifest.json`. Write this section into the entry skill:

1. **Create it first**, before any node runs: one entry per artifact in `artifacts`, with `path`, `format`, `producedBy` (the node skill) and `status: "pending"`. When the path is decided, mark artifacts of skipped nodes `status: "skipped"` with the reason (for example "Jira off").
2. **Update it after every node returns**, from the node's report-back lines. Check the file actually exists and is not empty before setting `status: "written"`; otherwise set `"failed"` with the note. Only the entry skill (the main thread) writes the manifest, never a node or subagent, so parallel nodes cannot clobber it.
3. **Hand paths from it**: when starting a node, pass it the paths of the artifacts it reads, taken from the manifest, and tell it which of those are skipped or failed.
4. **Check it before the final step**: every artifact the final node reads is `written`, `skipped` or `failed`, never still `pending`. A `pending` entry means a node was never run or never reported; run it or mark it failed before going on.
5. **Report from it**: the final output lists anything `skipped` or `failed` in one line each.

```json
{
  "workDir": "/tmp/<workflow>/<run-id>/",
  "artifacts": {
    "diff": { "path": "diff.md", "format": "markdown", "producedBy": "<workflow>-fetch", "status": "written" },
    "sec_findings": { "path": "findings/security.md", "format": "markdown", "producedBy": "<workflow>-sec", "status": "skipped", "note": "security off" }
  }
}
```

## Before saving

1. Every step on the canvas has exactly one node skill, and appears nowhere else.
2. The canvas shows no input/output warnings. Every node skill lists all its `reads` and `produces` with exact paths, and the entry skill's manifest has one entry per artifact.
3. Every `runWhen` condition is written out in words in its node skill and in the entry skill's path section.
4. Every parallel group has a join node that says how to merge.
5. Descriptions contain triggers, not workflow summaries.
6. Show the user the draft (entry skill plus each node skill) and get a yes before writing files.
