export type NodeDataKind = 'json' | 'text' | 'binary';

export interface FormattedData {
  kind: NodeDataKind;
  text: string;
}

export function classifyNodeData(data: Buffer): NodeDataKind {
  if (data.includes(0)) {
    return 'binary';
  }
  const text = data.toString('utf8').trim();
  if (text.length === 0) {
    return 'text';
  }
  try {
    JSON.parse(text);
    return 'json';
  } catch {
    return 'text';
  }
}

export function hexDump(data: Buffer, bytesPerLine = 16): string {
  const lines: string[] = [];
  for (let offset = 0; offset < data.length; offset += bytesPerLine) {
    const chunk = data.subarray(offset, offset + bytesPerLine);
    const hex = [...chunk].map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
    const ascii = [...chunk]
      .map((byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.'))
      .join('');
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(bytesPerLine * 3 - 1, ' ')}  ${ascii}`);
  }
  return lines.join('\n');
}

export function formatData(data: Buffer): FormattedData {
  const kind = classifyNodeData(data);
  if (kind === 'binary') {
    return { kind, text: hexDump(data) };
  }
  const text = data.toString('utf8');
  if (kind === 'json') {
    try {
      return { kind, text: JSON.stringify(JSON.parse(text), null, 2) };
    } catch {
      return { kind, text };
    }
  }
  return { kind, text };
}

export function validateJson(text: string): { valid: true } | { valid: false; error: string } {
  try {
    JSON.parse(text);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}
