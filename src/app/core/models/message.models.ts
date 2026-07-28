import { UserBrief } from './auth.models';

export interface Conversation {
  id: string;
  isGroup: boolean;
  groupName: string | null;
  groupAvatarUrl: string | null;
  lastMessageAt: string | null;
  lastMessage: Message | null;
  unreadCount: number;
  participants: UserBrief[];
}

export interface Message {
  id: string;
  conversationId: string;
  content: string | null;
  isAI: boolean;
  attachmentUrl: string | null;
  attachmentType: string | null;
  createdAt: string;
  isDeleted: boolean;
  sender: UserBrief;
  seenByUserIds: string[];
}
