import { FriendshipStatus } from './friend.models';
export { FriendshipStatus } from './friend.models';

// Khớp BE: UserProfileDto
export interface UserProfile {
  id: string;
  username: string;
  fullName: string;
  bio: string | null;
  avatarUrl: string | null;
  coverPhotoUrl: string | null;
  createdAt: string;
  friendCount: number;
  postCount: number;
  friendshipStatus: FriendshipStatus;
}

// Khớp BE: UserSearchResultDto
// Khác UserProfile: không có bio, coverPhotoUrl, friendCount, postCount, createdAt
export interface UserSearchResult {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  mutualFriendsCount: number;
  friendshipStatus: FriendshipStatus;
}
