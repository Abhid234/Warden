---
name: warden-development
description: Development guidance for the Warden hackathon project. Use when planning, implementing, debugging, testing, or reviewing Warden code.
---

# Warden Development

## Project context

Warden is an AI wellbeing layer between users and online communities.

Its purpose is to give users control over the content they encounter by analyzing
online content before or as it is rendered.

Potential core capabilities include:

- Toxicity and harassment filtering
- NSFW content filtering
- Semantic filtering based on user-defined topics or preferences
- Pre-post toxicity checking with optional rephrasing

The feature set may change during development based on time and feasibility.

## Development principles

- Prioritize a working end-to-end implementation.
- Prefer simple and reliable solutions over unnecessary complexity.
- Inspect the existing codebase before making changes.
- Reuse existing components and utilities where appropriate.
- Keep components modular and easy for teammates to understand.
- Avoid unnecessary dependencies.
- Do not make major architectural changes without discussing the tradeoffs first.

## Machine learning

- Prefer open-source pretrained models that can be fine-tuned using our own data.
- If time permits, experiment with training lightweight models ourselves.
- The majority of intelligent filtering functionality should come from models
  trained or fine-tuned by the team.
- Do not make commercial LLM APIs the primary implementation of the filtering system.
- Keep model selection flexible until models have been evaluated.
- Consider accuracy, false positives, false negatives, latency, model size,
  resource requirements, and licensing.
- Never fabricate evaluation results or performance metrics.

## ML workflow

For every ML component:

1. Define the task.
2. Define the expected inputs and outputs.
3. Establish a baseline.
4. Prepare and validate the dataset.
5. Train or fine-tune the model.
6. Evaluate the model.
7. Test representative failure cases.
8. Integrate inference into the application.
9. Measure practical inference performance.

Keep training and inference code separate.

Where practical, record:

- Dataset version
- Preprocessing decisions
- Training configuration
- Evaluation metrics
- Model version

## Browser extension

The browser extension is a primary delivery mechanism for Warden.

When working on extension functionality:

- Account for dynamically loaded content.
- Avoid unnecessary coupling to a website's DOM structure.
- Keep filtering responsive.
- Fail safely when inference is unavailable.
- Avoid unnecessary external requests.
- Keep content extraction, inference, and rendering behavior separated.

## Backend

When working on the backend:

- Keep API responsibilities clear.
- Keep model logic separate from API concerns.
- Validate inputs.
- Handle inference failures gracefully.
- Use clear request and response structures.
- Keep development configuration reproducible.
- Avoid storing user content unless required by a clearly defined feature.

## Code quality

- Prefer readable code over clever code.
- Follow existing repository conventions.
- Make focused changes.
- Avoid rewriting unrelated code.
- Fix root causes rather than masking bugs.
- Test changes when practical.
- Do not invent APIs, datasets, metrics, or implementation results.

## Hackathon priorities

Prioritize:

1. Working end-to-end demo
2. Strong ML implementation
3. Reliable live content filtering
4. Measured evaluation
5. Good user experience
6. Additional features and polish

A small number of reliable features is better than many incomplete features.

## Before implementation

Before starting a substantial task:

- Inspect the relevant repository structure.
- Identify existing code that can be reused.
- Determine the simplest viable implementation.
- Identify important technical uncertainties.
- Ask for clarification when a major decision cannot reasonably be inferred.

## Collaboration

Write code so another teammate can understand and continue the work.

When making an important architectural or ML decision:

- Explain the decision briefly.
- Record meaningful tradeoffs.
- Avoid silently changing established decisions.

Always follow the CYHI requirements in the repository's `AGENTS.md`.