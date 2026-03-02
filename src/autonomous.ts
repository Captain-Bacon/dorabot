import { getTodayMemoryDir, MEMORIES_DIR, WORKSPACE_DIR, RESEARCH_SKILL_PATH } from './workspace.js';
import { DateTime } from 'luxon';
import type { PulseScheduleConfig } from './config.js';

export const AUTONOMOUS_SCHEDULE_ID = 'autonomy-pulse';

export type PulseMode = 'working' | 'offpeak' | 'overnight';

const INTERVAL_TO_RRULE: Record<string, string> = {
  '15m': 'FREQ=MINUTELY;INTERVAL=15',
  '30m': 'FREQ=MINUTELY;INTERVAL=30',
  '1h': 'FREQ=HOURLY;INTERVAL=1',
  '2h': 'FREQ=HOURLY;INTERVAL=2',
  '4h': 'FREQ=HOURLY;INTERVAL=4',
  '6h': 'FREQ=HOURLY;INTERVAL=6',
  '8h': 'FREQ=HOURLY;INTERVAL=8',
};
export const PULSE_INTERVALS = Object.keys(INTERVAL_TO_RRULE);

export function pulseIntervalToRrule(interval: string): string {
  return INTERVAL_TO_RRULE[interval] || INTERVAL_TO_RRULE['30m'];
}

export function rruleToPulseInterval(rrule: string): string {
  for (const [key, value] of Object.entries(INTERVAL_TO_RRULE)) {
    if (rrule === value) return key;
  }
  return '30m';
}

// Legacy function for backward compatibility
export function detectPulseMode(scheduleConfig?: PulseScheduleConfig, timezone?: string): PulseMode {
  const { mode } = detectCurrentPulseMode(scheduleConfig, timezone);
  return mode as PulseMode;
}

export function detectCurrentPulseMode(scheduleConfig?: PulseScheduleConfig, timezone?: string): { mode: string; config: { interval: string; priorityLevel: string; description?: string; customPrompt?: string } } {
  const tz = timezone || scheduleConfig?.timezone || 'UTC';
  const now = DateTime.now().setZone(tz);
  const hour = now.hour;
  const day = now.weekday; // 1=Mon, 7=Sun

  // If slots are defined, use slot-based detection
  if (scheduleConfig?.slots && scheduleConfig.slots.length > 0) {
    for (const slot of scheduleConfig.slots) {
      if (slot.days.includes(day) && hour >= slot.start && hour < slot.end) {
        const modeConfig = scheduleConfig.modes?.[slot.mode];
        if (modeConfig) {
          return {
            mode: slot.mode,
            config: {
              interval: modeConfig.interval || '30m',
              priorityLevel: modeConfig.priorityLevel || 'full',
              description: modeConfig.description,
              customPrompt: modeConfig.customPrompt,
            },
          };
        }
      }
    }
  }

  // Fall back to legacy hour-based detection
  const workingStart = scheduleConfig?.modes?.working?.hours?.start ?? scheduleConfig?.workingHours?.start ?? 9;
  const workingEnd = scheduleConfig?.modes?.working?.hours?.end ?? scheduleConfig?.workingHours?.end ?? 18;
  const offPeakStart = scheduleConfig?.modes?.offpeak?.hours?.start ?? scheduleConfig?.offPeakHours?.start ?? 18;
  const offPeakEnd = scheduleConfig?.modes?.offpeak?.hours?.end ?? scheduleConfig?.offPeakHours?.end ?? 23;

  let modeName: string;
  if (hour >= workingStart && hour < workingEnd) {
    modeName = 'working';
  } else if (hour >= offPeakStart && hour < offPeakEnd) {
    modeName = 'offpeak';
  } else {
    modeName = 'overnight';
  }

  // Get mode config
  const modeConfig = scheduleConfig?.modes?.[modeName];
  const defaultIntervals = { working: '30m', offpeak: '2h', overnight: '6h' };
  const defaultPriorities = { working: 'full', offpeak: 'reduced', overnight: 'minimal' };

  return {
    mode: modeName,
    config: {
      interval: modeConfig?.interval || defaultIntervals[modeName as keyof typeof defaultIntervals] || '30m',
      priorityLevel: modeConfig?.priorityLevel || defaultPriorities[modeName as keyof typeof defaultPriorities] || 'full',
      description: modeConfig?.description,
      customPrompt: modeConfig?.customPrompt,
    },
  };
}

const PRIORITY_TEMPLATE_FULL = `## Priority (strict order)

1. **Advance running tasks.** Execute the next concrete step. Use the browser, run commands, write code, whatever it takes. Keep tasks_update current.
2. **Verify checking tasks (three-agent pipeline).** For tasks in checking status:

   **Agent B (Code Verifier)**: Spawn a Haiku sub-agent for functional verification. Give it: task result, handoffSummary, files claimed to be changed. Ask it to check:
   - Do the files exist and were they actually modified?
   - Does the code compile/build?
   - Do tests pass (if applicable)?
   - Are the claimed outputs present?
   Return PASS/FAIL with evidence. Agent B does NOT assess plan compliance or goal fit.

   **Agent C (Fit Verifier)**: If Agent B passes, spawn a DIFFERENT Haiku sub-agent for fit verification. Give it: task plan, task result, goal description. Ask it to check:
   - Does the delivery match what the plan promised?
   - Does this move the goal forward?
   - For audit/research/exploration tasks: were follow-up tasks created for recommendations?
   Return PASS/FAIL with specifics. Agent C does NOT re-check functional correctness.

   **Final decision**: If both pass, check verificationType:
   - agent-verified: mark task done
   - human-verified: add verification summary to task.reason, leave in checking for human

   If either fails: move task back to approved with failure reason. A fresh agent will pick up the fix.

3. **Verify checking goals.** Check goals_view(status: "checking") for goals. Read goal description and all completed task results. Assess if intent is met. If clearly met, move to done. If uncertain, add summary to goal.reason and leave in checking.
4. **Act on monitored things.** Check prices, deployments, PRs, tracking pages. Live browser checks, not assumptions. If state changed, act or notify.
5. **Follow up with the owner.** If you asked something and they answered (check journal), incorporate it. If they haven't and it's been a while, nudge on an available channel.
6. **Handle blockers.** AskUserQuestion timeout? Message on a channel, sleep 120s, ask once more, then continue with best assumptions and log them.
7. **Research or prepare.** If a task needs info, go get it. Store findings via research_add/research_update. Check research_view first to avoid duplicating.
8. **Get to know the owner.** If USER.md is mostly empty, use the onboard skill. One concise question per pulse via AskUserQuestion.
9. **Engage the owner.** Nudge them about goals and tasks. Remind them what's pending approval, what's blocked, and what's next. Use media to make it stick: generate a meme (meme skill with memegen.link) or an image tied to their current work, attach with media param. Always include a concrete next step or question.
10. **Propose new goals/tasks.** Notice something worth doing? goals_add or tasks_add.
11. **Create momentum.** Break large tasks into smaller follow-up tasks and queue them.
12. **Close momentum chains.** Check done audit/research/exploration tasks: if their results mention recommendations, next steps, or findings, verify that follow-up tasks exist. If not, create them. A chain of "found problem -> no task to fix it" is a leak.
13. **Spot gaps and opportunities.** You have a third-party perspective the owner doesn't. If you notice something that would improve the dorabot ecosystem (UI polish, missing functionality, backend improvements, UX friction, useful integrations, or anything else), raise it. Create a goal in developing mode, send a message explaining what you spotted and why it matters. The owner gets blinkered. You see fresh each pulse. Use that.

Do at least one meaningful action every pulse. Do not end without a concrete next action.`;

const PRIORITY_TEMPLATE_REDUCED = `## Priority (strict order)

1. **Advance running tasks.** Execute the next concrete step. Keep tasks_update current.
2. **Verify checking tasks (three-agent pipeline).** Spawn Agent B (Haiku) for code checks, then Agent C (Haiku) for fit checks. If both pass and verificationType is agent: mark done. If human: add summary and leave in checking. If either fails: move to approved with reason.
3. **Verify checking goals.** Assess if intent is met. Move to done or leave with summary.
4. **Act on monitored things.** Check critical items (deployments, breaking changes). Live browser checks if needed.
5. **Follow up with the owner.** If you asked something and they answered (check journal), incorporate it.
6. **Handle blockers.** Critical blockers only. Document non-urgent issues for working hours.
7. **Research or prepare.** If a task needs info, gather it. Store via research_add/research_update.

Off-peak mode: focus on advancing existing work. Avoid new proposals unless genuinely urgent.`;

const PRIORITY_TEMPLATE_MINIMAL = `## Priority (strict order)

1. **Advance approved tasks.** If tasks are approved and ready (tasks_view filter: 'approved'), execute them.
2. **Monitor critical items.** Check for failures, breaking changes, or urgent issues that can't wait.
3. **Handle emergencies.** Respond to critical blockers or urgent owner messages only.

Overnight mode: minimal activity. Most work waits for working hours. No engagement, no proposals, no new goals.`;

export function getBuiltInTemplates() {
  return {
    full: PRIORITY_TEMPLATE_FULL,
    reduced: PRIORITY_TEMPLATE_REDUCED,
    minimal: PRIORITY_TEMPLATE_MINIMAL,
  };
}

export function buildAutonomousPrompt(timezone?: string, scheduleConfig?: PulseScheduleConfig): string {
  const todayDir = getTodayMemoryDir(timezone);
  const { mode, config: modeConfig } = detectCurrentPulseMode(scheduleConfig, timezone);

  const baseBootstrap = `Autonomous pulse (${mode} mode). Fresh session. Memory files are your only continuity.

## Bootstrap

1. Read ${todayDir}/MEMORY.md if it exists (what you've already done today).
2. Check goals and tasks (goals_view, tasks_view).
3. If creating research output, check ${RESEARCH_SKILL_PATH} first.`;

  let priorities: string;

  // Use custom prompt if available, otherwise use template based on priorityLevel
  if (modeConfig.customPrompt) {
    priorities = modeConfig.customPrompt;
  } else {
    switch (modeConfig.priorityLevel) {
      case 'full':
        priorities = PRIORITY_TEMPLATE_FULL;
        break;
      case 'reduced':
        priorities = PRIORITY_TEMPLATE_REDUCED;
        break;
      case 'minimal':
        priorities = PRIORITY_TEMPLATE_MINIMAL;
        break;
      default:
        priorities = PRIORITY_TEMPLATE_FULL;
    }
  }

  const afterActing = `

## After acting

- Log to ${todayDir}/MEMORY.md with timestamp.
- Real findings → research_add (not memory files). Include source links.
- Stable facts changed → update ${WORKSPACE_DIR}/MEMORY.md.
- Created/updated goals, tasks, or research → message the owner (what changed, why, suggested next action).
- Urgent → message them.`;

  const boundaries = modeConfig.priorityLevel === 'minimal'
    ? `

## Boundaries

${mode} mode: most things can wait. "Nothing to act on" is normal and expected. Only act on genuine emergencies or approved tasks.`
    : `

## Boundaries

Stay focused. Before declaring "nothing to act on", verify: goals checked, tasks checked, monitoring checked, follow-ups checked, new tasks considered. Log why none were actionable. "Nothing to act on" should be rare.`;

  return baseBootstrap + '\n\n' + priorities + afterActing + boundaries;
}

export function buildAutonomousCalendarItem(timezone?: string, interval?: string, scheduleConfig?: PulseScheduleConfig) {
  const { mode, config: modeConfig } = detectCurrentPulseMode(scheduleConfig, timezone);

  // If no explicit interval provided, use current mode's interval
  const effectiveInterval = interval || modeConfig.interval;

  return {
    type: 'event' as const,
    summary: `Autonomy pulse (${mode})`,
    description: modeConfig.description || 'Periodic autonomy pulse',
    dtstart: new Date().toISOString(),
    rrule: pulseIntervalToRrule(effectiveInterval),
    timezone,
    message: buildAutonomousPrompt(timezone, scheduleConfig),
    session: 'main' as const,
    enabled: true,
    deleteAfterRun: false,
  };
}
