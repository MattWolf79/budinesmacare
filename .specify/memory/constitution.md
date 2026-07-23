<!--
Sync Impact Report
- Version change: template -> 1.0.0
- Modified principles:
	- Template Principle 1 -> I. Tenant Isolation and Data Safety
	- Template Principle 2 -> II. Contract-First Database and API Changes
	- Template Principle 3 -> III. Verification Gates Before Merge
	- Template Principle 4 -> IV. Responsive and Role-Aware UX Consistency
	- Template Principle 5 -> V. Idempotent Operations and Recoverability
- Added sections:
	- Technical Standards
	- Delivery Workflow and Quality Gates
- Removed sections:
	- None
- Templates requiring updates:
	- ✅ reviewed (no changes required): .specify/templates/plan-template.md
	- ✅ reviewed (no changes required): .specify/templates/spec-template.md
	- ✅ reviewed (no changes required): .specify/templates/tasks-template.md
- Follow-up TODOs:
	- None
-->

# Turnos App Constitution

## Core Principles

### I. Tenant Isolation and Data Safety
All changes that read, write, or expose business data MUST preserve strict company
isolation. Queries, RPC calls, and UI state resolution MUST scope by the active
company context and role permissions, and MUST NOT leak records across companies or
roles. Rationale: the platform is multi-tenant and role-based; accidental cross-tenant
access is a critical business and security failure.

### II. Contract-First Database and API Changes
Any change that affects SQL functions, RPC payloads, or frontend data contracts MUST
document input/output expectations before implementation and MUST keep backward
compatibility unless a breaking change is explicitly approved. When breaking changes
are unavoidable, migration and compatibility notes MUST be included in the feature
spec and plan artifacts. Rationale: frontend behavior in this project depends heavily
on Supabase RPC contracts and schema assumptions.

### III. Verification Gates Before Merge
Every change MUST pass relevant validation gates before merge: static checks for
modified files, successful production build, and targeted runtime verification of the
changed user flow. For data-layer changes, scripts MUST be re-runnable in non-clean
environments or include explicit one-time execution constraints. Rationale: most
regressions in this codebase come from UI/data contract drift and migration re-runs.

### IV. Responsive and Role-Aware UX Consistency
User-visible changes MUST preserve consistent behavior across desktop and mobile
breakpoints and MUST respect role-specific visibility and actions. Any UI adjustment
MUST define expected behavior for at least admin, employee, and client contexts when
applicable. Rationale: this product serves distinct roles and has frequent responsive
layout requirements.

### V. Idempotent Operations and Recoverability
Operational scripts and setup tasks MUST be idempotent where feasible, especially for
database migrations, seed-like writes, and index/function creation. If full idempotency
is not practical, scripts MUST fail safely with clear remediation steps. Rationale:
environments are often patched incrementally and must tolerate controlled re-execution.

## Technical Standards

- Frontend changes MUST follow existing React component structure and avoid unrelated
	visual rewrites.
- CSS updates MUST be scoped to the affected workspace and breakpoint rules to avoid
	regressions in unrelated roles.
- SQL changes MUST include deterministic conflict handling when uniqueness or
	de-duplication is involved.
- New external dependencies SHOULD be avoided unless they materially reduce complexity
	or risk; justification MUST be recorded in plan.md when added.

## Delivery Workflow and Quality Gates

- Work MUST start from a feature spec produced by /speckit.specify (or an equivalent
	approved artifact), then proceed through /speckit.plan and /speckit.tasks.
- Constitution Check in plan.md MUST explicitly map affected principles and expected
	verification evidence.
- Tasks MUST be grouped by independently testable user stories and include precise file
	paths for implementation work.
- Before implementation completion, teams SHOULD run /speckit.analyze or an equivalent
	consistency review when changes span spec, plan, and tasks.
- For urgent hotfixes, abbreviated planning is allowed only if post-fix artifacts are
	backfilled in the same branch before merge.

## Governance

This constitution is the highest-level engineering policy for this repository.
Spec, plan, and task artifacts MUST comply with these principles.

Amendment procedure:
- Propose amendments through /speckit.constitution with rationale and impact summary.
- Record version bump type using semantic versioning rules below.
- Re-validate affected templates and prompt/agent guidance artifacts before adoption.

Versioning policy:
- MAJOR: Backward-incompatible governance changes or principle removals/redefinitions.
- MINOR: New principle or materially expanded mandatory guidance.
- PATCH: Clarifications, wording improvements, or non-semantic refinements.

Compliance review expectations:
- Every plan artifact MUST include a constitution alignment check.
- Reviews MUST block merges when a MUST-level principle is violated without approved
	exception.
- Exceptions MUST include scope, rationale, owner, and expiration criteria.

**Version**: 1.0.0 | **Ratified**: 2026-07-23 | **Last Amended**: 2026-07-23
