export type APIFamily = 'anthropic' | 'openai' | 'ollama';
export type Direction = 'request' | 'response';
export type MessageType = 'system' | 'user' | 'assistant' | 'tool_use' | 'tool_result';

export interface CapturedMessage {
  id: string;
  timestamp: number;
  api_family: APIFamily;
  model: string;
  direction: Direction;
  message_type: MessageType;
  content: string | object | object[];
  mcp_server: string | null;
  stream_complete: boolean;
  request_id: string;
  raw_body: object;
  input_tokens: number | null;
  output_tokens: number | null;
  tool_use_id: string | null;
}
