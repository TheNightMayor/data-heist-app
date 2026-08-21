# Dynamic Hacking

Reference notes for the Dynamic mode implementation. These are paraphrased summaries of the Starfinder 1e rules, not replacement rule text.

## Official reference

- [AONSRD Dynamic Hacking](https://www.aonsrd.com/Rules.aspx?ID=1888)
- Source: Starfinder Tech Revolution, pages 70–73

Dynamic Hacking is a multi-phase subsystem for interactive computer-infiltration encounters. It is separate from the Basic mode's single Computers check approach.

## Core rules

- A hacking encounter uses phases. Hackers act first; automated computer defenses resolve afterward.
- Computers is divided into three encounter subskills: Deceive, Hack, and Process.
- A digital persona has Connection Points (CP), with maximum CP equal to `12 + 2 x Computers ranks`.
- CP loss applies escalating penalties to persona subskills. At 0 CP, the persona disintegrates and the hacker is ejected.
- At encounter start, the hacker configures circumstance modifiers between -3 and +3 across the three subskills. Their total is limited by Computers ranks divided by 3, or by the associated computer's tier when applicable.
- A lead hacker can take one major and one minor action per phase.
- A support hacker takes one minor action per phase and is linked to a lead hacker's persona.
- A lead hacker can take up to three additional major actions, with a cumulative -5 penalty per additional action.
- A support hacker can take a major action instead of a minor action by spending 1 Resolve Point.

## Hacking objectives

Objectives are divided into three official categories:

- **Nodes** provide branches and access to objectives farther into the computer. In the app, the current `access` label represents this category.
- **Modules** are valuable objectives, such as data or control programs, and are typically the reason for hacking in the first place. In the app, accessing a Module produces the reward for the RPG session in both Basic and Dynamic modes; a Module is not a separate generic reward category.
- **Countermeasures** create risks such as alarms, viruses, and counterhackers.

Objective statistics can include a base DC, Resolve entries, Support options, a Countdown, Success effects, and Special effects. Resolve entries can require different subskills, DC adjustments, and multiple successes. The app's `successesRequired` field is its shorthand for the number of Resolve successes needed; a default of one success is an app convention, not a universal rule.

## Common actions

- **Aid:** A minor action that assists a lead hacker's upcoming action. The bonus is normally +2 and can rise to +3 or +4 for stronger results.
- **Assess:** A minor Process action that reveals an objective's Resolve, Support, Countdown, Success, and Special information, and can reveal hidden countermeasures.
- **Blend:** A major Deceive action that increases objective countdowns.
- **Decoy:** A major Deceive action that creates a disposable alternate persona target for many countermeasure effects.
- **Modify:** A major action used to alter, delete, forge, or install programs; the skill and DC depend on the task.
- **Recalibrate:** A major Process action that reassigns the persona's configured subskill modifiers.
- **Repair:** A major Process action that restores lost persona CP.
- **Resolve:** In Dynamic mode, this major action advances an objective by one success, or two successes when the relevant result exceeds the DC by 10 or more and the objective supports multi-success progress. Completing a Module objective is what produces its session reward; Basic mode uses the simpler Computers-check flow.

## Encounter timing and scaling

- Most dynamic encounters begin with multiple objectives and can reveal additional objectives as Nodes are resolved.
- A Countdown decreases at the end of each hacking phase and triggers its specified effect at 0.
- Short encounters generally require about 5–7 successful checks for their main objectives; longer encounters may require 10–15.
- Additional lead hackers and support hackers increase encounter difficulty through additional countermeasures or required successes.
- An encounter may end when root access is secured, all countermeasures are resolved, or the hackers otherwise lose access.

## App implementation notes

- Keep Dynamic-only fields and actions separate from Basic mode behavior.
- The existing `hackingMode`, Deceive/Hack/Process modifiers, CP fields, lead/support roles, Aid, and multi-success Resolve behavior correspond to this subsystem.
- Dynamic Mode needs objective-specific Success and Special effects; a generic failure-count or universal countdown rule is insufficient.
- Official Modules and the app's session rewards are the same objective concept in both hacking modes. The full Dynamic rules resolve Modules through objective-specific Resolve entries, but this companion's current flow uses checks on access and countermeasure nodes; once a Module is reachable, the party selects it to collect the reward. The app's `FlowNode` remains the generic graph object, while `access` is the local label for the official Node objective.
- The sample objectives on Tech Revolution page 73 are useful implementation fixtures, especially Basic Node, Fake Shell Node, Root Access, Secure Data, Basic Counterhacker, and Wipe.
