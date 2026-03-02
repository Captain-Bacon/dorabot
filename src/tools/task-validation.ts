/**
 * Task completion validation: plan-vs-delivery matching and onwards momentum detection.
 *
 * These checks run when a task is marked done. If issues are found, the task
 * moves to 'checking' instead of 'done', with a reason explaining what needs resolution.
 */

export type TaskType = 'implementation' | 'audit' | 'research' | 'exploration' | 'design' | 'discovery';

const TYPE_KEYWORDS: Record<TaskType, string[]> = {
  audit: ['audit', 'review', 'assess', 'evaluate', 'inspect'],
  research: ['research', 'investigate', 'study', 'analyze', 'explore feasibility'],
  exploration: ['exploration', 'explore', 'discover', 'map out', 'survey'],
  design: ['design', 'architect', 'blueprint', 'wireframe', 'prototype'],
  discovery: ['discovery', 'spike', 'proof of concept', 'poc', 'feasibility'],
  implementation: [], // default fallback
};

export function inferTaskType(title: string): TaskType {
  const lower = title.toLowerCase();
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS) as [TaskType, string[]][]) {
    if (type === 'implementation') continue;
    for (const kw of keywords) {
      if (lower.includes(kw)) return type;
    }
  }
  return 'implementation';
}

// --- Plan-vs-Delivery Matching ---

const DEVIATION_PHRASES = [
  'did not implement',
  'did not build',
  'did not create',
  'skipped',
  'simplified from plan',
  'deferred',
  'not included',
  'omitted',
  'not yet implemented',
  'partially implemented',
  'placeholder only',
  'stub only',
  'hardcoded',
  'config-only',
  'no ui',
  'without ui',
  'backend only',
];

export function extractPlanDeliverables(plan: string): string[] {
  const deliverables: string[] = [];
  const lines = plan.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Checkbox items: - [ ] or - [x]
    const checkboxMatch = trimmed.match(/^-\s*\[[ x]\]\s*(.+)/i);
    if (checkboxMatch) {
      deliverables.push(checkboxMatch[1].trim());
      continue;
    }
    // "Files created:" or "Files changed:" items
    if (/^(files?\s+(created|changed|modified|added)\s*:)/i.test(trimmed)) {
      deliverables.push(trimmed);
      continue;
    }
    // Numbered steps in execution plan (after ## Execution Plan)
    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (numberedMatch && numberedMatch[1].length > 10) {
      deliverables.push(numberedMatch[1].trim());
    }
  }

  return deliverables;
}

export type PlanDeliveryResult = {
  hasDeviation: boolean;
  deviations: string[];
  missingDeliverables: string[];
};

export function checkPlanDeliveryMatch(plan: string, result: string): PlanDeliveryResult {
  if (!plan.trim() || !result.trim()) {
    return { hasDeviation: false, deviations: [], missingDeliverables: [] };
  }

  const resultLower = result.toLowerCase();

  // Check for explicit deviation phrases in result
  const deviations = DEVIATION_PHRASES.filter(phrase =>
    resultLower.includes(phrase),
  );

  // Extract plan deliverables and check if result mentions them
  const planDeliverables = extractPlanDeliverables(plan);
  // Only flag truly significant deliverables that are missing from result
  const missingDeliverables = planDeliverables.filter(item => {
    // Extract key words from deliverable (skip short/generic ones)
    const words = item.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    if (words.length === 0) return false;
    // If at least half the significant words appear in result, consider it covered
    const found = words.filter(w => resultLower.includes(w)).length;
    return found < words.length * 0.5;
  });

  return {
    hasDeviation: deviations.length > 0,
    deviations,
    missingDeliverables,
  };
}

// --- Onwards Momentum Detection ---

const MOMENTUM_TASK_TYPES: TaskType[] = ['audit', 'research', 'exploration', 'design', 'discovery'];

const FINDING_PHRASES = [
  'recommendation',
  'recommends',
  'next step',
  'should implement',
  'should build',
  'should create',
  'needs implementation',
  'needs to be built',
  'follow-up',
  'follow up',
  'action item',
  'todo',
  'gap identified',
  'missing feature',
];

export type MomentumResult = {
  needsFollowUp: boolean;
  findings: string[];
  reason: string;
};

export function checkOnwardsMomentum(taskType: TaskType, result: string): MomentumResult {
  if (!MOMENTUM_TASK_TYPES.includes(taskType)) {
    return { needsFollowUp: false, findings: [], reason: '' };
  }

  if (!result.trim()) {
    return { needsFollowUp: false, findings: [], reason: '' };
  }

  const resultLower = result.toLowerCase();

  // Check for finding/recommendation phrases
  const findings = FINDING_PHRASES.filter(phrase =>
    resultLower.includes(phrase),
  );

  if (findings.length === 0) {
    return { needsFollowUp: false, findings: [], reason: '' };
  }

  // Check if result mentions creating tasks (evidence of follow-up)
  const hasTaskReferences = /task\s*#\d+/i.test(result)
    || /created\s+task/i.test(result)
    || /follow-up\s+task\s+created/i.test(result)
    || /new\s+task/i.test(result);

  if (hasTaskReferences) {
    return { needsFollowUp: false, findings, reason: '' };
  }

  return {
    needsFollowUp: true,
    findings,
    reason: `${taskType} task has recommendations/findings but no follow-up tasks referenced. Create follow-up tasks before marking done.`,
  };
}

// --- Combined Validation ---

export type ValidationResult = {
  canComplete: boolean;
  reason?: string;
  details: {
    planDelivery?: PlanDeliveryResult;
    momentum?: MomentumResult;
  };
};

export function validateTaskCompletion(
  title: string,
  plan: string,
  result: string,
  taskType?: TaskType,
): ValidationResult {
  const type = taskType || inferTaskType(title);

  const planDelivery = checkPlanDeliveryMatch(plan, result);
  const momentum = checkOnwardsMomentum(type, result);

  const issues: string[] = [];

  if (planDelivery.hasDeviation) {
    issues.push(`Plan-vs-delivery mismatch: result mentions deviations (${planDelivery.deviations.join(', ')})`);
  }

  if (momentum.needsFollowUp) {
    issues.push(momentum.reason);
  }

  if (issues.length > 0) {
    return {
      canComplete: false,
      reason: `Completion blocked:\n${issues.map(i => `- ${i}`).join('\n')}`,
      details: { planDelivery, momentum },
    };
  }

  return { canComplete: true, details: { planDelivery, momentum } };
}
