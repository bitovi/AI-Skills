---
name: multi-step-skill-designer
description: Use when a user wants to design, plan or prep a multi-step skill or workflow (steps, parallel branches, conditional steps, evolving plans). Draws the design on the skill-canvas and keeps it updated while you work with the user, then turns the finished design into one skill per step plus a thin entry skill. Three modes: guided (default, asks clarifying questions then proposes the steps), manual (user specifies every step, "manual") and one-shot (no questions, "one-shot"). Trigger on "design a skill", "multi-step skill", "plan a workflow", "build a skill with steps". To only look at or review an existing skill, use skill-canvas instead.
argument-hint: "[guided (default) | manual | one-shot] <goal, or your exact steps for manual>"
---

# Multi-step skill designer

Show, don't tell. While the user describes their skill, the design grows on a live canvas.

This skill owns the **building**: the modes, the questions and turning the design into skill files. The canvas, its spec format, its vocabulary (dynamic input, data input, dynamic output) and the review loop belong to the sibling **skill-canvas** skill (`../skill-canvas/`). Read its `SKILL.md` before starting.

## Modes

Pick the mode from the user's request before asking anything. If they do not name one, use **guided**. Say which mode you are in, in one line, and that they can switch at any time.

| Mode | Say it with | Who decides the steps | Questions |
|---|---|---|---|
| **Guided** (default) | nothing, or "guided" | You propose, the user corrects | Clarifying questions first, then a proposal |
| **Manual** | "manual", "I'll specify the steps", or a full step list | The user, exactly as written | Only when the canvas cannot be drawn without an answer |
| **One-shot** | "one-shot", "oneshot", "no questions" | You, from the goal alone | None |

All three modes use the same canvas, spec and review loop. They differ only in section 2.

## 1. Open the canvas

Open it as `../skill-canvas/SKILL.md` describes, with a fresh spec in the workspace (start from `../skill-canvas/assets/skill-spec.starter.json`). Set `name` and `description` as soon as you know them.

To change an existing skill, first map it onto the canvas with skill-canvas's "Visualize an existing skill", then continue here from section 3.

At any point the user can edit on the canvas and click **Ready for agent**, or review the files in the **Files** panel. Handle both through skill-canvas's review loop. Write skill files only after an `approve` event.

## 2. Build the design (depends on the mode)

Update the spec as you go, not once at the end, and name what changed on the canvas in one line. Rules for the spec are in `../skill-canvas/references/spec.md`. Keep ids stable, make small edits, keep `summary` to one line and put the rest in `detail`. The design always covers the same ground:

1. **Goal and trigger**: what does the skill do, and when should it fire?
2. **Inputs**: what does it receive? For each, "does this change which steps run?" Yes: `dynamic` with options. No: `data`.
3. **Steps**: one job per step, each with a title, a one-line summary, `dependsOn`, and its inputs and outputs (next point).
4. **Inputs and outputs of every step**: what it `reads` (inputs, or artifacts from steps it waits for) and what it `produces` (at least one artifact, listed in `artifacts` with a path under `workDir` and a format). Add these in the same edit as the step, in every mode. A step is not finished until its inputs and outputs are defined.
5. **Parallelism**: independent steps share `dependsOn` and `parallelGroup`, followed by a **join** step that waits for all of them.
6. **Conditions**: "if X, also do Y" becomes `runWhen` on Y.
7. **Outputs**: what the user gets at the end (`final`, with `artifact` naming the file that holds it), and what plan or checklist builds up along the way (`intermediate`, with conditional `items`).

### Guided mode (default)

The user gives an overall goal. Your job is to find the units of work with them, then suggest the skill.

1. Put the goal, name and description on the canvas.
2. Ask clarifying questions, **one at a time**, aimed at finding the units of work. Good questions uncover: the sources or systems involved, what varies between runs (candidate dynamic inputs), what can happen at the same time, what the user checks or approves along the way, and what the finished output looks like. Stop asking once you can name every step; usually 3 to 6 questions.
3. Add inputs to the canvas as answers reveal them.
4. Propose the full design on the canvas in one pass: steps, parallel groups, joins, conditions and outputs. Give a short list of the units of work and why each is its own step.
5. Move to section 3 so the user can correct it.

### Manual mode

The user specifies the skill to a T. Your job is to transcribe it, not redesign it.

- Draw exactly the steps, order, inputs, conditions and outputs they gave. Use their titles and wording. Do not add, split, merge, rename or reorder steps.
- Only ask a question when the canvas cannot be drawn without the answer (for example a step depends on something never named). One question at a time.
- If you see a problem from the section 3 list, mention it once as a note and leave the design as they wrote it unless they say to change it.
- Inputs and outputs are required. If they did not give a step's `reads`/`produces`, ask for them (this counts as the canvas not being drawable). Other fields they did not specify, such as `detail`, stay empty unless they ask you to fill them in.

### One-shot mode

The user gives an overall goal, ideally with as much detail as they can. Ask **no clarifying questions**.

1. Read the whole request and design the full skill in one pass, covering all seven points above. Prefer the simplest design that meets the goal.
2. Where the request is silent, make a reasonable assumption and keep going. This includes each step's inputs and outputs, which must still be filled in. Record each one in the `detail` of the step it affects, starting with "Assumption:".
3. Show the canvas and list your assumptions in a few bullets so the user can see what you guessed.
4. Skip section 3 and go straight to section 4. The one stop is the yes before writing files (that is approval, not a clarifying question). If the user corrects something at that point, fix the canvas and redraft without asking anything else.

## 3. Check the design with the user

Ask them to flip the toggles on the cards and confirm the canvas branches the way they intend. Look for:

- Any card with a warning. Input/output warnings block Approve, so clear them all.

- A dynamic input that gates no step (it is really a data input, or a step is missing).
- A step doing two jobs (split it).
- Parallel steps that actually depend on each other.
- A join that nothing consumes.
- Steps with no stated output or purpose.

Fix on the canvas first. Do not move on while the user is still correcting it. In manual mode, raise these as notes and change only what the user agrees to.

## 4. Generate the skill

When the user says the design is right, read `references/generating.md` and write one skill per step (each node is its own `SKILL.md`) plus a thin entry skill that runs them in order. Do not collapse the workflow into a single skill. Show the user the drafts before saving them anywhere.
