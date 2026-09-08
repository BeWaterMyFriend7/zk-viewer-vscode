export function buildNodeDetailTitle(path: string): string {
  const segments = path.split('/').filter(Boolean);
  if (segments.length <= 2) {
    return path;
  }
  return `.../${segments.slice(-2).join('/')}`;
}
