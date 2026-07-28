// Khớp BE: GeminiMessageDto
export interface GeminiMessage {
  role: 'user' | 'model';
  content: string;
}

// Khớp BE: GeminiChatRequestDto
export interface GeminiChatRequest {
  conversationId: string;
  history: GeminiMessage[];
  newMessage: string;
}

// Khớp BE: GeminiChatResponseDto
export interface GeminiChatResponse {
  content: string;
  conversationId: string;
  userMessageId: string;
  aiMessageId: string;
  tokensUsed: number | null;
}

// Khớp BE: GET /api/ai/health
export interface AiHealthStatus {
  available: boolean;
  checkedAt: string; // ISO 8601
}
