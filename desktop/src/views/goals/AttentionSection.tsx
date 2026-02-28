import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { ShieldCheck, Play, RotateCcw, CircleSlash, AlertTriangle, X, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { Task, Goal } from './helpers';
import type { TaskRun } from '../../hooks/useGateway';

type Props = {
  tasks: Task[];
  goals: Map<string, Goal>;
  taskRuns: Record<string, TaskRun>;
  onApprove: (task: Task, autoStart?: boolean) => void;
  onDeny: (task: Task, reason?: string) => void;
  onStart: (taskId: string, mode?: 'plan' | 'execute') => void;
  onTaskClick: (task: Task) => void;
  onViewPlan: (task: Task) => void;
  onUnblock: (taskId: string) => void;
  busy?: string | null;
};

type AttentionGroup = {
  key: string;
  label: string;
  icon: React.ReactNode;
  iconClass: string;
  tasks: Task[];
};

export function AttentionSection({ tasks, goals, taskRuns, onApprove, onDeny, onStart, onTaskClick, onViewPlan, onUnblock, busy }: Props) {
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState('');

  const groups = useMemo(() => {
    const pending = tasks.filter(t => t.status === 'planned' && !!t.approvalRequestId);
    const ready = tasks.filter(t => t.status === 'planned' && !t.approvalRequestId && !!t.approvedAt);
    const denied = tasks.filter(t => t.status === 'planned' && !!t.reason && /denied/i.test(t.reason));
    const blocked = tasks.filter(t => t.status === 'blocked');

    const result: AttentionGroup[] = [];
    if (pending.length > 0) result.push({ key: 'approve', label: 'Approve', icon: <ShieldCheck className="h-3 w-3" />, iconClass: 'text-amber-500', tasks: pending });
    if (ready.length > 0) result.push({ key: 'start', label: 'Ready to start', icon: <Play className="h-3 w-3" />, iconClass: 'text-emerald-500', tasks: ready });
    if (denied.length > 0) result.push({ key: 'revise', label: 'Needs revision', icon: <RotateCcw className="h-3 w-3" />, iconClass: 'text-destructive', tasks: denied });
    if (blocked.length > 0) result.push({ key: 'blocked', label: 'Blocked', icon: <CircleSlash className="h-3 w-3" />, iconClass: 'text-destructive', tasks: blocked });
    return result;
  }, [tasks]);

  if (groups.length === 0) return null;

  const total = groups.reduce((sum, g) => sum + g.tasks.length, 0);

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
              {group.label} ({group.tasks.length})
            </div>
            <div className="space-y-0.5">
              {group.tasks.map(task => {
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
                      </div>
                    </div>
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
