import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../styles/theme';

export type JsonPath = (string | number)[];

interface NodeProps {
  data: unknown;
  path: JsonPath;
  focusPath: JsonPath;
  keyName?: string | number;
  isLast: boolean;
  depth: number;
}

function pathsEqual(a: JsonPath, b: JsonPath): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function isFocusAncestor(currentPath: JsonPath, focusPath: JsonPath): boolean {
  if (currentPath.length >= focusPath.length) return false;
  return currentPath.every((v, i) => v === focusPath[i]);
}

const LB = '{';
const RB = '}';

function Primitive({ value, comma }: { value: unknown; comma: boolean }) {
  let color = '#9CA3AF';
  let display: string;

  if (typeof value === 'string') {
    color = '#86EFAC'; // green
    display = `"${value}"`;
  } else if (typeof value === 'number') {
    color = '#93C5FD'; // blue
    display = String(value);
  } else if (typeof value === 'boolean') {
    color = '#FCA5A5'; // red
    display = String(value);
  } else if (value === null) {
    color = '#FCA5A5';
    display = 'null';
  } else {
    display = String(value);
  }

  return (
    <span>
      <span style={{ color }}>{display}</span>
      {comma && <span style={{ color: '#6B7280' }}>,</span>}
    </span>
  );
}

function JsonNode({ data, path, focusPath, keyName, isLast, depth }: NodeProps) {
  const focused = pathsEqual(path, focusPath);
  const isAncestor = isFocusAncestor(path, focusPath);
  const [open, setOpen] = useState(focused || isAncestor);
  const focusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focused && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focused]);

  const indent = depth * 16;
  const keyLabel = keyName !== undefined
    ? <span style={{ color: '#94A3B8' }}>"{keyName}": </span>
    : null;
  const comma = !isLast ? <span style={{ color: '#6B7280' }}>,</span> : null;

  const focusStyle: React.CSSProperties = focused
    ? { background: 'rgba(245, 158, 11, 0.18)', borderRadius: 4, outline: '1px solid rgba(245,158,11,0.5)' }
    : {};

  if (Array.isArray(data)) {
    const isEmpty = data.length === 0;
    return (
      <div ref={focused ? focusRef : undefined} style={{ ...focusStyle }}>
        <div style={{ paddingLeft: indent, display: 'flex', alignItems: 'baseline', gap: 2 }}>
          <button
            onClick={() => setOpen((o) => !o)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#6B7280', fontSize: 10, padding: '0 3px', lineHeight: 1,
            }}
          >
            {open ? '▼' : '▶'}
          </button>
          {keyLabel}
          <span style={{ color: '#6B7280' }}>[</span>
          {!open && (
            <>
              <span style={{ color: '#6B7280', fontSize: 11 }}> {data.length} item{data.length !== 1 ? 's' : ''} </span>
              <span style={{ color: '#6B7280' }}>]</span>
              {comma}
            </>
          )}
          {open && isEmpty && (
            <>
              <span style={{ color: '#6B7280' }}>]</span>
              {comma}
            </>
          )}
        </div>
        {open && !isEmpty && (
          <>
            {data.map((item, idx) => (
              <JsonNode
                key={idx}
                data={item}
                path={[...path, idx]}
                focusPath={focusPath}
                keyName={undefined}
                isLast={idx === data.length - 1}
                depth={depth + 1}
              />
            ))}
            <div style={{ paddingLeft: indent }}>
              <span style={{ color: '#6B7280' }}>]</span>
              {comma}
            </div>
          </>
        )}
      </div>
    );
  }

  if (data !== null && typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    const isEmpty = entries.length === 0;
    return (
      <div ref={focused ? focusRef : undefined} style={{ ...focusStyle }}>
        <div style={{ paddingLeft: indent, display: 'flex', alignItems: 'baseline', gap: 2 }}>
          <button
            onClick={() => setOpen((o) => !o)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#6B7280', fontSize: 10, padding: '0 3px', lineHeight: 1,
            }}
          >
            {open ? '▼' : '▶'}
          </button>
          {keyLabel}
          <span style={{ color: '#6B7280' }}>{LB}</span>
          {!open && (
            <>
              <span style={{ color: '#6B7280', fontSize: 11 }}>
                {' '}{entries.map(([k]) => k).slice(0, 3).join(', ')}{entries.length > 3 ? ', …' : ''}{' '}
              </span>
              <span style={{ color: '#6B7280' }}>{RB}</span>
              {comma}
            </>
          )}
          {open && isEmpty && (
            <>
              <span style={{ color: '#6B7280' }}>{RB}</span>
              {comma}
            </>
          )}
        </div>
        {open && !isEmpty && (
          <>
            {entries.map(([k, v], idx) => (
              <JsonNode
                key={k}
                data={v}
                path={[...path, k]}
                focusPath={focusPath}
                keyName={k}
                isLast={idx === entries.length - 1}
                depth={depth + 1}
              />
            ))}
            <div style={{ paddingLeft: indent }}>
              <span style={{ color: '#6B7280' }}>{RB}</span>
              {comma}
            </div>
          </>
        )}
      </div>
    );
  }

  // Primitive
  return (
    <div
      ref={focused ? focusRef : undefined}
      style={{ paddingLeft: indent + 18, ...focusStyle }}
    >
      {keyLabel}
      <Primitive value={data} comma={!isLast} />
    </div>
  );
}

interface Props {
  data: unknown;
  focusPath: JsonPath;
}

export function FoldingJsonViewer({ data, focusPath }: Props) {
  const th = useTheme();
  return (
    <div style={{
      fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7,
      color: th.textSecondary, padding: '8px 0',
    }}>
      <JsonNode
        data={data}
        path={[]}
        focusPath={focusPath}
        isLast={true}
        depth={0}
      />
    </div>
  );
}
