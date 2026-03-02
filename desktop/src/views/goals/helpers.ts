import type { TaskRun } from '../../hooks/useGateway';

export type GoalStatus = 'holding' | 'developing' | 'active' | 'checking' | 'done';
export type TaskStatus = 'draft' | 'reviewed' | 'approved' | 'running' | 'checking' | 'done' | 'blocked' | 'cancelled';

export type Goal = {
  id: string;
  title: string;
  description?: string;
  status: GoalStatus;
  tags?: string[];
  reason?: string;
  createdAt: string;
  updatedAt: string;
};

export type TaskType = 'implementation' | 'audit' | 'research' | 'exploration' | 'design' | 'discovery';

export type Task = {
  id: string;
  goalId?: string;
  title: string;
  status: TaskStatus;
  taskType?: TaskType;
  plan?: string;
  planDocPath?: string;
  result?: string;
  reason?: string;
  sessionId?: string;
  sessionKey?: string;
  approvalRequestId?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type TaskLog = {
  id: number;
  taskId: string;
  eventType: string;
  message: string;
  createdAt: string;
};

export type TaskPresentation = {
  label: string;
  dotClass: string;
  action: 'approve' | 'start' | 'watch' | 'unblock' | null;
};

const STATUS_ORDER: Record<TaskStatus, number> = {
  running: 0,
  blocked: 1,
  checking: 2,
  draft: 3,
  reviewed: 4,
  approved: 5,
  done: 6,
  cancelled: 7,
};

export function getTaskPresentation(
  task: Task,
  taskRuns: Record<string, TaskRun>,
): TaskPresentation {
  const isRunning = taskRuns[task.id]?.status === 'started';

  if (isRunning || task.status === 'running') {
    return {
      label: 'running',
      dotClass: 'bg-foreground animate-pulse',
      action: task.sessionId || task.sessionKey ? 'watch' : null,
    };
  }

  if (task.status === 'reviewed') {
    if (task.approvalRequestId) {
      return { label: 'waiting for approval', dotClass: 'bg-amber-500', action: 'approve' };
    }
    if (task.reason && /denied/i.test(task.reason)) {
      return { label: 'needs revision', dotClass: 'bg-destructive', action: null };
    }
    if (task.approvedAt) {
      return { label: 'approved', dotClass: 'bg-emerald-500', action: 'start' };
    }
    return { label: 'reviewed', dotClass: 'bg-violet-500/40', action: null };
  }

  if (task.status === 'approved') {
    return { label: 'approved', dotClass: 'bg-emerald-500', action: 'start' };
  }

  if (task.status === 'checking') {
    return { label: 'checking', dotClass: 'bg-amber-500 animate-pulse', action: null };
  }

  if (task.status === 'blocked') {
    return { label: 'blocked', dotClass: 'bg-destructive', action: 'unblock' };
  }

  if (task.status === 'draft') {
    return { label: 'draft', dotClass: 'bg-muted-foreground/20', action: null };
  }

  if (task.status === 'done') {
    return { label: 'done', dotClass: 'bg-muted-foreground/20', action: null };
  }

  return { label: 'cancelled', dotClass: 'bg-muted-foreground/20', action: null };
}

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const order = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (order !== 0) return order;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function parseSessionKey(sessionKey?: string): { channel: string; chatType: string; chatId: string } | null {
  if (!sessionKey) return null;
  const [channel = 'desktop', chatType = 'dm', ...rest] = sessionKey.split(':');
  const chatId = rest.join(':');
  if (!chatId) return null;
  return { channel, chatType, chatId };
}

export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err || 'unknown error');
}

// status badge colors for tasks
export function getStatusBadge(label: string): { bg: string; text: string } {
  switch (label) {
    case 'running':
      return { bg: 'bg-sky-500/15', text: 'text-sky-500' };
    case 'waiting for approval':
    case 'needs approval':
      return { bg: 'bg-amber-500/15', text: 'text-amber-500' };
    case 'approved':
    case 'ready to start':
    case 'ready':
      return { bg: 'bg-emerald-500/15', text: 'text-emerald-500' };
    case 'draft':
      return { bg: 'bg-muted', text: 'text-muted-foreground' };
    case 'reviewed':
      return { bg: 'bg-violet-500/15', text: 'text-violet-500' };
    case 'checking':
      return { bg: 'bg-amber-500/15', text: 'text-amber-500' };
    case 'blocked':
      return { bg: 'bg-destructive/15', text: 'text-destructive' };
    case 'needs revision':
    case 'denied':
      return { bg: 'bg-destructive/15', text: 'text-destructive' };
    case 'done':
      return { bg: 'bg-emerald-500/15', text: 'text-emerald-500' };
    case 'cancelled':
      return { bg: 'bg-muted', text: 'text-muted-foreground' };
    default:
      return { bg: 'bg-muted', text: 'text-muted-foreground' };
  }
}

// task type inference (mirrors backend logic for display)
const TYPE_KEYWORDS: Record<string, string[]> = {
  audit: ['audit', 'review', 'assess', 'evaluate', 'inspect'],
  research: ['research', 'investigate', 'study', 'analyze'],
  exploration: ['exploration', 'explore', 'discover', 'map out', 'survey'],
  design: ['design', 'architect', 'blueprint', 'wireframe'],
  discovery: ['discovery', 'spike', 'proof of concept', 'poc'],
};

export function inferTaskType(title: string): TaskType {
  const lower = title.toLowerCase();
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return type as TaskType;
    }
  }
  return 'implementation';
}

export function getTaskTypeBadge(type: TaskType): { bg: string; text: string; label: string } {
  switch (type) {
    case 'audit': return { bg: 'bg-orange-500/15', text: 'text-orange-500', label: 'audit' };
    case 'research': return { bg: 'bg-blue-500/15', text: 'text-blue-500', label: 'research' };
    case 'exploration': return { bg: 'bg-cyan-500/15', text: 'text-cyan-500', label: 'explore' };
    case 'design': return { bg: 'bg-purple-500/15', text: 'text-purple-500', label: 'design' };
    case 'discovery': return { bg: 'bg-teal-500/15', text: 'text-teal-500', label: 'discovery' };
    case 'implementation': return { bg: 'bg-muted', text: 'text-muted-foreground', label: 'impl' };
  }
}

// Check if a task's reason indicates a validation failure
export function isValidationBlock(task: Task): boolean {
  return task.status === 'checking' && !!task.reason && (
    task.reason.includes('Plan-vs-delivery mismatch')
    || task.reason.includes('Completion blocked')
    || task.reason.includes('follow-up tasks')
  );
}

// stable goal colors — deterministic from id, won't shift when goals reorder
const GOAL_COLORS = [
  { border: 'border-l-sky-500', accent: 'bg-sky-500/5' },
  { border: 'border-l-amber-500', accent: 'bg-amber-500/5' },
  { border: 'border-l-emerald-500', accent: 'bg-emerald-500/5' },
  { border: 'border-l-violet-500', accent: 'bg-violet-500/5' },
  { border: 'border-l-rose-500', accent: 'bg-rose-500/5' },
  { border: 'border-l-cyan-500', accent: 'bg-cyan-500/5' },
  { border: 'border-l-orange-500', accent: 'bg-orange-500/5' },
  { border: 'border-l-teal-500', accent: 'bg-teal-500/5' },
] as const;

export function getGoalColor(goalId: string): { border: string; accent: string } {
  let hash = 0;
  for (let i = 0; i < goalId.length; i++) {
    hash = ((hash << 5) - hash + goalId.charCodeAt(i)) | 0;
  }
  return GOAL_COLORS[Math.abs(hash) % GOAL_COLORS.length];
}
