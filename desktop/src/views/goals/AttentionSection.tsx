import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { ShieldCheck, Play, RotateCcw, CircleSlash, AlertTriangle, X, FileText, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { Task, Goal } from './helpers';
import { isValidationBlock } from './helpers';
import type { TaskRun } from '../../hooks/useGateway';

type Props = {
  tasks: Task[];
  goals: Map<string, Goal>;
  allGoals?: Goal[];
  taskRuns: Record<string, TaskRun>;
  onApprove: (task: Task, autoStart?: boolean) => void;
  onDeny: (task: Task, reason?: string) => void;
  onStart: (taskId: string, mode?: 'plan' | 'execute') => void;
  onTaskClick: (task: Task) => void;
  onViewPlan: (task: Task) => void;
  onUnblock: (taskId: string) => void;
  onMarkDone?: (taskId: string) => void;
  onRequestRevision?: (taskId: string, reason?: string) => void;
  onMarkGoalDone?: (goalId: string) => void;
  onRequestGoalRevision?: (goalId: string, reason?: string) => void;
  busy?: string | null;
};

type AttentionItem = { type: 'task'; item: Task } | { type: 'goal'; item: Goal };

type AttentionGroup = {
  key: string;
  label: string;
  icon: React.ReactNode;
  iconClass: string;
  tasks: Task[];
  items?: AttentionItem[];
};

export function AttentionSection({ tasks, goals, allGoals, taskRuns, onApprove, onDeny, onStart, onTaskClick, onViewPlan, onUnblock, onMarkDone, onRequestRevision, onMarkGoalDone, onRequestGoalRevision, busy }: Props) {
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState('');
  const [revisingId, setRevisingId] = useState<string | null>(null);
  const [revisionReason, setRevisionReason] = useState('');
  const [goalRevisingId, setGoalRevisingId] = useState<string | null>(null);
  const [goalRevisionReason, setGoalRevisionReason] = useState('');

  const groups = useMemo(() => {
    const checkingTasks = tasks.filter(t => t.status === 'checking');
    const checkingGoals = (allGoals || []).filter(g => g.status === 'checking');
    const pending = tasks.filter(t => t.status === 'reviewed' && !!t.approvalRequestId);
    const ready = tasks.filter(t => (t.status === 'approved') || (t.status === 'reviewed' && !t.approvalRequestId && !!t.approvedAt));
    const denied = tasks.filter(t => t.status === 'reviewed' && !!t.reason && /denied/i.test(t.reason));
    const blocked = tasks.filter(t => t.status === 'blocked');

    // Split checking tasks: validation-blocked vs normal verification
    const validationBlocked = checkingTasks.filter(isValidationBlock);
    const normalChecking = checkingTasks.filter(t => !isValidationBlock(t));

    // Build combined verify items: goals first, then normal checking tasks
    const verifyItems: AttentionItem[] = [
      ...checkingGoals.map(g => ({ type: 'goal' as const, item: g })),
      ...normalChecking.map(t => ({ type: 'task' as const, item: t })),
    ];

    const result: AttentionGroup[] = [];
    if (validationBlocked.length > 0) result.push({ key: 'mismatch', label: 'Resolve mismatches', icon: <ShieldAlert className="h-3 w-3" />, iconClass: 'text-orange-500', tasks: validationBlocked });
    if (verifyItems.length > 0) result.push({ key: 'verify', label: 'Verify completed work', icon: <CheckCircle2 className="h-3 w-3" />, iconClass: 'text-violet-500', tasks: normalChecking, items: verifyItems });
    if (pending.length > 0) result.push({ key: 'approve', label: 'Approve', icon: <ShieldCheck className="h-3 w-3" />, iconClass: 'text-amber-500', tasks: pending });
    if (ready.length > 0) result.push({ key: 'start', label: 'Ready to start', icon: <Play className="h-3 w-3" />, iconClass: 'text-emerald-500', tasks: ready });
    if (denied.length > 0) result.push({ key: 'revise', label: 'Needs revision', icon: <RotateCcw className="h-3 w-3" />, iconClass: 'text-destructive', tasks: denied });
    if (blocked.length > 0) result.push({ key: 'blocked', label: 'Blocked', icon: <CircleSlash className="h-3 w-3" />, iconClass: 'text-destructive', tasks: blocked });
    return result;
  }, [tasks, allGoals]);

  if (groups.length === 0) return null;

  const total = groups.reduce((sum, g) => (g.items ? g.items.length : g.tasks.length) + sum, 0);

  const handleDeny = (task: Task) => {
    if (denyingId === task.id) {
      onDeny(task, denyReason.trim() || undefined);
      setDenyingId(null);
      setDenyReason('');
    } else {
      setDenyingId(task.id);
      setDenyReason('');
    }
  };

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/[0.03]">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <AlertTriangle className="h-3.5 w-3.5 text-primary" />
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {total} thing{total !== 1 ? 's' : ''} need your attention
        </span>
      </div>
      <div className="divide-y divide-border/30">
        {groups.map(group => (
          <div key={group.key} className="px-4 py-2">
            <div className={cn('flex items-center gap-1.5 text-[10px] font-medium mb-1.5', group.iconClass)}>
              {group.icon}
              {group.label} ({group.items ? group.items.length : group.tasks.length})
            </div>
            <div className="space-y-0.5">
              {/* Render goal items in verify group */}
              {group.key === 'verify' && group.items?.filter(i => i.type === 'goal').map(({ item: g }) => {
                const goal = g as Goal;
                const isGoalBusy = !!busy && busy === `goal:${goal.id}`;
                return (
                  <div key={`goal-${goal.id}`}>
                    <div className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/30 transition-colors">
                      <div className="min-w-0 flex-1 text-left">
                        <span className="text-[9px] font-medium text-violet-500 mr-1.5">GOAL</span>
                        <span className="text-xs font-medium">{goal.title}</span>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {onMarkGoalDone && onRequestGoalRevision && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] text-destructive hover:bg-destructive/10"
                              disabled={isGoalBusy}
                              onClick={() => {
                                if (goalRevisingId === goal.id) {
                                  onRequestGoalRevision(goal.id, goalRevisionReason.trim() || undefined);
                                  setGoalRevisingId(null);
                                  setGoalRevisionReason('');
                                } else {
                                  setGoalRevisingId(goal.id);
                                  setGoalRevisionReason('');
                                }
                              }}
                            >
                              <RotateCcw className="mr-1 h-2.5 w-2.5" />
                              Needs Work
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] text-emerald-500 hover:bg-emerald-500/10"
                              disabled={isGoalBusy}
                              onClick={() => onMarkGoalDone(goal.id)}
                            >
                              <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                              Done
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {goal.reason && (
                      <div className="mt-1 ml-2 px-2 py-1.5 rounded bg-muted/30 border border-border/30">
                        <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground/70 mb-0.5">Assessment</div>
                        <div className="text-xs text-foreground/80 whitespace-pre-wrap">{goal.reason}</div>
                      </div>
                    )}
                    {goal.description && !goal.reason && (
                      <div className="mt-1 ml-2 px-2 py-1.5 rounded bg-muted/30 border border-border/30">
                        <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground/70 mb-0.5">Goal</div>
                        <div className="text-xs text-foreground/80 whitespace-pre-wrap">{goal.description}</div>
                      </div>
                    )}
                    {goalRevisingId === goal.id && (
                      <div className="mt-1 ml-2 flex items-end gap-2 pb-1">
                        <Textarea
                          value={goalRevisionReason}
                          onChange={e => setGoalRevisionReason(e.target.value)}
                          placeholder="What needs to be fixed? (optional)"
                          className="min-h-[40px] text-xs"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Escape') { setGoalRevisingId(null); setGoalRevisionReason(''); }
                            if (e.key === 'Enter' && e.metaKey && onRequestGoalRevision) {
                              onRequestGoalRevision(goal.id, goalRevisionReason.trim() || undefined);
                              setGoalRevisingId(null);
                              setGoalRevisionReason('');
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px]"
                          disabled={isGoalBusy}
                          onClick={() => {
                            if (onRequestGoalRevision) {
                              onRequestGoalRevision(goal.id, goalRevisionReason.trim() || undefined);
                              setGoalRevisingId(null);
                              setGoalRevisionReason('');
                            }
                          }}
                        >
                          Request
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Render task items */}
              {(group.key === 'verify' ? group.items?.filter(i => i.type === 'task').map(i => (i.item as Task)) || [] : group.tasks).map(task => {
                const goal = task.goalId ? goals.get(task.goalId) : null;
                const isBusy = !!busy && busy.startsWith(`task:${task.id}:`);
                return (
                  <div key={task.id}>
                    <div className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/30 transition-colors">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => onTaskClick(task)}
                      >
                        <span className="text-xs">{task.title}</span>
                        {goal && (
                          <span className="ml-2 text-[10px] text-muted-foreground/50">{goal.title}</span>
                        )}
                      </button>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {group.key === 'approve' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] text-primary"
                              onClick={() => onViewPlan(task)}
                            >
                              <FileText className="mr-1 h-2.5 w-2.5" />
                              Plan
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                              disabled={isBusy}
                              onClick={() => handleDeny(task)}
                              title="Deny"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] text-emerald-500 hover:bg-emerald-500/10"
                              disabled={isBusy}
                              onClick={() => onApprove(task, false)}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] text-emerald-500 hover:bg-emerald-500/10"
                              disabled={isBusy}
                              onClick={() => onApprove(task, true)}
                            >
                              <Play className="mr-1 h-2.5 w-2.5" />
                              Approve & Start
                            </Button>
                          </>
                        )}
                        {group.key === 'start' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] text-emerald-500 hover:bg-emerald-500/10"
                            disabled={isBusy}
                            onClick={() => onStart(task.id, 'execute')}
                          >
                            <Play className="mr-1 h-2.5 w-2.5" />
                            Start
                          </Button>
                        )}
                        {group.key === 'blocked' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] text-muted-foreground"
                            disabled={isBusy}
                            onClick={() => onUnblock(task.id)}
                          >
                            Unblock
                          </Button>
                        )}
                        {group.key === 'mismatch' && onMarkDone && onRequestRevision && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] text-destructive hover:bg-destructive/10"
                              disabled={isBusy}
                              onClick={() => onRequestRevision(task.id, 'Fix the deviations from plan')}
                            >
                              <RotateCcw className="mr-1 h-2.5 w-2.5" />
                              Fix It
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] text-emerald-500 hover:bg-emerald-500/10"
                              disabled={isBusy}
                              onClick={() => onMarkDone(task.id)}
                              title="Accept the deviation and mark done anyway"
                            >
                              <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                              Accept
                            </Button>
                          </>
                        )}
                        {group.key === 'verify' && onMarkDone && onRequestRevision && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] text-destructive hover:bg-destructive/10"
                              disabled={isBusy}
                              onClick={() => {
                                if (revisingId === task.id) {
                                  onRequestRevision(task.id, revisionReason.trim() || undefined);
                                  setRevisingId(null);
                                  setRevisionReason('');
                                } else {
                                  setRevisingId(task.id);
                                  setRevisionReason('');
                                }
                              }}
                            >
                              <RotateCcw className="mr-1 h-2.5 w-2.5" />
                              Needs Work
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] text-emerald-500 hover:bg-emerald-500/10"
                              disabled={isBusy}
                              onClick={() => onMarkDone(task.id)}
                            >
                              <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                              Done
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {group.key === 'mismatch' && task.reason && (
                      <div className="mt-1 ml-2 px-2 py-1.5 rounded bg-orange-500/5 border border-orange-500/20">
                        <div className="text-[9px] font-medium uppercase tracking-wide text-orange-500/70 mb-0.5">Validation Issue</div>
                        <div className="text-xs text-foreground/80 whitespace-pre-wrap">{task.reason}</div>
                      </div>
                    )}
                    {group.key === 'verify' && task.result && (
                      <div className="mt-1 ml-2 px-2 py-1.5 rounded bg-muted/30 border border-border/30">
                        <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground/70 mb-0.5">Result</div>
                        <div className="text-xs text-foreground/80 whitespace-pre-wrap">{task.result}</div>
                      </div>
                    )}
                    {revisingId === task.id && (
                      <div className="mt-1 ml-2 flex items-end gap-2 pb-1">
                        <Textarea
                          value={revisionReason}
                          onChange={e => setRevisionReason(e.target.value)}
                          placeholder="What needs to be fixed? (optional)"
                          className="min-h-[40px] text-xs"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Escape') { setRevisingId(null); setRevisionReason(''); }
                            if (e.key === 'Enter' && e.metaKey && onRequestRevision) {
                              onRequestRevision(task.id, revisionReason.trim() || undefined);
                              setRevisingId(null);
                              setRevisionReason('');
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px]"
                          disabled={isBusy}
                          onClick={() => {
                            if (onRequestRevision) {
                              onRequestRevision(task.id, revisionReason.trim() || undefined);
                              setRevisingId(null);
                              setRevisionReason('');
                            }
                          }}
                        >
                          Request
                        </Button>
                      </div>
                    )}
                    {denyingId === task.id && (
                      <div className="mt-1 ml-2 flex items-end gap-2 pb-1">
                        <Textarea
                          value={denyReason}
                          onChange={e => setDenyReason(e.target.value)}
                          placeholder="reason (optional)"
                          className="min-h-[40px] text-xs"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Escape') { setDenyingId(null); setDenyReason(''); }
                            if (e.key === 'Enter' && e.metaKey) { onDeny(task, denyReason.trim() || undefined); setDenyingId(null); setDenyReason(''); }
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px]"
                          disabled={isBusy}
                          onClick={() => { onDeny(task, denyReason.trim() || undefined); setDenyingId(null); setDenyReason(''); }}
                        >
                          Deny
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
