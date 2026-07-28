import { UserBrief } from './auth.models';

export interface FriendRequest {
  requestId: string;
  status: FriendStatus;
  sender: UserBrief;
  receiver: UserBrief;
  createdAt: string;
  updatedAt: string;
}

export interface FriendListItem {
  user: UserBrief;
  friendSince: string;
  mutualFriendsCount: number;
}

// Khớp BE: FriendSuggestionDto
export interface FriendSuggestion {
  user: UserBrief;
  mutualFriendsCount: number;
  mutualFriends: UserBrief[]; // preview tối đa 3 người bạn chung
}

export enum FriendStatus {
  Pending = 0,
  Accepted = 1,
  Rejected = 2,
  Blocked = 3,
}

export enum FriendshipStatus {
  None = 0,
  Pending = 1,
  SentRequest = 2,
  Friends = 3,
  Blocked = 4,
}
