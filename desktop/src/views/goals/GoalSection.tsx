import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ChevronRight, MoreHorizontal, Plus, Pause, Play, Check, Trash2 } from 'lucide-react';
import { TaskRow } from './TaskRow';
import type { Goal, Task, TaskPresentation } from './helpers';
import { getGoalColor, getStatusBadge } from './helpers';

type Props = {
  goal: Goal;
  tasks: Task[];
  allTasks: Task[];
  presentations: Map<string, TaskPresentation>;
  defaultOpen?: boolean;
  filtered?: boolean;
  onTaskClick: (task: Task) => void;
  onStartTask: (taskId: string, mode?: 'plan' | 'execute') => void;
  onWatchTask: (task: Task) => void;
  onUnblockTask: (taskId: string) => void;
  onToggleGoalStatus: (goal: Goal) => void;
  onCompleteGoal: (goal: Goal) => void;
  onDeleteGoal: (goalId: string) => void;
  onCreateTask: (title: string, goalId: string) => void;
  busy?: string | null;
};

export function GoalSection({
  goal, tasks, allTasks, presentations, defaultOpen, filtered = false,
  onTaskClick, onStartTask, onWatchTask, onUnblockTask,
  onToggleGoalStatus, onCompleteGoal, onDeleteGoal, onCreateTask, busy,
}: Props) {
  // Auto-expand if there are actionable tasks, otherwise collapse
  const hasActionable = tasks.some(t => {
    const p = presentations.get(t.id);
    return p && p.action !== null;
  });
  const [open, setOpen] = useState(defaultOpen ?? hasActionable);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const isDismissed = (t: Task) =>
    t.status === 'done' || t.status === 'cancelled' ||
    (t.status === 'planned' && !!t.reason && /denied/i.test(t.reason));

  const activeTasks = filtered ? tasks : tasks.filter(t => !isDismissed(t));
  const dismissedTasks = filtered ? [] : tasks.filter(t => isDismissed(t));
  const [showDismissed, setShowDismissed] = useState(false);

  // Compute inline status chips from ALL tasks for this goal (not filtered)
  const statusChips = (() => {
    const counts: Record<string, number> = {};
    for (const t of allTasks) {
      const p = presentations.get(t.id);
      if (p) counts[p.label] = (counts[p.label] || 0) + 1;
    }
    return Object.entries(counts);
  })();

  const handleAddTask = () => {
    const title = newTitle.trim();
    if (!title) return;
    onCreateTask(title, goal.id);
    setNewTitle('');
    setShowAdd(false);
  };

  const color = getGoalColor(goal.id);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="group">
        <div className="flex items-center gap-2 py-1">
          <CollapsibleTrigger className="flex flex-1 items-center gap-2 min-w-0 rounded px-2 py-1.5 hover:bg-muted/30 transition-colors">
            <div className={cn('h-2 w-2 shrink-0 rounded-full', color.border.replace('border-l-', 'bg-'))} />
            <ChevronRight className={cn(
              'h-3 w-3 shrink-0 text-muted-foreground/40 transition-transform duration-150',
              open && 'rotate-90',
            )} />
            <span className="text-xs font-medium truncate">{goal.title}</span>
            {goal.status === 'paused' && (
              <span className="text-[9px] text-amber-500 shrink-0">paused</span>
            )}
            {!open && statusChips.length > 0 && (
              <div className="flex items-center gap-1.5 ml-auto shrink-0">
                {statusChips.map(([label, count]) => {
                  const badge = getStatusBadge(label);
                  return (
                    <span key={label} className={cn('inline-flex rounded px-1 py-0.5 text-[9px] leading-none', badge.bg, badge.text)}>
                      {count} {label}
                    </span>
                  );
                })}
              </div>
            )}
          </CollapsibleTrigger>

          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setShowAdd(v => !v)}
              title="Add work item"
            >
              <Plus className="h-3 w-3" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onToggleGoalStatus(goal)}>
                  {goal.status === 'paused' ? (
                    <><Play className="mr-2 h-3.5 w-3.5" /> Resume</>
                  ) : (
                    <><Pause className="mr-2 h-3.5 w-3.5" /> Pause</>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onCompleteGoal(goal)}>
                  <Check className="mr-2 h-3.5 w-3.5" /> Mark done
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onDeleteGoal(goal.id)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {showAdd && (
          <div className="flex items-center gap-2 ml-9 mr-2 mb-1">
            <Input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddTask(); if (e.key === 'Escape') setShowAdd(false); }}
              placeholder="new work item"
              className="h-7 text-xs"
              autoFocus
            />
            <Button size="sm" className="h-7 text-xs" onClick={handleAddTask} disabled={!newTitle.trim()}>
              Add
            </Button>
          </div>
        )}
      </div>

      <CollapsibleContent>
        <div className="ml-4 border-l-2 border-border/40 pl-3 mb-1">
          {activeTasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              presentation={presentations.get(task.id) || { label: '', dotClass: '', action: null }}
              onClick={() => onTaskClick(task)}
              onStart={(mode) => onStartTask(task.id, mode)}
              onWatch={() => onWatchTask(task)}
              onUnblock={() => onUnblockTask(task.id)}
              busy={!!busy && busy.startsWith(`task:${task.id}:`)}
            />
          ))}

          {dismissedTasks.length > 0 && (
            <button
              type="button"
              className="w-full px-3 py-1 text-left text-[10px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
              onClick={() => setShowDismissed(v => !v)}
            >
              {showDismissed ? 'hide' : 'show'} {dismissedTasks.length} closed
            </button>
          )}

          {showDismissed && dismissedTasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              presentation={presentations.get(task.id) || { label: 'done', dotClass: 'bg-muted-foreground/20', action: null }}
              onClick={() => onTaskClick(task)}
              onStart={(mode) => onStartTask(task.id, mode)}
              onWatch={() => onWatchTask(task)}
              onUnblock={() => onUnblockTask(task.id)}
              busy={!!busy && busy.startsWith(`task:${task.id}:`)}
            />
          ))}

          {activeTasks.length === 0 && dismissedTasks.length === 0 && (
            <div className="px-3 py-2 text-[10px] text-muted-foreground/50">no work items yet</div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
