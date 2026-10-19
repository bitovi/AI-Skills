# Skill canvas: agent protocol

This file is for any AI agent or harness (Claude Code, Copilot, Codex, Cursor, Aider, or a person with a script). It does not depend on any one product. Everything goes through two files and a few commands.

## What this is

A local board shows the architecture of a multi-step skill, either one being designed or an existing one being reviewed: steps, parallel branches, conditional steps, dynamic inputs and dynamic outputs. The user watches and edits it in a browser. You read and edit the same state as JSON.

## Files (in the workspace, default `./skill-viz/`)

| File | Who writes | Purpose |
|---|---|---|
| `skill-spec.json` | user (via the board) and you | The design. Schema in `references/spec.md`. |
| `template.html` | nobody | The board. Never edit it. |
| `.skillviz/events.log` | the board, you | One JSON event per line. The signal channel. |

## Start the board

```bash
scripts/start.sh ./skill-viz        # needs Node 16+, prints the URL
```

Tell the user to open the printed URL. It must be opened over http, not as a file.

## The loop

1. The user designs on the board and clicks **Ready for agent**. The spec gets `status: "needs-review"` and a `ready` event is logged.
2. You wake up (see "Waiting" below) and read `skill-spec.json`.
3. You improve it (see "What you may change"), then set `status: "enhanced"`.
4. Optionally acknowledge: `node scripts/skillviz.js signal ack "short note" --dir ./skill-viz`.
5. The board shows what you changed against the plan as it was handed over (new and changed cards are tagged), and the user accepts or rejects each change. When nothing is pending they click **Approve** (`status: "approved"`, event `approve`) or **Request changes** (back to step 1).
6. On `approve`, write the real skill files into the folder in `outputDir` in `skill-spec.json` (the user chose it in the board's **Files** panel; Approve is blocked until one is set, so it is always present on `approve`). Create the folder if it does not exist. For a new skill, follow `multi-step-skill-designer/references/generating.md` for the content. For an existing skill opened for review, update its files in place so they match the approved spec, and change only what the review changed. The Files panel lists what you write and previews each file, live.

The board keeps `.skillviz/baseline.json`, a snapshot of the plan taken when the user signals `ready` (and again on `approve`). You do not write it. Because your changes are compared against it, edit the spec only after you have been woken by `ready`, and make your changes in the spec itself. Whatever differs from the baseline when you set `status: "enhanced"` is what the user reviews.

## Waiting for the user

Run this and let it block. It prints one JSON line per new event and exits 0:

```bash
node scripts/skillviz.js wait ./skill-viz --name <your-agent-name>
```

- Each `--name` has its own cursor, so events are never missed or repeated, even if you were busy when they arrived.
- `--timeout <seconds>` exits with code 2 if nothing arrives. Loop on it.
- Agents with a background-watch feature (for example Claude Code's Monitor) can watch `.skillviz/events.log` instead.
- If your harness cannot run a blocking command, the user can tell you "go" in chat. Read the spec then.

Event fields: `ts`, `event` (`ready`, `approve`, `ack`, or any short lowercase word), optional `note`, `specHash`, and `specPath` (added by `wait`).

## What the user edits on the board

The user can drag cards, draw and remove connections, add and delete steps, and edit text in the side sheet. Every edit is autosaved into `skill-spec.json`, so you always see the current state. The fields they touch:

- `title`, `summary`: their words. Treat as the intent.
- `userNote`: **an instruction to you** for that step ("what I want here"). Read every one. Act on it, then leave it in place (the user clears it).
- `dependsOn`: the connections they drew. Respect them.
- `x`, `y`: where they placed the card. Never delete or change these. Steps you add should have no `x`/`y`, so they auto-arrange.
- `parallelGroup` and `runWhen`. They select cards and press Make parallel (same parents, same group name, often an auto-named group such as `parallel`; a meaningful rename is welcome) and add a join. Conditions can combine several clauses with `all`/`any` and use `is`, `isNot` or `in`. The dynamic inputs (and their option lists and defaults) are managed in the Inputs panel.

## What you may change

Edit `skill-spec.json` directly. Keep ids stable. Make small edits. The server detects your edit through a content hash, so the user's next save is refused (not merged) if you changed the file in between, and the board reloads.

You own: `detail`, join steps, refining conditions and parallel groups (extend what the user set, for example turn a simple `runWhen` into `all`/`any`, but do not silently drop it), `outputs` and their conditional `items`, `reads`/`produces`, `artifacts` and `workDir`, and missing steps you can justify.
Leave alone unless asked: the user's step titles, summaries, `userNote`, `x`/`y`, ordering and dependencies. If one looks wrong, say so in a `note` on the ack event instead of rewriting it.

Rules of thumb:
- Every step needs `reads` and `produces`, and every produced artifact needs a path and format in `artifacts`. The board blocks Approve until the rules in `references/spec.md` ("Inputs and outputs") all pass, so fix every warning before you set `status: "enhanced"`.
- Mark an input `dynamic` only if it changes which steps run. Otherwise `data`.
- Steps that can run at the same time share `dependsOn` and `parallelGroup`; add a join step after them.
- A plan or checklist that evolves is an `intermediate` output with conditional `items`.
- The file must stay valid JSON. Invalid JSON shows an error banner and the board keeps the last good version.

## No access to localhost? (chat assistants)

An assistant in a plain chat window cannot read the workspace or run `wait`. The board covers this: the user clicks **Chat agent**, copies the generated prompt (it contains these rules and the current `skill-spec.json`), pastes it into the chat, and pastes your reply back. The board extracts the JSON, checks it (valid JSON, unique ids, no unknown or cyclic `dependsOn`), and loads it as agent changes into the same review list, so the user accepts or rejects each change.

If you are such an assistant: reply with the complete updated JSON in a single ```json block, keep every id, keep `x`/`y`/`userNote`, set `"status": "enhanced"`. You cannot write the final skill files; after the user approves, they (or a local agent) can ask you for the file contents and save them into `outputDir`.
