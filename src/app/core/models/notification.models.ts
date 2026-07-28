import { UserBrief } from './auth.models';

export interface Notification {
  id: string;
  type: NotificationType;
  content: string;
  isRead: boolean;
  createdAt: string;
  actor: UserBrief;
  entityId: string | null;
  entityType: 'post' | 'friend_request' | 'message' | 'system';
}

export enum NotificationType {
  Like = 0,
  Comment = 1,
  FriendRequest = 2,
  FriendAccepted = 3,
  Message = 4,
  System = 5,
}
