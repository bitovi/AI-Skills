# Skill spec reference

`template.html` renders `skill-spec.json`. The agent edits only the JSON. The page polls it every second.

## Run it

```bash
scripts/start.sh ./skill-viz     # needs Node; prints the URL (default http://localhost:8765/template.html)
```

## Vocabulary

- **Dynamic input**: changes *which steps happen*, not just the data steps work on. Gets a toggle in the UI.
- **Data input**: changes what steps work on only. Shown as a chip.
- **Dynamic output**: an evolving plan, checklist or intermediate product shaped by earlier steps and inputs. Model it as `kind: "intermediate"` with conditional `items`.

## Schema

```jsonc
{
  "name": "My Skill",
  "description": "One sentence.",
  "status": "draft",                      // draft | needs-review | enhanced | approved (see PROTOCOL.md)
  "workDir": "/tmp/my-skill/<run-id>/",    // where a run writes its artifacts; artifact paths are relative to it
  "inputs": [
    { "id": "pr_url", "label": "PR URL", "kind": "data" },
    { "id": "depth", "label": "Review depth", "kind": "dynamic",
      "options": [{ "id": "quick", "label": "Quick" }, { "id": "full", "label": "Full" }],
      "default": "quick" }
  ],
  "steps": [
    { "id": "fetch", "title": "Fetch diff", "summary": "One line.",
      "detail": "Markdown: paragraphs, - bullets, **bold**, `code`.",
      "dependsOn": [],                       // ids of upstream steps
      "userNote": "What I want here",        // the user's instruction to the agent; read it, never delete it
      "x": 120, "y": 40,                     // optional, set when the user drags the card; leave alone
      "parallelGroup": "review",             // optional; same name = drawn in one lane
      "runWhen": { "input": "depth", "is": "full" },   // optional
      "reads": ["pr_url"],                   // REQUIRED: input or artifact ids it uses; [] only if it truly needs nothing
      "produces": ["diff"] }                 // REQUIRED: artifact ids it writes; at least one
  ],
  "artifacts": [                             // every file a step writes
    { "id": "diff", "label": "PR diff", "path": "diff.md", "format": "markdown" }
  ],
  "outputs": [
    { "id": "plan", "label": "Review plan", "kind": "intermediate",
      "summary": "...", "shapedBy": ["depth"],
      "items": [ "Always shown", { "text": "Only on full", "when": { "input": "depth", "is": "full" } } ] },
    { "id": "report", "label": "Report", "kind": "final", "summary": "...", "artifact": "report" }   // the artifact it delivers
  ]
}
```

### Conditions (`runWhen`, item `when`)

`{input, is}`, `{input, isNot}`, `{input, in: [..]}`, or compose with `{all: [..]}` / `{any: [..]}`.

### Inputs and outputs (checked all the time)

Every step must say what it reads and what it produces. The canvas marks a card with a warning while any of these fail, and **Approve is blocked** until they all pass:

- `reads` is present on every step (an empty list means "needs nothing" and is a deliberate choice).
- `produces` lists at least one artifact on every step, including joins.
- Every produced id is in `artifacts`, with a `path` (relative to `workDir`) and a `format`.
- Every read id is an input, or an artifact produced by a step it waits for (directly or further upstream). Reading a sibling's file is not allowed.
- Each artifact has exactly one producer. Parallel steps write separate files.
- Each artifact is read by a later step or delivered by an output (`outputs[].artifact`). Nothing is written for no one.
- Every listed artifact is produced by some step.

### Evaluation rules

- A step is skipped if its `runWhen` fails, or if it has dependencies and **all** are skipped.
- A step with several dependencies is a **join**. It still runs if at least one branch ran.
- Steps with the same dependencies and `parallelGroup` render as a parallel lane.
- `dependsOn` must reference existing step ids and must not form a cycle, or the page shows an error banner and keeps the last good render.

## Rules for the agent while building or mapping a skill

1. Update the spec after each design decision, not once at the end. The user should watch it grow.
2. Mark an input `dynamic` only if it changes which steps run. Otherwise `data`.
3. When the user mentions "if X then also do Y", that is a `runWhen` on Y.
4. When work can happen at the same time, give those steps the same `dependsOn` and `parallelGroup`, then add a join step.
5. Prefer an `intermediate` output with conditional `items` for any plan or checklist the skill builds along the way.
6. Make small edits to the JSON (add a step, change one field). Keep ids stable so toggle state and the open side sheet survive reloads.
7. Keep `summary` to one short line. Put the rest in `detail`.
8. Define `reads`, `produces` and the artifacts for a step in the same edit that adds the step. Never leave a step without them.
