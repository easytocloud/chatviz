import type { APIFamily } from '../types';
import { FAMILY_COLORS } from '../styles/colors';

interface Props {
  family: APIFamily;
  model: string;
}

export function ModelBadge({ family, model }: Props) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 11 }}>
      <span style={{
        background: FAMILY_COLORS[family],
        color: '#fff',
        padding: '1px 6px',
        borderRadius: 4,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}>
        {family}
      </span>
      <span style={{ color: '#9CA3AF', fontFamily: 'monospace' }}>{model}</span>
    </span>
  );
}
