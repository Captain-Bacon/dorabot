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
  const [showPulseModes, setShowPulseModes] = useState(false);
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
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[9px] h-4 px-1.5 border-0 ${MODE_LABELS[currentMode].color}`}>
                        {MODE_LABELS[currentMode].label}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {pulse.interval} • {MODE_LABELS[currentMode].description}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2 ml-auto"
                        onClick={runPulseNow}
                        disabled={pulseRunning}
                      >
                        <Play className="w-3 h-3 mr-1" />run now
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-x-4 text-[10px] text-muted-foreground">
                      {pulse.lastRunAt && <span>last: {formatRelativeTime(pulse.lastRunAt)}</span>}
                      {pulse.nextRunAt && <span>next: {formatTime(pulse.nextRunAt)}</span>}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-2 gap-1"
                        onClick={() => {
                          setShowPulseModes(!showPulseModes);
                          if (!showPulseModes) setShowPulseSchedule(false);
                        }}
                      >
                        <Activity className="w-3 h-3" />
                        {showPulseModes ? 'hide' : 'modes'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-2 gap-1"
                        onClick={() => {
                          setShowPulseSchedule(!showPulseSchedule);
                          if (!showPulseSchedule) setShowPulseModes(false);
                        }}
                      >
                        <Timer className="w-3 h-3" />
                        {showPulseSchedule ? 'hide' : 'schedule'}
                      </Button>
                    </div>
                  </div>

                  {showPulseModes && <PulseModeSettings gateway={gateway} />}
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

type PulseSlot = {
  mode: string;
  days: number[];
  start: number;
  end: number;
};

function PulseScheduleSettings({ gateway, currentMode }: { gateway: ReturnType<typeof useGateway>; currentMode: 'working' | 'offpeak' | 'overnight' }) {
  const [slots, setSlots] = useState<PulseSlot[]>([]);
  const [modes, setModes] = useState<Record<string, any>>({});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [creatingSlot, setCreatingSlot] = useState(false);
  const [formData, setFormData] = useState({
    mode: '',
    days: [] as number[],
    start: 9,
    end: 18
  });

  const loadSlots = useCallback(async () => {
    if (gateway.connectionState !== 'connected') return;
    try {
      const result = await gateway.rpc('pulseSchedule.slots.list') as PulseSlot[];
      setSlots(result);
    } catch (err) {
      console.error('failed to load slots:', err);
    }
  }, [gateway.connectionState, gateway.rpc]);

  const loadModes = useCallback(async () => {
    if (gateway.connectionState !== 'connected') return;
    try {
      const result = await gateway.rpc('pulseSchedule.modes.list') as Record<string, any>;
      setModes(result);
    } catch (err) {
      console.error('failed to load modes:', err);
    }
  }, [gateway.connectionState, gateway.rpc]);

  useEffect(() => {
    loadSlots();
    loadModes();
  }, [loadSlots, loadModes]);

  const resetForm = () => {
    setFormData({ mode: '', days: [], start: 9, end: 18 });
    setEditingIndex(null);
    setCreatingSlot(false);
  };

  const addSlot = async () => {
    try {
      await gateway.rpc('pulseSchedule.slots.add', formData);
      await loadSlots();
      resetForm();
    } catch (err) {
      alert((err as Error).message || 'Failed to add slot');
    }
  };

  const updateSlot = async (index: number) => {
    try {
      await gateway.rpc('pulseSchedule.slots.update', { index, ...formData });
      await loadSlots();
      resetForm();
    } catch (err) {
      alert((err as Error).message || 'Failed to update slot');
    }
  };

  const deleteSlot = async (index: number) => {
    if (!confirm('Delete this time block?')) return;
    try {
      await gateway.rpc('pulseSchedule.slots.delete', { index });
      await loadSlots();
    } catch (err) {
      alert((err as Error).message || 'Failed to delete slot');
    }
  };

  const startEdit = (index: number) => {
    const slot = slots[index];
    setFormData({
      mode: slot.mode,
      days: slot.days,
      start: slot.start,
      end: slot.end
    });
    setEditingIndex(index);
    setCreatingSlot(false);
  };

  const startCreate = () => {
    setFormData({ mode: Object.keys(modes)[0] || '', days: [1, 2, 3, 4, 5], start: 9, end: 18 });
    setCreatingSlot(true);
    setEditingIndex(null);
  };

  const formatDays = (days: number[]): string => {
    if (days.length === 7) return 'every day';
    if (days.length === 5 && days.every(d => d >= 1 && d <= 5)) return 'Mon-Fri';
    if (days.length === 2 && days.includes(6) && days.includes(7)) return 'Sat-Sun';

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map(d => dayNames[d - 1]).join(', ');
  };

  const formatTimeRange = (start: number, end: number): string => {
    const fmt = (h: number) => {
      const suffix = h >= 12 ? 'pm' : 'am';
      const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${display}${suffix}`;
    };

    if (start === 0 && end === 24) return 'all day';
    return `${fmt(start)}-${fmt(end)}`;
  };

  const toggleDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter(d => d !== day)
        : [...prev.days, day].sort((a, b) => a - b)
    }));
  };

  const canSubmit = formData.mode && formData.days.length > 0;

  return (
    <div className="space-y-3 pt-2 border-t border-border">
      <div className="text-[10px] text-muted-foreground bg-muted/30 rounded px-2 py-1.5">
        Current: {MODE_LABELS[currentMode]?.label || currentMode}
      </div>

      {(creatingSlot || editingIndex !== null) && (
        <Card className="border-primary/50">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold">{creatingSlot ? 'Add time block' : 'Edit time block'}</span>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={resetForm}>
                <X className="w-3 h-3" />
              </Button>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">days</Label>
              <div className="flex gap-1">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
                  <Button
                    key={day}
                    variant={formData.days.includes(i + 1) ? 'default' : 'outline'}
                    size="sm"
                    className="h-6 text-[10px] px-1 flex-1"
                    onClick={() => toggleDay(i + 1)}
                  >
                    {day[0]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">time range</Label>
              <div className="flex items-center gap-2">
                <Select value={String(formData.start)} onValueChange={v => setFormData({ ...formData, start: parseInt(v) })}>
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
                <Select value={String(formData.end)} onValueChange={v => setFormData({ ...formData, end: parseInt(v) })}>
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
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">mode</Label>
              <Select value={formData.mode} onValueChange={v => setFormData({ ...formData, mode: v })}>
                <SelectTrigger className="h-7 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(modes).map(([name, mode]: [string, any]) => (
                    <SelectItem key={name} value={name} className="text-[11px]">
                      {name} ({mode.interval} • {mode.priorityLevel || 'full'}{mode.description ? ` • ${mode.description}` : ''})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-1.5 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] px-2 flex-1"
                onClick={resetForm}
              >
                cancel
              </Button>
              <Button
                size="sm"
                className="h-6 text-[11px] px-2 flex-1"
                onClick={() => creatingSlot ? addSlot() : updateSlot(editingIndex!)}
                disabled={!canSubmit}
              >
                {creatingSlot ? 'add' : 'save'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-1.5">
        {slots.map((slot, i) => (
          <div key={i} className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/30 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold truncate">
                {formatDays(slot.days)} {formatTimeRange(slot.start, slot.end)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {slot.mode}{modes[slot.mode] ? ` • ${modes[slot.mode].interval} • ${modes[slot.mode].priorityLevel}` : ''}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => startEdit(i)}
            >
              edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2 text-destructive hover:text-destructive"
              onClick={() => deleteSlot(i)}
            >
              delete
            </Button>
          </div>
        ))}
      </div>

      {!creatingSlot && editingIndex === null && (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-7 text-[11px]"
          onClick={startCreate}
        >
          <Plus className="w-3 h-3 mr-1" />
          add time block
        </Button>
      )}
    </div>
  );
}

function PulseModeSettings({ gateway }: { gateway: ReturnType<typeof useGateway> }) {
  const [modes, setModes] = useState<Record<string, { interval?: string; priorityLevel?: string; description?: string; hours?: { start: number; end: number }; customPrompt?: string }>>({});
  const [editingMode, setEditingMode] = useState<string | null>(null);
  const [creatingMode, setCreatingMode] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({ name: '', interval: '30m', priorityLevel: 'full', description: '', customPrompt: '' });

  const loadModes = useCallback(async () => {
    if (gateway.connectionState !== 'connected') return;
    try {
      const result = await gateway.rpc('pulseSchedule.modes.list') as Record<string, any>;
      setModes(result);
    } catch (err) {
      console.error('failed to load modes:', err);
    }
  }, [gateway.connectionState, gateway.rpc]);

  const loadTemplates = useCallback(async () => {
    if (gateway.connectionState !== 'connected') return;
    try {
      const result = await gateway.rpc('pulseSchedule.templates.get') as Record<string, string>;
      setTemplates(result);
    } catch (err) {
      console.error('failed to load templates:', err);
    }
  }, [gateway.connectionState, gateway.rpc]);

  useEffect(() => {
    loadModes();
    loadTemplates();
  }, [loadModes, loadTemplates]);

  const resetForm = () => {
    setFormData({ name: '', interval: '30m', priorityLevel: 'full', description: '', customPrompt: '' });
    setEditingMode(null);
    setCreatingMode(false);
    setEditingPrompt(null);
  };

  const createMode = async () => {
    try {
      await gateway.rpc('pulseSchedule.modes.add', formData);
      await loadModes();
      resetForm();
    } catch (err) {
      alert((err as Error).message || 'Failed to create mode');
    }
  };

  const updateMode = async (oldName: string) => {
    try {
      await gateway.rpc('pulseSchedule.modes.update', { oldName, ...formData });
      await loadModes();
      resetForm();
    } catch (err) {
      alert((err as Error).message || 'Failed to update mode');
    }
  };

  const deleteMode = async (name: string) => {
    if (!confirm(`Delete mode "${name}"?`)) return;
    try {
      await gateway.rpc('pulseSchedule.modes.delete', { name });
      await loadModes();
    } catch (err) {
      alert((err as Error).message || 'Failed to delete mode');
    }
  };

  const startEdit = (name: string) => {
    const mode = modes[name];
    setFormData({
      name,
      interval: mode.interval || '30m',
      priorityLevel: mode.priorityLevel || 'full',
      description: mode.description || '',
      customPrompt: mode.customPrompt || '',
    });
    setEditingMode(name);
    setCreatingMode(false);
  };

  const startCreate = () => {
    setFormData({ name: '', interval: '30m', priorityLevel: 'full', description: '', customPrompt: '' });
    setCreatingMode(true);
    setEditingMode(null);
  };

  const startEditPrompt = (modeName: string) => {
    const mode = modes[modeName];
    setFormData({
      name: modeName,
      interval: mode.interval || '30m',
      priorityLevel: mode.priorityLevel || 'full',
      description: mode.description || '',
      customPrompt: mode.customPrompt || '',
    });
    setEditingPrompt(modeName);
  };

  const loadTemplate = (level: string) => {
    if (templates[level]) {
      setFormData({ ...formData, customPrompt: templates[level] });
    }
  };

  const getModeIcon = (priorityLevel: string) => {
    if (priorityLevel === 'full') return '🟢';
    if (priorityLevel === 'reduced') return '🟡';
    return '🔵';
  };

  const canSubmit = creatingMode ? formData.name && formData.interval && formData.priorityLevel : formData.interval && formData.priorityLevel;

  return (
    <div className="space-y-3 pt-2 border-t border-border">
      <div className="text-[10px] text-muted-foreground bg-muted/30 rounded px-2 py-1.5">
        Manage pulse modes. Assign different intervals and priority levels for different contexts.
      </div>

      {(creatingMode || editingMode) && (
        <Card className="border-primary/50">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold">{creatingMode ? 'Create mode' : `Edit: ${editingMode}`}</span>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={resetForm}>
                <X className="w-3 h-3" />
              </Button>
            </div>

            {creatingMode && (
              <div className="space-y-1">
                <Label className="text-[10px]">name</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="weekend-research"
                  className="h-7 text-xs"
                />
                <span className="text-[9px] text-muted-foreground">alphanumeric + hyphens, max 20 chars</span>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-[10px]">interval</Label>
              <Select value={formData.interval} onValueChange={v => setFormData({ ...formData, interval: v })}>
                <SelectTrigger className="h-7 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PULSE_INTERVALS.map(iv => (
                    <SelectItem key={iv} value={iv} className="text-[11px]">{iv}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">priority level</Label>
              <Select value={formData.priorityLevel} onValueChange={v => setFormData({ ...formData, priorityLevel: v })}>
                <SelectTrigger className="h-7 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full" className="text-[11px]">🟢 full</SelectItem>
                  <SelectItem value="reduced" className="text-[11px]">🟡 reduced</SelectItem>
                  <SelectItem value="minimal" className="text-[11px]">🔵 minimal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">description (optional)</Label>
              <Input
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Focus time"
                className="h-7 text-xs"
                maxLength={100}
              />
            </div>

            <div className="flex gap-1.5 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] px-2 flex-1"
                onClick={resetForm}
              >
                cancel
              </Button>
              <Button
                size="sm"
                className="h-6 text-[11px] px-2 flex-1"
                onClick={() => creatingMode ? createMode() : updateMode(editingMode!)}
                disabled={!canSubmit}
              >
                {creatingMode ? 'create' : 'save'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {editingPrompt && (
        <Card className="border-primary/50">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold">Edit prompt: {editingPrompt}</span>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={resetForm}>
                <X className="w-3 h-3" />
              </Button>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">load built-in template (optional)</Label>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2 flex-1"
                  onClick={() => loadTemplate('full')}
                >
                  🟢 full
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2 flex-1"
                  onClick={() => loadTemplate('reduced')}
                >
                  🟡 reduced
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2 flex-1"
                  onClick={() => loadTemplate('minimal')}
                >
                  🔵 minimal
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">custom priority template</Label>
              <Textarea
                value={formData.customPrompt}
                onChange={e => setFormData({ ...formData, customPrompt: e.target.value })}
                placeholder="Leave empty to use built-in template based on priority level"
                rows={12}
                className="text-xs font-mono"
              />
              <span className="text-[9px] text-muted-foreground">
                Custom prompt overrides the priority level template. Clear to use built-in.
              </span>
            </div>

            <div className="flex gap-1.5 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] px-2 flex-1"
                onClick={resetForm}
              >
                cancel
              </Button>
              <Button
                size="sm"
                className="h-6 text-[11px] px-2 flex-1"
                onClick={() => {
                  updateMode(editingPrompt);
                  setEditingPrompt(null);
                }}
              >
                save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!editingPrompt && (
        <div className="space-y-1.5">
          {Object.entries(modes).map(([name, mode]) => (
            <div key={name} className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/30 transition-colors">
              <span className="text-sm">{getModeIcon(mode.priorityLevel || 'full')}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold truncate">
                  {name}
                  {mode.customPrompt && <Badge variant="outline" className="text-[8px] h-3 px-1 ml-1.5">custom</Badge>}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {mode.interval} • {mode.priorityLevel || 'full'}{mode.description ? ` • ${mode.description}` : ''}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => startEditPrompt(name)}
              >
                prompt
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => startEdit(name)}
              >
                edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-2 text-destructive hover:text-destructive"
                onClick={() => deleteMode(name)}
              >
                delete
              </Button>
            </div>
          ))}
        </div>
      )}

      {!creatingMode && !editingMode && (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-7 text-[11px]"
          onClick={startCreate}
        >
          <Plus className="w-3 h-3 mr-1" />
          create mode
        </Button>
      )}
    </div>
  );
}
