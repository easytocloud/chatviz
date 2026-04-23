import type { APIFamily, MessageType } from '../types';

export const MESSAGE_COLORS: Record<MessageType, string> = {
  system:      '#8B5CF6',
  user:        '#3B82F6',
  assistant:   '#10B981',
  tool_use:    '#F59E0B',
  tool_result: '#6B7280',
};

export const FAMILY_COLORS: Record<APIFamily, string> = {
  anthropic: '#D97706',
  openai:    '#059669',
  ollama:    '#DC2626',
};

export const DIRECTION_OPACITY: Record<string, number> = {
  request:  0.7,
  response: 1.0,
};
