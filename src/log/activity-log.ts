export interface LogEntry {
  time: string;
  level: 'info' | 'error';
  message: string;
}

const entries: LogEntry[] = [];
const listeners = new Set<(entries: LogEntry[]) => void>();

export function log(message: string, level: 'info' | 'error' = 'info'): void {
  entries.push({ time: new Date().toISOString(), level, message });
  for (const listener of listeners) {
    listener(entries);
  }
}

export function getLogEntries(): LogEntry[] {
  return [...entries];
}

export function clearLog(): void {
  entries.length = 0;
  for (const listener of listeners) {
    listener(entries);
  }
}

export function onLogChange(listener: (entries: LogEntry[]) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
