import { useState, useEffect, useCallback } from 'react';
import type { useGateway } from '../hooks/useGateway';
import type { CalendarItem } from '../../../src/calendar/scheduler';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Plus, X, Play, Pause, Trash2, ChevronDown, ChevronRight, Clock, Zap, Activity, Radio, Timer } from 'lucide-react';

const PULSE_SCHEDULE_ID = 'autonomy-pulse';
const PULSE_INTERVALS = ['15m', '30m', '1h', '2h', '4h', '6h', '8h'];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const suffix = i >= 12 ? 'PM' : 'AM';
  const display = i === 0 ? 12 : i > 12 ? i - 12 : i;
  return { value: String(i), label: `${display}:00 ${suffix}` };
});

const TIMEZONES = [
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Pacific/Auckland',
];

function detectCurrentMode(schedule: { timezone?: string; workingHours?: { start: number; end: number }; offPeakHours?: { start: number; end: number } } | undefined): 'working' | 'offpeak' | 'overnight' {
  const tz = schedule?.timezone || 'UTC';
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz });
  const hour = parseInt(formatter.format(now), 10);

  const workingStart = schedule?.workingHours?.start ?? 9;
  const workingEnd = schedule?.workingHours?.end ?? 18;
  const offPeakStart = schedule?.offPeakHours?.start ?? 18;
  const offPeakEnd = schedule?.offPeakHours?.end ?? 23;

  if (hour >= workingStart && hour < workingEnd) return 'working';
  if (hour >= offPeakStart && hour < offPeakEnd) return 'offpeak';
  return 'overnight';
}

const MODE_LABELS: Record<string, { label: string; color: string; description: string }> = {
  working: { label: 'Working', color: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30', description: 'Full engagement: all priorities, proactive proposals' },
  offpeak: { label: 'Off-peak', color: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30', description: 'Reduced: core priorities only, fewer proposals' },
  overnight: { label: 'Overnight', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30', description: 'Minimal: critical items only' },
};

type PulseStatus = {
  enabled: boolean;
  interval: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

type AutomationsProps = {
  gateway: ReturnType<typeof useGateway>;
};

export function Automations({ gateway }: AutomationsProps) {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [pulse, setPulse] = useState<PulseStatus>({ enabled: false, interval: '30m', lastRunAt: null, nextRunAt: null });
  const [pulseLoading, setPulseLoading] = useState(false);
  const [pulseRunning, setPulseRunning] = useState(false);
  const [pulseRunStartedAt, setPulseRunStartedAt] = useState<number | null>(null);
  const [showPulseSchedule, setShowPulseSchedule] = useState(false);
  const [currentMode, setCurrentMode] = useState<'working' | 'offpeak' | 'overnight'>('working');
  const [newItem, setNewItem] = useState({
    summary: '',
    message: '',
    type: 'reminder' as 'event' | 'todo' | 'reminder',
    dtstart: '',
    rrule: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const hasConnectedChannel = gateway.channelStatuses?.some(s => s.connected) ?? false;

  const loadPulseStatus = useCallback(async () => {
    if (gateway.connectionState !== 'connected') return;
    try {
      const result = await gateway.rpc('pulse.status') as PulseStatus;
      setPulse(result);
    } catch {
      // pulse rpc not available yet
    }
  }, [gateway.connectionState, gateway.rpc]);

  const loadItems = useCallback(async () => {
    if (gateway.connectionState !== 'connected') return;
    try {
      const result = await gateway.rpc('cron.list');
      if (Array.isArray(result)) setItems(result.filter((i: CalendarItem) => i.id !== PULSE_SCHEDULE_ID));
      setLoading(false);
    } catch (err) {
      console.error('failed to load schedule:', err);
      setLoading(false);
    }
  }, [gateway.connectionState, gateway.rpc]);

  useEffect(() => {
    loadItems();
    loadPulseStatus();
  }, [loadItems, loadPulseStatus]);

  // detect current pulse mode
  useEffect(() => {
    const cfg = gateway.configData as Record<string, any> | null;
    const schedule = cfg?.pulseSchedule;
    setCurrentMode(detectCurrentMode(schedule));
    const interval = setInterval(() => setCurrentMode(detectCurrentMode(schedule)), 60000);
    return () => clearInterval(interval);
  }, [gateway.configData]);

  // refresh pulse status when calendar runs happen
  useEffect(() => {
    if (gateway.calendarRuns && gateway.calendarRuns.length > 0) {
      loadPulseStatus();
    }
  }, [gateway.calendarRuns, loadPulseStatus]);

  useEffect(() => {
    if (!pulseRunning || !pulseRunStartedAt) return;
    const completed = gateway.calendarRuns.some(
      run => run.item === PULSE_SCHEDULE_ID && run.timestamp >= pulseRunStartedAt,
    );
    if (!completed) return;
    setPulseRunning(false);
    setPulseRunStartedAt(null);
  }, [gateway.calendarRuns, pulseRunning, pulseRunStartedAt]);

  const togglePulse = async () => {
    setPulseLoading(true);
    try {
      const newMode = pulse.enabled ? 'supervised' : 'autonomous';
      await gateway.rpc('config.set', { key: 'autonomy', value: newMode });
      // give scheduler a moment to create/remove the item
      await new Promise(r => setTimeout(r, 200));
      await loadPulseStatus();
      await loadItems();
    } catch (err) {
      console.error('failed to toggle pulse:', err);
    } finally {
      setPulseLoading(false);
    }
  };

  const setPulseInterval = async (interval: string) => {
    try {
      await gateway.rpc('pulse.setInterval', { interval });
      setPulse(prev => ({ ...prev, interval }));
    } catch (err) {
      console.error('failed to set pulse interval:', err);
    }
  };

  const runPulseNow = async () => {
    try {
      setPulseRunning(true);
      setPulseRunStartedAt(Date.now());
      await gateway.rpc('cron.run', { id: PULSE_SCHEDULE_ID });
    } catch (err) {
      console.error('failed to run pulse:', err);
      setPulseRunning(false);
      setPulseRunStartedAt(null);
    }
  };

  const resetForm = () => {
    setNewItem({
      summary: '',
      message: '',
      type: 'reminder',
      dtstart: '',
      rrule: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setShowAddForm(false);
  };

  const addItem = async () => {
    const data: Record<string, unknown> = {
      summary: newItem.summary || 'Unnamed',
      message: newItem.message,
      type: newItem.type,
      dtstart: newItem.dtstart ? new Date(newItem.dtstart).toISOString() : new Date().toISOString(),
      timezone: newItem.timezone,
      enabled: true,
    };

    if (newItem.rrule) {
      data.rrule = newItem.rrule;
    }

    if (newItem.type === 'reminder' && !newItem.rrule) {
      data.deleteAfterRun = true;
    }

    try {
      await gateway.rpc('cron.add', data);
      resetForm();
      setTimeout(loadItems, 100);
    } catch (err) {
      console.error('failed to add item:', err);
    }
  };

  const toggleItem = async (id: string) => {
    try {
      await gateway.rpc('cron.toggle', { id });
      setTimeout(loadItems, 100);
    } catch (err) {
      console.error('failed to toggle item:', err);
    }
  };

  const runItemNow = async (id: string) => {
    try {
      await gateway.rpc('cron.run', { id });
      setTimeout(loadItems, 500);
    } catch (err) {
      console.error('failed to run item:', err);
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await gateway.rpc('cron.remove', { id });
      setTimeout(loadItems, 100);
    } catch (err) {
      console.error('failed to delete item:', err);
    }
  };

  const formatSchedule = (item: CalendarItem) => {
    if (item.rrule) return item.rrule;
    return `at ${item.dtstart}`;
  };

  const formatTime = (iso?: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const formatRelativeTime = (iso: string | null) => {
    if (!iso) return null;
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return formatTime(iso);
  };

  const canSubmit = newItem.message && newItem.dtstart;

  if (gateway.connectionState !== 'connected') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <Zap className="w-6 h-6 opacity-40" />
        <span className="text-sm">connecting...</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
        <span className="font-semibold text-sm">Automations</span>
        <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
        <Button
          variant={showAddForm ? 'outline' : 'default'}
          size="sm"
          className="ml-auto h-6 text-[11px] px-2"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? <><X className="w-3 h-3 mr-1" />cancel</> : <><Plus className="w-3 h-3 mr-1" />new</>}
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          {/* pulse card */}
          <Card className={cn('transition-colors', pulse.enabled && 'border-primary/30')}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Activity className={cn('w-4 h-4', pulse.enabled ? 'text-primary' : 'text-muted-foreground')} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Pulse</span>
                    {pulseRunning && (
                      <Badge className="text-[9px] h-4 animate-pulse bg-primary/20 text-primary border-primary/30">running</Badge>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">dorabot thinks on its own periodically</span>
                </div>
                <Switch
                  checked={pulse.enabled}
                  onCheckedChange={togglePulse}
                  disabled={pulseLoading}
                />
              </div>

              {pulse.enabled && (
                <>
                  <div className="flex items-center gap-3">
                    <Label className="text-[11px] text-muted-foreground w-16">every</Label>
                    <Select value={pulse.interval} onValueChange={setPulseInterval}>
                      <SelectTrigger className="h-7 text-[11px] w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PULSE_INTERVALS.map(iv => (
                          <SelectItem key={iv} value={iv} className="text-[11px]">{iv}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] px-2 ml-auto"
                      onClick={runPulseNow}
                      disabled={pulseRunning}
                    >
                      <Play className="w-3 h-3 mr-1" />run now
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-x-4 text-[10px] text-muted-foreground">
                      {pulse.lastRunAt && <span>last: {formatRelativeTime(pulse.lastRunAt)}</span>}
                      {pulse.nextRunAt && <span>next: {formatTime(pulse.nextRunAt)}</span>}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-2 gap-1"
                      onClick={() => setShowPulseSchedule(!showPulseSchedule)}
                    >
                      <Timer className="w-3 h-3" />
                      {showPulseSchedule ? 'hide' : 'schedule'}
                      <Badge className={`text-[8px] h-3.5 px-1 border-0 ${MODE_LABELS[currentMode].color}`}>
                        {MODE_LABELS[currentMode].label}
                      </Badge>
                    </Button>
                  </div>

                  {showPulseSchedule && <PulseScheduleSettings gateway={gateway} currentMode={currentMode} />}

                  {!hasConnectedChannel && (
                    <div className="flex items-center gap-2 p-2 rounded bg-warning/10 border border-warning/20">
                      <Radio className="w-3.5 h-3.5 text-warning shrink-0" />
                      <span className="text-[11px] text-warning">connect WhatsApp or Telegram so dorabot can reach you during pulses</span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {showAddForm && (
            <Card className="border-primary/50">
              <CardContent className="p-4 space-y-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">summary</Label>
                  <Input
                    value={newItem.summary}
                    onChange={e => setNewItem({ ...newItem, summary: e.target.value })}
                    placeholder="daily standup reminder"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">message / task</Label>
                  <Textarea
                    value={newItem.message}
                    onChange={e => setNewItem({ ...newItem, message: e.target.value })}
                    placeholder="check project status and send update"
                    rows={3}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">type</Label>
                  <div className="flex gap-1.5">
                    {(['reminder', 'event', 'todo'] as const).map(type => (
                      <Button
                        key={type}
                        variant={newItem.type === type ? 'default' : 'outline'}
                        size="sm"
                        className="h-6 text-[11px] px-2"
                        onClick={() => setNewItem({ ...newItem, type })}
                      >
                        {type}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">start date/time</Label>
                  <Input
                    type="datetime-local"
                    value={newItem.dtstart}
                    onChange={e => setNewItem({ ...newItem, dtstart: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>

                {newItem.type !== 'reminder' && (
                  <div className="space-y-1">
                    <Label className="text-[11px]">recurrence (RRULE)</Label>
                    <Input
                      value={newItem.rrule}
                      onChange={e => setNewItem({ ...newItem, rrule: e.target.value })}
                      placeholder="FREQ=DAILY;BYHOUR=9;BYMINUTE=0"
                      className="h-8 text-xs font-mono"
                    />
                    <span className="text-[10px] text-muted-foreground">RFC 5545 RRULE — e.g. FREQ=WEEKLY;BYDAY=MO,FR</span>
                  </div>
                )}

                <Button
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={addItem}
                  disabled={!canSubmit}
                >
                  create automation
                </Button>
              </CardContent>
            </Card>
          )}

          {items.length === 0 && !pulse.enabled ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Clock className="w-6 h-6 opacity-40" />
              <span className="text-sm">no automations yet</span>
            </div>
          ) : items.length > 0 && (
            <div className="space-y-2">
              {items.map(item => {
                const isExpanded = expandedItem === item.id;
                return (
                  <Collapsible key={item.id} open={isExpanded} onOpenChange={open => setExpandedItem(open ? item.id : null)}>
                    <Card className={cn('transition-colors', isExpanded && 'border-primary/50')}>
                      <CollapsibleTrigger className="w-full">
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={item.enabled === false ? 'outline' : 'default'}
                              className={cn('text-[9px] h-4', item.enabled !== false && 'bg-success/15 text-success border-success/30')}
                            >
                              {item.enabled === false ? 'off' : item.type}
                            </Badge>
                            <span className="text-xs font-semibold flex-1 text-left">{item.summary}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">{formatSchedule(item)}</span>
                            {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                          </div>
                        </CardContent>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-3 pb-3 pt-0 border-t border-border mt-1">
                          <div className="text-xs text-muted-foreground mt-2 mb-2 bg-secondary rounded p-2">
                            {item.message}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground mb-2">
                            {item.nextRunAt && <span>next: {formatTime(item.nextRunAt)}</span>}
                            {item.lastRunAt && <span>last: {formatTime(item.lastRunAt)}</span>}
                            <span>created: {formatTime(item.createdAt)}</span>
                            {item.deleteAfterRun && <Badge variant="outline" className="text-[8px] h-3 px-1">one-shot</Badge>}
                          </div>
                          <div className="flex gap-1.5">
                            <Button variant="outline" size="sm" className="h-6 text-[11px] px-2" onClick={() => toggleItem(item.id)}>
                              {item.enabled === false ? <><Play className="w-3 h-3 mr-1" />enable</> : <><Pause className="w-3 h-3 mr-1" />disable</>}
                            </Button>
                            <Button variant="outline" size="sm" className="h-6 text-[11px] px-2" onClick={() => runItemNow(item.id)}>
                              <Play className="w-3 h-3 mr-1" />run now
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm" className="h-6 text-[11px] px-2">
                                  <Trash2 className="w-3 h-3 mr-1" />delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-sm">delete "{item.summary}"?</AlertDialogTitle>
                                  <AlertDialogDescription className="text-xs">this cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="h-7 text-xs">cancel</AlertDialogCancel>
                                  <AlertDialogAction className="h-7 text-xs" onClick={() => deleteItem(item.id)}>delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function PulseScheduleSettings({ gateway, currentMode }: { gateway: ReturnType<typeof useGateway>; currentMode: 'working' | 'offpeak' | 'overnight' }) {
  const cfg = gateway.configData as Record<string, any> | null;
  const schedule = cfg?.pulseSchedule as {
    timezone?: string;
    modes?: {
      working?: { hours?: { start: number; end: number }; interval?: string };
      offpeak?: { hours?: { start: number; end: number }; interval?: string };
      overnight?: { interval?: string };
    };
    workingHours?: { start: number; end: number };
    offPeakHours?: { start: number; end: number };
  } | undefined;
  const timezone = schedule?.timezone || 'Europe/London';

  // Use new schema if available, fall back to legacy
  const workingStart = schedule?.modes?.working?.hours?.start ?? schedule?.workingHours?.start ?? 9;
  const workingEnd = schedule?.modes?.working?.hours?.end ?? schedule?.workingHours?.end ?? 18;
  const offPeakStart = schedule?.modes?.offpeak?.hours?.start ?? schedule?.offPeakHours?.start ?? 18;
  const offPeakEnd = schedule?.modes?.offpeak?.hours?.end ?? schedule?.offPeakHours?.end ?? 23;

  const workingInterval = schedule?.modes?.working?.interval ?? '30m';
  const offpeakInterval = schedule?.modes?.offpeak?.interval ?? '2h';
  const overnightInterval = schedule?.modes?.overnight?.interval ?? '6h';

  const mode = MODE_LABELS[currentMode];

  const set = useCallback(async (key: string, value: unknown) => {
    try {
      await gateway.rpc('config.set', { key, value });
    } catch (err) {
      console.error(`failed to set ${key}:`, err);
    }
  }, [gateway]);

  const fmtHour = (h: number) => {
    const suffix = h >= 12 ? 'PM' : 'AM';
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${display}:00 ${suffix}`;
  };

  return (
    <div className="space-y-3 pt-2 border-t border-border">
      <div className="text-[10px] text-muted-foreground bg-muted/30 rounded px-2 py-1.5">
        {mode.description}
      </div>

      <div className="space-y-2">
        <Label className="text-[10px] text-muted-foreground">timezone</Label>
        <Select value={timezone} onValueChange={v => set('pulseSchedule.timezone', v)}>
          <SelectTrigger className="h-7 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map(tz => (
              <SelectItem key={tz} value={tz} className="text-[11px]">{tz}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          <Label className="text-[10px] font-medium">working hours</Label>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(workingStart)} onValueChange={v => set('pulseSchedule.modes.working.hours', { start: parseInt(v), end: workingEnd })}>
            <SelectTrigger className="h-7 text-[11px] flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOUR_OPTIONS.map(h => (
                <SelectItem key={h.value} value={h.value} className="text-[11px]">{h.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[10px] text-muted-foreground">to</span>
          <Select value={String(workingEnd)} onValueChange={v => set('pulseSchedule.modes.working.hours', { start: workingStart, end: parseInt(v) })}>
            <SelectTrigger className="h-7 text-[11px] flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOUR_OPTIONS.map(h => (
                <SelectItem key={h.value} value={h.value} className="text-[11px]">{h.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pl-3.5">
          <span className="text-[10px] text-muted-foreground">every</span>
          <Select value={workingInterval} onValueChange={v => set('pulseSchedule.modes.working.interval', v)}>
            <SelectTrigger className="h-7 text-[11px] w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PULSE_INTERVALS.map(iv => (
                <SelectItem key={iv} value={iv} className="text-[11px]">{iv}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />
          <Label className="text-[10px] font-medium">off-peak hours</Label>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(offPeakStart)} onValueChange={v => set('pulseSchedule.modes.offpeak.hours', { start: parseInt(v), end: offPeakEnd })}>
            <SelectTrigger className="h-7 text-[11px] flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOUR_OPTIONS.map(h => (
                <SelectItem key={h.value} value={h.value} className="text-[11px]">{h.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[10px] text-muted-foreground">to</span>
          <Select value={String(offPeakEnd)} onValueChange={v => set('pulseSchedule.modes.offpeak.hours', { start: offPeakStart, end: parseInt(v) })}>
            <SelectTrigger className="h-7 text-[11px] flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOUR_OPTIONS.map(h => (
                <SelectItem key={h.value} value={h.value} className="text-[11px]">{h.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pl-3.5">
          <span className="text-[10px] text-muted-foreground">every</span>
          <Select value={offpeakInterval} onValueChange={v => set('pulseSchedule.modes.offpeak.interval', v)}>
            <SelectTrigger className="h-7 text-[11px] w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PULSE_INTERVALS.map(iv => (
                <SelectItem key={iv} value={iv} className="text-[11px]">{iv}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
          <Label className="text-[10px] font-medium">overnight</Label>
        </div>
        <div className="text-[11px] text-muted-foreground pl-3.5">
          {fmtHour(offPeakEnd)} to {fmtHour(workingStart)} (calculated)
        </div>
        <div className="flex items-center gap-2 pl-3.5">
          <span className="text-[10px] text-muted-foreground">every</span>
          <Select value={overnightInterval} onValueChange={v => set('pulseSchedule.modes.overnight.interval', v)}>
            <SelectTrigger className="h-7 text-[11px] w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PULSE_INTERVALS.map(iv => (
                <SelectItem key={iv} value={iv} className="text-[11px]">{iv}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
