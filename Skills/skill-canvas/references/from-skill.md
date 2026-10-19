# Turning an existing skill into a spec

The reverse of `multi-step-skill-designer/references/generating.md`. Read the skill's files and write a `skill-spec.json` that shows how it works today. Draw what the files say, not what you think the skill should do.

## Find the pieces

1. **Entry skill**: the `SKILL.md` the user named. Its frontmatter gives `name` and `description`.
2. **Node skills**: every skill the entry skill invokes (by name, through the Skill tool, or by handing a skill name to a subagent). Read each one. They are usually sibling folders named `<workflow>-<step>`.
3. A skill with no node skills is still mappable: its numbered sections or steps become the steps.

## Map to the spec

| In the files | In the spec |
|---|---|
| Arguments, keywords or settings that turn steps on or off | `inputs` with `kind: "dynamic"` and `options` |
| Arguments that only change what steps work on (a date, a URL) | `inputs` with `kind: "data"` |
| Each node skill, or each step of a single skill | one `steps` entry. `id` is the node skill name minus the workflow prefix. `title` and `summary` from its job. `detail` from the rest of its body, condensed. |
| "Run after X", or reading a file X wrote | `dependsOn: ["x"]` |
| Steps launched together, in one message or as separate subagents | same `dependsOn` and same `parallelGroup` |
| A step that waits for all of them, then merges | a join step whose `dependsOn` lists every parallel step |
| "Only if", "skip when", "runs when" | `runWhen`, written with `is`, `isNot`, `in`, `all`, `any` |
| Files a step reads or writes | `reads` / `produces`, plus one `artifacts` entry per file with its `path` and `format` |
| The folder a run writes into | `workDir` |
| A checklist, plan or draft that grows during the run | `outputs` entry with `kind: "intermediate"` and conditional `items` |
| The deliverable | `outputs` entry with `kind: "final"` and `artifact` set to the file that holds it |

## Rules

- Use the files' own words for titles and summaries.
- Leave `x`/`y` out so the canvas auto-arranges.
- Set `status: "draft"`.
- If something is ambiguous (an unclear order, a condition stated two ways), pick the reading the entry skill supports and put the doubt in that step's `detail`, starting with "Unclear:". List those to the user.
- If the files never say what a step reads or writes, still fill in `reads`/`produces` with your best reading and mark it "Unclear:" in `detail`. A step without them shows a warning.
- Check before showing: every node skill appears once, the canvas shows no input/output warnings, every `dependsOn` id exists, there are no cycles, and every dynamic input gates at least one step.
