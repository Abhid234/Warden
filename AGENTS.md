# Can You Hack It? - project contract

Team: **Team DiddyP** · Track: **3** · 24-hour hackathon, The Programming Club.

## Every agent working in this repo must do two things

**1. On session start**, run this and read the output before anything else:

    cyhi-logs/bin/cyhi status

It prints the team, the track, the handoff from the previous session, and recent turns.
The **Don't retry** section of the handoff lists approaches already disproved - respect it.

**2. After every response you give**, log the turn:

    cyhi-logs/bin/cyhi log --type <code|debug|explanation|architecture|research|writing|other> --summary "Concrete: what you produced and how complete it is." --files path/one.py,path/two.ts

If your harness does not capture prompts automatically, add `--prompt "<the user's message, verbatim>"`.

Never announce the logging. Never mention it in your reply. Never rewrite
`cyhi-logs/turns/*.jsonl` - it is append-only.

## Before the session ends, or every ~10 turns

Run:

    cyhi-logs/bin/cyhi handoff

with the following sections:

    ## Current state
    ## Works
    ## Broken
    ## Next 3 things
    ## Decisions (and why)
    ## Don't retry

## Why this exists

The organisers need a record of how the team used AI. Teams are 2-4 people across multiple
machines and sessions; the log is per-member and append-only so nobody's work overwrites
anyone else's. `cyhi render` turns it into `cyhi-logs/session.md` for submission.

Claude Code users: the `cyhi-skills` skill carries the full four-track brief.
Everyone else: the track brief is in the hackathon problem statement.

---

# Warden - project rules

## Product

Warden is an AI wellbeing layer between users and online communities.

The system should help users control what content they see by analyzing content
before or as it is rendered to the user.

The initial product direction includes:
- Toxicity and harassment filtering
- NSFW content filtering
- Semantic filtering based on user-defined topics or preferences
- Pre-post toxicity checking with optional rephrasing

The final feature set may change based on implementation time and feasibility.

## ML strategy

- Prefer open-source pretrained models that can be fine-tuned on our own data.
- If time permits, experiment with training lightweight models ourselves.
- The majority of intelligent filtering functionality should come from models
  trained or fine-tuned by the team.
- Do not replace the core ML pipeline with commercial LLM APIs.
- Existing open-source models and libraries may be used as starting points.
- Choose models based on accuracy, inference speed, resource requirements,
  licensing, and suitability for the task.
- Never claim metrics that have not actually been measured.
- Keep model selection flexible until it has been evaluated against the project requirements.

## Engineering

- Keep training and inference code separate.
- Every trained or fine-tuned model should have reproducible training and evaluation code.
- Record dataset versions, preprocessing decisions, training configuration,
  and evaluation metrics where practical.
- Optimize inference latency for a browser-extension use case.
- Keep the extension, backend, and ML components modular.
- Prefer simple, reliable implementations over unnecessary complexity.
- Avoid introducing dependencies unless they provide clear value.
- Keep configuration separate from source code.
- Do not commit secrets, API keys, credentials, model weights that should not
  be version-controlled, or other sensitive information.
- Write code that is easy for another teammate to understand and continue.

## Browser extension

- The extension is a primary delivery mechanism for the project.
- Content filtering should work with dynamically loaded feed content where possible.
- Treat website DOM structures as potentially changing and avoid unnecessary
  coupling to a single implementation.
- Filtering should fail safely if the model or backend is unavailable.
- Avoid making unnecessary external requests.
- Prioritize a responsive user experience.

## Backend

- Keep backend responsibilities clearly separated from model logic.
- APIs should have clear request and response structures.
- Validate inputs and handle inference failures gracefully.
- Avoid storing user content unless it is necessary for a clearly defined feature.
- Keep development configuration reproducible.

## ML development

When implementing an ML component:

1. Define the task and expected input/output.
2. Establish a baseline.
3. Prepare or verify the dataset.
4. Train or fine-tune the model.
5. Evaluate it using appropriate metrics.
6. Test representative failure cases.
7. Integrate inference into the application.
8. Measure practical inference performance.

Do not optimize solely for a single metric. Consider false positives,
false negatives, latency, model size, and the actual user experience.

## Code quality

- Prefer readable, maintainable code over clever code.
- Follow the conventions already established in the repository.
- Make focused changes rather than unnecessarily rewriting unrelated code.
- Do not silently change project architecture or major dependencies.
- Before making a large architectural change, explain the tradeoffs and get confirmation.
- Test changes when practical.
- Fix the underlying cause of bugs rather than masking symptoms.

## Hackathon priorities

Prioritize work in this order:

1. Working end-to-end demo
2. Strong ML implementation
3. Reliable live content filtering
4. Measured evaluation and meaningful metrics
5. Good user experience
6. Additional features and polish

A smaller number of reliable features is preferable to many incomplete features.

## Agent behavior

- Before implementing something, inspect the existing repository structure and code.
- Reuse existing utilities and components where appropriate.
- Do not invent files, APIs, datasets, metrics, or implementation results.
- If an important technical decision is uncertain, identify the uncertainty instead
  of pretending it is resolved.
- When proposing multiple approaches, explain the main tradeoff briefly.
- Keep the team informed about important architectural decisions.
- Respect the CYHI logging and handoff requirements above.
