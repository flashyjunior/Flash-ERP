# SMS Style And Quality Bar

## Core rule

Flash ERP should look and feel like a sister product to SMS.

That means Flash ERP should preserve the same family of:

- shell layout patterns
- workspace composition
- card surfaces
- grid and dialog behavior
- action density
- backend layering discipline

## UI conventions to preserve

- dark navigation rail with branded accents
- strong workspace headings and eyebrow labels
- rounded cards and soft gradient panel surfaces
- tabbed workspaces for dense operational modules
- focused action dialogs instead of pushing every action into separate pages
- data-grid-heavy management views with search and column controls
- practical badges, metrics, hints, and empty states

## What must change for Flash ERP

- replace school language with retail language
- design for store operations, not school administration
- ensure the store desktop app carries the same visual rhythm as the web shell
- make disconnected states and sync posture visible in the UI

## Backend conventions to preserve

- `*.validation.ts` for payload and input normalization
- `*.service.ts` for use-case orchestration and error translation
- repositories and integrations kept explicit
- route handlers kept thin and readable

## Quality bar

Flash ERP should match SMS in polish and exceed it in:

- consistency across apps
- keyboard-heavy POS ergonomics
- offline state clarity
- conflict and sync posture visibility
- retail-first terminology and workflow design
