import { useCallback, useEffect, useMemo, useState } from 'react';
import type { useGateway, TaskRun } from '../hooks/useGateway';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Loader2, Wrench, Target, Sparkles } from 'lucide-react';
import type { Goal, Task, GoalStatus, TaskStatus } from './goals/helpers';
import { getTaskPresentation, sortTasks, parseSessionKey, errorText } from './goals/helpers';
import { AttentionSection } from './goals/AttentionSection';
import { SummaryStrip, type TaskFilter } from './goals/SummaryStrip';
import { GoalSection } from './goals/GoalSection';
import { GoalCreationTrigger, GoalCreationForm } from './goals/GoalCreation';
import { TaskDetailSheet } from './goals/TaskDetailSheet';
import { PlanDialog } from './goals/PlanDialog';
import { TaskRow } from './goals/TaskRow';

type Props = {
  gateway: ReturnType<typeof useGateway>;
  onViewSession?: (sessionId: string, channel?: string, chatId?: string, chatType?: string) => void;
  onSetupChat?: (prompt: string) => void;
};

export function GoalsView({ gateway, onViewSession, onSetupChat }: Props) {
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [planTask, setPlanTask] = useState<Task | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>(null);
  const [showGoalForm, setShowGoalForm] = useState(false);

  const taskRuns = gateway.taskRuns as Record<string, TaskRun>;

  const load = useCallback(async () => {
    if (gateway.connectionState !== 'connected') return;
    try {
      const [goalsRes, tasksRes] = await Promise.all([
        gateway.rpc('goals.list'),
        gateway.rpc('tasks.list'),
      ]);
      if (Array.isArray(goalsRes)) setGoals(goalsRes as Goal[]);
      if (Array.isArray(tasksRes)) setTasks(tasksRes as Task[]);
    } catch (err) {
      toast.error('Failed to load goals', { description: errorText(err) });
    } finally {
      setLoading(false);
    }
  }, [gateway]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!loading) void load(); }, [gateway.goalsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const goalsById = useMemo(() => new Map(goals.map(g => [g.id, g])), [goals]);

  const presentations = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getTaskPresentation>>();
    for (const t of tasks) map.set(t.id, getTaskPresentation(t, taskRuns));
    return map;
  }, [tasks, taskRuns]);

  const matchesFilter = useCallback((t: Task): boolean => {
    if (!taskFilter) return true;
    switch (taskFilter) {
      case 'running': return t.status === 'running' || taskRuns[t.id]?.status === 'started';
      case 'pending': return t.status === 'reviewed' && !!t.approvalRequestId;
      case 'ready': return t.status === 'approved' || (t.status === 'reviewed' && !t.approvalRequestId && !!t.approvedAt);
      case 'draft': return t.status === 'draft';
      case 'blocked': return t.status === 'blocked';
      case 'denied': return t.status === 'reviewed' && !!t.reason && /denied/i.test(t.reason);
      case 'done': return t.status === 'done';
      default: return true;
    }
  }, [taskFilter, taskRuns]);

  const activeGoals = useMemo(() => {
    const active = goals.filter(g => g.status !== 'done');
    // Sort: goals with actionable tasks first (running, pending approval, ready), then by creation date
    const goalActionScore = (g: Goal): number => {
      const gTasks = tasks.filter(t => t.goalId === g.id);
      let score = 0;
      for (const t of gTasks) {
        if (t.status === 'running' || taskRuns[t.id]?.status === 'started') score += 100;
        if (t.status === 'reviewed' && t.approvalRequestId) score += 50;
        if (t.status === 'approved' || (t.status === 'reviewed' && !t.approvalRequestId && t.approvedAt)) score += 30;
        if (t.status === 'blocked') score += 20;
      }
      return score;
    };
    return active.sort((a, b) => {
      const scoreDiff = goalActionScore(b) - goalActionScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }, [goals, tasks, taskRuns]);

  const doneGoals = useMemo(
    () => goals.filter(g => g.status === 'done'),
    [goals],
  );

  const filteredTasks = useMemo(
    () => tasks.filter(matchesFilter),
    [tasks, matchesFilter],
  );

  const orphanTasks = useMemo(
    () => sortTasks(filteredTasks.filter(t => !t.goalId)),
    [filteredTasks],
  );

  const tasksByGoal = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const g of goals) map.set(g.id, []);
    for (const t of filteredTasks) {
      if (t.goalId && map.has(t.goalId)) map.get(t.goalId)!.push(t);
    }
    for (const [id, arr] of map) map.set(id, sortTasks(arr));
    return map;
  }, [goals, filteredTasks]);

  // actions
  const wrap = useCallback(async (key: string, fn: () => Promise<void>) => {
    setSaving(key);
    try { await fn(); await load(); }
    catch (err) { toast.error(errorText(err)); }
    finally { setSaving(null); }
  }, [load]);

  const approveTask = useCallback((task: Task, autoStart = false) => {
    void wrap(`task:${task.id}:approve`, async () => {
      const res = await gateway.rpc('tasks.approve', {
        ...(task.approvalRequestId ? { requestId: task.approvalRequestId } : {}),
        taskId: task.id,
        autoStart,
      }) as { started?: boolean; taskId?: string } | null;
      if (autoStart && res) {
        toast.success(`Approved & started: ${task.title}`);
        // If started, navigate to the task session
        if (onViewSession) {
          const startRes = res as any;
          if (startRes.sessionId && startRes.chatId) {
            onViewSession(startRes.sessionId, 'desktop', startRes.chatId, 'dm');
          }
        }
      } else {
        toast.success(`Approved: ${task.title}`);
      }
    });
  }, [gateway, wrap, onViewSession]);

  const denyTask = useCallback((task: Task, reason?: string) => {
    void wrap(`task:${task.id}:deny`, async () => {
      await gateway.rpc('tasks.deny', task.approvalRequestId
        ? { requestId: task.approvalRequestId, taskId: task.id, reason: reason || 'denied by user' }
        : { taskId: task.id, reason: reason || 'denied by user' });
      toast.success(`Denied: ${task.title}`, reason ? { description: reason } : undefined);
    });
  }, [gateway, wrap]);

  const startTask = useCallback((taskId: string, mode?: 'plan' | 'execute') => {
    void wrap(`task:${taskId}:start`, async () => {
      const res = await gateway.rpc('tasks.start', { id: taskId, mode: mode || 'execute' }) as { sessionId?: string; chatId?: string } | null;
      if (res?.sessionId && onViewSession) {
        onViewSession(res.sessionId, 'desktop', res.chatId, 'dm');
      }
    });
  }, [gateway, wrap, onViewSession]);

  const watchTask = useCallback((task: Task) => {
    if (!onViewSession) return;
    if (task.sessionId) {
      const parsed = task.sessionKey ? parseSessionKey(task.sessionKey) : null;
      onViewSession(task.sessionId, parsed?.channel || 'desktop', parsed?.chatId || task.sessionId, parsed?.chatType || 'dm');
      return;
    }
    const parsed = parseSessionKey(task.sessionKey);
    if (!parsed) return;
    const session = gateway.sessions.find((s: any) =>
      (s.channel || 'desktop') === parsed.channel
      && (s.chatType || 'dm') === parsed.chatType
      && s.chatId === parsed.chatId,
    );
    if (session?.id) onViewSession(session.id, parsed.channel, parsed.chatId, parsed.chatType);
  }, [gateway.sessions, onViewSession]);

  const unblockTask = useCallback((taskId: string) => {
    void wrap(`task:${taskId}:status`, async () => {
      await gateway.rpc('tasks.update', { id: taskId, status: 'draft' });
    });
  }, [gateway, wrap]);

  const markDone = useCallback((taskId: string) => {
    void wrap(`task:${taskId}:done`, async () => {
      await gateway.rpc('tasks.done', { id: taskId });
      const task = tasks.find(t => t.id === taskId);
      toast.success(`Marked done: ${task?.title || taskId}`);
    });
  }, [gateway, wrap, tasks]);

  const requestRevision = useCallback((taskId: string, reason?: string) => {
    void wrap(`task:${taskId}:revision`, async () => {
      await gateway.rpc('tasks.update', {
        id: taskId,
        status: 'approved',
        reason: reason || 'Needs revision based on verification',
      });
      const task = tasks.find(t => t.id === taskId);
      toast.success(`Revision requested: ${task?.title || taskId}`, reason ? { description: reason } : undefined);
    });
  }, [gateway, wrap, tasks]);

  const saveTask = useCallback((taskId: string, updates: { title: string; goalId: string; reason: string; result: string }) => {
    void wrap(`task:${taskId}:save`, async () => {
      await gateway.rpc('tasks.update', { id: taskId, ...updates });
    });
  }, [gateway, wrap]);

  const blockTask = useCallback((taskId: string) => {
    void wrap(`task:${taskId}:status`, async () => {
      await gateway.rpc('tasks.update', { id: taskId, status: 'blocked' });
    });
  }, [gateway, wrap]);

  const deleteTask = useCallback((taskId: string) => {
    void wrap(`task:${taskId}:delete`, async () => {
      await gateway.rpc('tasks.delete', { id: taskId });
      if (selectedTask?.id === taskId) { setSelectedTask(null); setSheetOpen(false); }
    });
  }, [gateway, wrap, selectedTask]);

  const toggleGoalStatus = useCallback((goal: Goal) => {
    const next: GoalStatus = goal.status === 'holding' ? 'active' : 'holding';
    void wrap(`goal:${goal.id}`, async () => {
      await gateway.rpc('goals.update', { id: goal.id, status: next });
    });
  }, [gateway, wrap]);

  const completeGoal = useCallback((goal: Goal) => {
    void wrap(`goal:${goal.id}`, async () => {
      await gateway.rpc('goals.update', { id: goal.id, status: 'done' as GoalStatus });
    });
  }, [gateway, wrap]);

  const reopenGoal = useCallback((goal: Goal) => {
    void wrap(`goal:${goal.id}`, async () => {
      await gateway.rpc('goals.update', { id: goal.id, status: 'active' as GoalStatus });
      toast.success(`Reopened: ${goal.title}`);
    });
  }, [gateway, wrap]);

  const markGoalDone = useCallback((goalId: string) => {
    void wrap(`goal:${goalId}`, async () => {
      await gateway.rpc('goals.markDone', { id: goalId });
      const goal = goals.find(g => g.id === goalId);
      toast.success(`Verified & done: ${goal?.title || goalId}`);
    });
  }, [gateway, wrap, goals]);

  const requestGoalRevision = useCallback((goalId: string, reason?: string) => {
    void wrap(`goal:${goalId}`, async () => {
      await gateway.rpc('goals.requestRevision', { id: goalId, reason: reason || 'Needs more work' });
      const goal = goals.find(g => g.id === goalId);
      toast.success(`Revision requested: ${goal?.title || goalId}`, reason ? { description: reason } : undefined);
    });
  }, [gateway, wrap, goals]);

  const nudgeGoal = useCallback((goal: Goal) => {
    if (!onSetupChat) return;
    const taskSummary = tasks
      .filter(t => t.goalId === goal.id)
      .map(t => `- "${t.title}" [${t.status}]`)
      .join('\n');
    const prompt = `Assess goal #${goal.id}: "${goal.title}"${goal.description ? ` (${goal.description})` : ''}.

Tasks:
${taskSummary || '(none)'}

Look at this goal holistically. What's the situation? Is the goal actually met? What's missing? What's the gap between the intent and reality? Don't jump to creating tasks. Just give me an honest assessment.`;
    onSetupChat(prompt);
  }, [tasks, onSetupChat]);

  const deleteGoal = useCallback((goalId: string) => {
    void wrap(`goal:delete:${goalId}`, async () => {
      await gateway.rpc('goals.delete', { id: goalId });
    });
  }, [gateway, wrap]);

  const createGoal = useCallback((title: string, description?: string) => {
    void wrap('goal:create', async () => {
      await gateway.rpc('goals.add', { title, description });
    });
  }, [gateway, wrap]);

  const createTask = useCallback((title: string, goalId: string) => {
    void wrap('task:create', async () => {
      await gateway.rpc('tasks.add', { title, status: 'draft' as TaskStatus, goalId: goalId || undefined });
    });
  }, [gateway, wrap]);

  const openTaskDetail = useCallback((task: Task) => {
    setSelectedTask(task);
    setSheetOpen(true);
  }, []);

  const openPlan = useCallback((task: Task) => {
    setPlanTask(task);
    setPlanOpen(true);
  }, []);

  if (gateway.connectionState !== 'connected') {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        connecting...
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        loading...
      </div>
    );
  }

  const isEmpty = goals.length === 0 && tasks.length === 0;

  if (isEmpty) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <Target className="h-8 w-8 text-muted-foreground/30" />
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">no goals yet</div>
          <div className="text-[11px] text-muted-foreground/60">goals help you track what the agent is working toward</div>
        </div>
        <div className="flex items-center gap-3">
          {onSetupChat && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onSetupChat('create goals for me based on my history, ask me questions')}
            >
              <Sparkles className="mr-1.5 h-3 w-3" />
              generate goals
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="h-full">
        <div className="mx-auto max-w-3xl space-y-6 p-6">
          <AttentionSection
            tasks={tasks}
            goals={goalsById}
            allGoals={goals}
            taskRuns={taskRuns}
            onApprove={approveTask}
            onDeny={denyTask}
            onStart={startTask}
            onTaskClick={openTaskDetail}
            onViewPlan={openPlan}
            onUnblock={unblockTask}
            onMarkDone={markDone}
            onRequestRevision={requestRevision}
            onMarkGoalDone={markGoalDone}
            onRequestGoalRevision={requestGoalRevision}
            busy={saving}
          />

          <SummaryStrip tasks={tasks} taskRuns={taskRuns} activeFilter={taskFilter} onFilterChange={setTaskFilter} />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Goals</span>
              <GoalCreationTrigger onClick={() => setShowGoalForm(v => !v)} />
            </div>
            {taskFilter && (
              <button
                type="button"
                onClick={() => setTaskFilter(null)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                filtered: {taskFilter} ({filteredTasks.length}) — show all
              </button>
            )}
          </div>

          {showGoalForm && (
            <GoalCreationForm
              onCreate={createGoal}
              busy={saving === 'goal:create'}
              onClose={() => setShowGoalForm(false)}
            />
          )}

          {taskFilter && filteredTasks.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-xs text-muted-foreground">
              no tasks match "{taskFilter}"
            </div>
          )}

          <div className="space-y-0.5">
            {activeGoals.map(goal => {
              const goalTasks = tasksByGoal.get(goal.id) || [];
              const allGoalTasks = tasks.filter(t => t.goalId === goal.id);
              if (taskFilter && goalTasks.length === 0) return null;
              return (
                <GoalSection
                  key={goal.id}
                  goal={goal}
                  tasks={goalTasks}
                  allTasks={allGoalTasks}
                  presentations={presentations}
                  filtered={!!taskFilter}
                  onTaskClick={openTaskDetail}
                  onStartTask={startTask}
                  onWatchTask={watchTask}
                  onUnblockTask={unblockTask}
                  onToggleGoalStatus={toggleGoalStatus}
                  onCompleteGoal={completeGoal}
                  onReopenGoal={reopenGoal}
                  onNudgeGoal={nudgeGoal}
                  onDeleteGoal={deleteGoal}
                  onCreateTask={createTask}
                  busy={saving}
                />
              );
            })}
          </div>

          {orphanTasks.length > 0 && (
            <div className="rounded-lg border border-dashed border-border/60 bg-card">
              <div className="flex items-center gap-2 px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Wrench className="h-3 w-3" />
                work items without a goal
              </div>
              <div className="border-t border-border/30">
                {orphanTasks.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    presentation={presentations.get(task.id) || { label: '', dotClass: '', action: null }}
                    onClick={() => openTaskDetail(task)}
                    onStart={(mode) => startTask(task.id, mode)}
                    onWatch={() => watchTask(task)}
                    onUnblock={() => unblockTask(task.id)}
                    busy={!!saving && saving.startsWith(`task:${task.id}:`)}
                  />
                ))}
              </div>
            </div>
          )}

          {doneGoals.length > 0 && (!taskFilter || doneGoals.some(g => (tasksByGoal.get(g.id) || []).length > 0)) && (
            <>
              <Separator />
              <div className="space-y-0.5">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  completed goals
                </div>
                {doneGoals.map(goal => {
                  const goalTasks = tasksByGoal.get(goal.id) || [];
                  const allGoalTasks = tasks.filter(t => t.goalId === goal.id);
                  if (taskFilter && goalTasks.length === 0) return null;
                  return (
                    <GoalSection
                      key={goal.id}
                      goal={goal}
                      tasks={goalTasks}
                      allTasks={allGoalTasks}
                      presentations={presentations}
                      defaultOpen={false}
                      filtered={!!taskFilter}
                      onTaskClick={openTaskDetail}
                      onStartTask={startTask}
                      onWatchTask={watchTask}
                      onUnblockTask={unblockTask}
                      onToggleGoalStatus={toggleGoalStatus}
                      onCompleteGoal={completeGoal}
                      onDeleteGoal={deleteGoal}
                      onCreateTask={createTask}
                      busy={saving}
                    />
                  );
                })}
              </div>
            </>
          )}

        </div>
      </ScrollArea>

      <TaskDetailSheet
        task={selectedTask}
        presentation={selectedTask ? presentations.get(selectedTask.id) || null : null}
        goals={goals}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        gateway={gateway}
        onSave={saveTask}
        onBlock={blockTask}
        onDelete={deleteTask}
        onViewPlan={openPlan}
        onViewSession={watchTask}
        busy={!!saving && !!selectedTask && saving.startsWith(`task:${selectedTask.id}:`)}
      />

      <PlanDialog
        task={planTask}
        open={planOpen}
        onOpenChange={setPlanOpen}
        gateway={gateway}
        onSaved={load}
      />
    </>
  );
}
