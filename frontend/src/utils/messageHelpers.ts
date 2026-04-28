import type { CapturedMessage } from '../types';

export function isInjected(text: string): boolean {
  const t = text.trimStart();
  if (t.startsWith('<') && /<\w/.test(t)) return true;
  if (/^\[?(INST|SYS|SYSTEM|CONTEXT|RECAP)\b/i.test(t)) return true;
  return false;
}

export function contentPreview(content: CapturedMessage['content']): string {
  if (typeof content === 'string') return content.trimStart();
  if (Array.isArray(content)) {
    const texts = (content as any[])
      .map((b: any) => (b?.text ?? b?.content ?? (typeof b === 'string' ? b : '')).trimStart())
      .filter(Boolean);
    const real = texts.filter((t) => !isInjected(t));
    return (real.length > 0 ? real : texts).join(' ');
  }
  const obj = content as any;
  return (obj?.text ?? obj?.content ?? obj?.name ?? JSON.stringify(content)).trimStart();
}
