/**
 * Task validation: replaced by three-agent verification pipeline.
 *
 * The old keyword-based validation (checkPlanDeliveryMatch, checkOnwardsMomentum)
 * has been replaced by actual agent verification:
 * - Agent B (code verifier): functional checks via Haiku sub-agent
 * - Agent C (fit verifier): plan compliance and goal alignment via Haiku sub-agent
 *
 * TaskType inference is still used for backward compatibility and UI displays.
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

// Deprecated: validation is now done by Agent B and C during pulse verification
export type ValidationResult = {
  canComplete: boolean;
  reason?: string;
  details?: Record<string, unknown>;
};

export function validateTaskCompletion(
  _title: string,
  _plan: string,
  _result: string,
  _taskType?: TaskType,
): ValidationResult {
  // Always pass - actual validation happens via Agent B and C in autonomous.ts
  return { canComplete: true, details: {} };
}
