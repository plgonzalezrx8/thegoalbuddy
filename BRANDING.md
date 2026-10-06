# thegoalbuddy · Constellation Observatory

A local observatory for long coding runs. The goal is the destination; tasks are observations along the path. The interface should make the current position, decisions, and evidence easy to find.

## Identity

Use the exact lowercase wordmark **thegoalbuddy**. Use the generated `constellation-star.png` for the mark, with the wordmark as text. The observatory sky is decorative, never a source of status or information. Preserve upstream attribution and MIT copyright. Historical upstream release art is archival material, not current branding.

## Visual tokens

| Token | Value | Purpose |
| --- | --- | --- |
| Ink | `#040d15` | Main background |
| Panel | `#0b1823` | Details and supporting surfaces |
| Ivory | `#f6f1e5` | Main text, destination headings |
| Muted | `#b0bec7` | Supporting text |
| Line | `#334957` | Borders and separation |
| Sky | `#94d5ff` | Current work, focus, links |
| Jade | `#acf0a4` | Completed work |
| Amber | `#ffc16c` | Blockers and required decisions |

Use self-hosted **Libre Caslon Display** at weight 400 for display headings and **DM Sans** for controls, labels, and body text. Use a system monospace stack for code, timestamps, and file paths. Both font families are licensed under the SIL Open Font License; include their licenses with distributed font files.

## Status and evidence

Every state needs a text label as well as color: In progress, Completed, Blocked, or Pending. A completed task is not proof that the whole goal is complete. Surface the actual receipt and verification evidence; never invent a successful check or label an unverified artifact “verified”. Decorative glow must not hide status text or obscure keyboard focus.

## Layout and language

Lead with the goal, its completion criteria, current task, next step, and blockers. Keep details readable on opaque or darkened surfaces. On narrow screens, show active work and attention before the rest of the constellation. Expose a conventional task overview for scanning larger goals.

Explain **Start, Resume, Unblock** before internal terms such as oracle, receipt, Scout, Judge, and Worker. The browser is a local read-only viewer; coding-tool execution happens in Codex or Claude Code. Use copy buttons only for copying commands, with success shown only after the clipboard operation succeeds. Respect reduced motion, visible keyboard focus, and semantic headings.

## Assets

The board's canonical assets live in `goalbuddy/surfaces/local-goal-board/assets/`. The marketing site carries copies of the generated sky and star, self-hosted fonts, and an actual example board screenshot. Keep marketing screenshots labelled as examples and update them when the shipped interface changes. No customer endorsements or third-party logo claims without verified permission and evidence.
