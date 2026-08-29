# Countermeasures

Reference notes for the Basic mode implementation. These are paraphrased summaries of the Starfinder 1e rules, not replacement rule text.

## Official reference

- [AONSRD Computer Modules, Upgrades, and Countermeasures](https://www.aonsrd.com/ComputerMods.aspx?ItemName=All&Family=None)
- [AONSRD Computers](https://www.aonsrd.com/Computers.aspx)
- Source: Starfinder Core Rulebook, page 215

## Computer-system rules

These notes come from the Computers page and provide the rules context for the map model.

- Computer tier ranges from 1 to 10.
- The base Computers DC is `13 + 4 x tier`; installed modules and countermeasures can modify it.
- The Security upgrade increases the hacking DC: Security I +1, Security II +2, Security III +3, and Security IV +4. A computer cannot benefit from more than one Security upgrade.
- A computer can expose ordinary access separately from root access.
- Root access grants control of all functions and modules, including secured data and countermeasure settings.
- A physical security key and a password can each grant a `+5` hacking bonus when available.
- Modules describe capabilities beyond basic computer functions. Relevant module families include control, secure data, spell chips, and upgrades.
- Countermeasures are actions triggered by unauthorized access attempts. Some trigger only on a failed hack; others trigger on any access attempt.
- A computer can have at most as many countermeasures as its tier.
- A connected computer or interface may expose only the functions it was granted; hacking a lower-tier interface does not automatically grant access to the higher-tier system behind it.

App implications:

- `tier` and the current DC formula match the base rule. Security is not modeled as a map-wide statistic; individual countermeasures or objectives can carry their own DC modifiers.
- A `FlowNode` is the app's generic graph object. The official objective category called a Node is represented by the app's `access` category.
- The app's `module` category represents the official Module objective and the reward obtained during the RPG session in both Basic and Dynamic modes. In this companion's current flow, checks occur on access and countermeasure nodes; once a Module is reachable, selecting it collects the reward. The full Dynamic rules may instead give a Module its own Resolve entries and multiple required successes.
- Countermeasure triggers should be attached to access attempts and failures, not assumed to happen at phase end.
- Future map validation can enforce a countermeasure count no greater than the computer tier.

Countermeasures generally activate when an unauthorized access attempt fails. The rules do not require every countermeasure to use a turn countdown. A duration or countdown should be modeled only when the selected countermeasure calls for one.

## Countermeasures in the app

### Wipe

Deletes specified data after failed access attempts, usually after two or more failures. Deleted data is recoverable with time and a Computers check unless the physical storage is destroyed.

Current app interpretation:

- Tracks failures on the countermeasure node.
- Triggers after three failures or a natural 1.
- Conceals configured target nodes and shows the wipe transition.

Open decisions:

- Whether the trigger should be two failures, three failures, or map-configurable.
- Whether concealed nodes can be recovered and how recovery works.
- Whether a natural 1 should trigger Wipe independently of the failure threshold.

### Feedback

A failure by 5 or more infects the device used for the attempt, imposing a temporary penalty on checks involving that equipment. The rules also allow the GM to substitute another virus effect.

Potential Basic-mode interpretation:

- A hacking attempt on any node that fails by 5 or more activates Feedback.
- Apply one global -5 penalty to every player's later hacking checks.
- Keep the penalty active until the Feedback countermeasure is successfully hacked.
- Clear the penalty for the whole party when that countermeasure is hacked.
- Display the penalty activation and clearing in the game log and active-player panel.

Decisions:

- Multiple Feedback countermeasures do not stack; the party has one global -5 penalty.

### Fake Shell

Shows a convincing but false network and directory containing nonfunctional controls and junk data. A separate Computers check at the system DC plus 5 can expose the deception.

Potential Basic-mode interpretation:

- Mark a node as a decoy after a failed access attempt.
- Require a detection check before the node can provide real progress.
- Keep the decoy state visible to the GM and represented clearly to players.

### Alarm

Sends an alert or activates a connected alarm after an attempted breach. It can also activate connected robots, traps, or weapons when the computer controls them.

Potential Basic-mode interpretation:

- Add an alarm event to the log.
- Optionally escalate the map state or reveal a configured consequence.
- Keep the consequence configurable rather than assuming combat rules.

Current app interpretation:

- The second and later global failed hacking attempts activate every unresolved Alarm and record their countermeasure IDs.
- A successfully hacked Alarm stays disabled during ordinary failures; only a global Lockout can reactivate it.
- An `ALARM ACTIVE` warning flashes in the game header while any Alarm remains active.
- Successfully completing the Alarm countermeasure disables its warning.
- No outside-the-app combat, robot, trap, or weapon consequence is modeled.

### Lockout

After three failed attempts, makes the entire system inaccessible and ends the encounter in a total failure. Physical access bypass and countdowns are not modeled.

Current app interpretation:

- Track failed attempts separately from ordinary node failures.
- Lock every node and end the encounter as a loss when the map-wide failure threshold is reached. The threshold is chosen in map creation and defaults to three failed attempts.

This is the countermeasure most likely to use a countdown, but countdowns are not universal.

### Shock Grid

On a failed access attempt, nearby creatures must save or become stunned. A lethal setting also deals electricity damage, with a save for half damage. The DC and damage depend on the grid rank.

Current app interpretation:

- Only one Shock Grid is allowed per map, with an explicitly configured rank from 1 to 5.
- The first global failure prompts every player for a Fortitude save; a failed save stuns that player until their next turn.
- The second and later global failures prompt every player for a Reflex save; a failed save reports the rank-based damage without reducing CP.
- Save modifiers are entered temporarily in the dice-roll modal.

### Firewall

Partitions selected modules behind an additional security layer. Accessing a protected module requires another Computers check, usually at the original system DC plus 2.

Current app interpretation:

- Available as a countermeasure type in the map builder.
- Use `targetNodeIds` to identify the protected modules.
- Protected targets are concealed and unreachable until the Firewall node is completed, even when an alternate graph path exists. Completing the Firewall node is the additional Computers check at the system DC plus 2.
- Multiple Firewalls may protect different modules. A module targeted by more than one Firewall is flagged as a builder warning.

## Official countermeasure not currently modeled

### None currently listed

The app now models all seven computer countermeasures listed on the AONSRD reference page.

## Implementation notes

Countermeasure state will likely need more than a single optional countdown. Candidate fields include:

- `countermeasureType`
- `failureCount`
- `triggerThreshold`
- `active`
- `duration` or `expiresAt`
- `targetNodeIds`
- `rank`
- `mode` or effect parameters

The reducer should apply countermeasure effects from the failed resolve event, while phase-end logic should only advance effects that explicitly have a duration or countdown.

## Terminology decision

The app uses `FlowNode` for every object in the graph, while the rules use **Node** for one specific objective category. To avoid confusion:

- `access` is the app label for the official Node objective.
- `module` is the official Module objective and the app's session reward, obtained when the objective is resolved.
- `countermeasure` remains the defensive objective category.
- Do not add a separate `reward` category just to represent Module rewards.

The app is a session companion: it should track the Module reward and its in-session effects in either hacking mode, rather than inventing a separate generic reward category.
