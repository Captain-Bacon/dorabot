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
      if (!slot.days.includes(day)) continue;
      // Handle wrap-around (e.g., start=23, end=7 means 23:00-07:00)
      const inRange = slot.start <= slot.end
        ? (hour >= slot.start && hour < slot.end)
        : (hour >= slot.start || hour < slot.end);
      if (inRange) {
        const modeConfig = scheduleConfig.modes?.[slot.mode];
        if (modeConfig) {
          return {
            mode: slot.mode,
            config: {
              interval: slot.interval || modeConfig.interval || '30m',
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

  // Get mode config (legacy: interval stored in mode config)
  const modeConfig = scheduleConfig?.modes?.[modeName];
  const defaultIntervals = { working: '30m', offpeak: '2h', overnight: '6h' };
  const defaultPriorities = { working: 'full', offpeak: 'reduced', overnight: 'minimal' };

  return {
    mode: modeName,
    config: {
      interval: modeConfig?.interval || defaultIntervals[modeName as keyof typeof defaultIntervals] || '30m',  // legacy fallback
      priorityLevel: modeConfig?.priorityLevel || defaultPriorities[modeName as keyof typeof defaultPriorities] || 'full',
      description: modeConfig?.description,
      customPrompt: modeConfig?.customPrompt,
    },
  };
}

const PRIORITY_TEMPLATE_FULL = `## Context budget

Each pulse has a limited context window. Do ONE substantive thing well, not many things badly. Blowing the context window causes silent failures, lost messages, and broken sessions. Depth on one item beats breadth across many. After completing your one thing, journal and finish. The next pulse picks up the rest.

## Priority (strict order, ONE item per pulse)

Walk the list top to bottom. Do the FIRST thing that applies, then stop.

1. **Execute ONE task.** If a task is running, advance it. If none running but tasks are approved (tasks_view filter: 'approved'), pick the highest-priority one and start it. Execute ONE task, hand off with tasks_done, then journal and stop. Do NOT start a second task.
2. **Verify ONE checking task (sequential pulse verification).** Pick the oldest checking task. Do ONE verification step:

   Read the task's logs (tasks_view with includeLogs: true) to see what verification has been done:

   **If no "code_verified" or "code_verified_fail" log entry**, do code verification:
   - Check: Do claimed files exist? Does the code compile/build? Do tests pass?
   - Log: tasks_update with reason "CODE_VERIFY: PASS - [evidence]" or "CODE_VERIFY: FAIL - [evidence]"
   - Stop here. Next pulse does fit verification.

   **If code passed but no "fit_verified" or "fit_verified_fail" log entry**, do fit verification:
   - Check: Does delivery match the plan? Does this move the goal forward?
   - Log: tasks_update with reason "FIT_VERIFY: PASS - [evidence]" or "FIT_VERIFY: FAIL - [evidence]"
   - Apply final decision: agent-verified = mark done, human-verified = leave for human.

   **If code verification failed**, move task back to approved with failure reason.

   ONE task, ONE verification step. Journal and stop.

3. **Verify ONE checking goal.** Pick one. Read goal description and completed task results. If clearly met, move to done. If uncertain, add summary to goal.reason and leave in checking. Journal and stop.
4. **Lightweight actions (can combine if small).** These are quick, low-context actions. Do what applies, but stop if context is getting heavy:
   - Act on monitored things (live browser checks, not assumptions)
   - Follow up with the owner (check journal for unanswered questions)
   - Handle blockers (message on a channel if AskUserQuestion timed out)
   - Research or prepare (store via research_add, check research_view first)
5. **Engagement (only if nothing above applied).** Pick ONE:
   - Nudge the owner about pending approvals or blocked items
   - Propose a new goal or task
   - Close a momentum chain (check done tasks for missing follow-ups)
   - Spot a gap or opportunity

One meaningful action per pulse. Journal what you did. The next pulse handles the next thing.`;

const PRIORITY_TEMPLATE_REDUCED = `## Context budget

Each pulse has a limited context window. Do ONE thing well. Blowing the context causes silent failures. Depth over breadth. Journal and finish after your one action.

## Priority (strict order, ONE item per pulse)

Walk the list. Do the FIRST thing that applies, then stop.

1. **Execute ONE task.** If running, advance it. If approved tasks exist, pick one and execute it. ONE task, then journal and stop.
2. **Verify ONE checking task.** One verification step (code or fit, not both). Journal and stop.
3. **Verify ONE checking goal.** Assess if met. Move to done or add summary. Journal and stop.
4. **Lightweight actions.** Act on critical monitored items, follow up on unanswered questions, handle critical blockers. Document non-urgent issues for working hours.

Off-peak mode: focus on advancing existing work. No new proposals unless genuinely urgent.`;

const PRIORITY_TEMPLATE_MINIMAL = `## Context budget

Overnight mode. Minimal activity. Do ONE thing at most, then stop.

## Priority (strict order, ONE item only)

1. **Execute ONE approved task** if any exist. Pick one, execute it, journal, stop.
2. **Monitor critical items.** Check for failures or breaking changes that can't wait.
3. **Handle emergencies.** Critical blockers or urgent owner messages only.

Most work waits for working hours. No engagement, no proposals, no new goals.`;

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
