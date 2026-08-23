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
      return { kind, text: formatJson(text) };
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

/**
 * Removes JSON presentation whitespace without re-serializing values. This
 * preserves exact number spellings (including integers beyond Number's safe
 * range) and whitespace inside strings.
 */
export function compactJson(text: string): string {
  JSON.parse(text);
  let result = '';
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
      result += char;
    } else if (char !== ' ' && char !== '\t' && char !== '\r' && char !== '\n') {
      result += char;
    }
  }
  return result;
}

export function formatJson(text: string): string {
  const compact = compactJson(text);
  let result = '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  const indentation = () => '  '.repeat(depth);

  for (let index = 0; index < compact.length; index += 1) {
    const char = compact[index];
    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
    } else if (char === '{' || char === '[') {
      result += char;
      depth += 1;
      const closing = char === '{' ? '}' : ']';
      if (compact[index + 1] !== closing) {
        result += `\n${indentation()}`;
      }
    } else if (char === '}' || char === ']') {
      depth -= 1;
      const opening = char === '}' ? '{' : '[';
      if (compact[index - 1] !== opening) {
        result += `\n${indentation()}`;
      }
      result += char;
    } else if (char === ',') {
      result += `,\n${indentation()}`;
    } else if (char === ':') {
      result += ': ';
    } else {
      result += char;
    }
  }
  return result;
}
