export enum PostPrivacy {
  Public = 0,
  Friends = 1,
  OnlyMe = 2,
}

export enum MediaType {
  Image = 0,
  Video = 1,
  Audio = 2,
}

export enum UserRole {
  User = 0,
  Admin = 1,
}

// { id, username, fullName, avatarUrl, role }
// - isOnline (BE không có)
// + role
export interface SocialUser {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null; // BE nullable
  role: UserRole;
}

// { id, mediaUrl, mediaType, storageProvider, fileSize }
export interface PostMedia {
  id: string;
  mediaUrl: string;
  mediaType: MediaType;
  storageProvider: number;
  fileSize: number;
}

// { id, content, createdAt, updatedAt, author, repliesCount, parentCommentId, isOwner }
// user→author, text→content, createdAt string ISO
// - likeCount, isLiked (BE không có)
// + updatedAt, repliesCount, parentCommentId, isOwner
export interface PostComment {
  id: string;
  content: string;
  createdAt: string; // ISO string từ BE
  updatedAt: string;
  author: SocialUser;
  repliesCount: number;
  parentCommentId: string | null;
  isOwner: boolean;
}

// { id, content, privacy(enum), createdAt, updatedAt, author, mediaFiles,
//       likeCount, commentCount, isLikedByMe, isOwner }
// user→author, text→content, images→mediaFiles, createdAt string ISO,
//       privacy string→enum, myReaction→isLikedByMe (boolean),
//       totalReactions→likeCount
// - reactions[], topReactions[], shareCount, isSaved, isFollowing (BE không có)
// + updatedAt, mediaFiles, isOwner
export interface FeedPost {
  id: string;
  content: string | null;
  privacy: PostPrivacy;
  createdAt: string; // ISO string từ BE
  updatedAt: string;
  author: SocialUser;
  mediaFiles: PostMedia[];
  likeCount: number;
  commentCount: number;
  isLikedByMe: boolean;
  isOwner: boolean;

  comments?: PostComment[]; // lazy load khi mở section comment
}

export type ReactionType = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry';

export const REACTION_META: Record<
  ReactionType,
  { emoji: string; label: string; color: string }
> = {
  like: { emoji: '👍', label: 'Thích', color: '#3D7EFF' },
  love: { emoji: '❤️', label: 'Yêu thích', color: '#F43F5E' },
  haha: { emoji: '😂', label: 'Haha', color: '#F59E0B' },
  wow: { emoji: '😮', label: 'Wow', color: '#F59E0B' },
  sad: { emoji: '😢', label: 'Buồn', color: '#3D7EFF' },
  angry: { emoji: '😠', label: 'Phẫn nộ', color: '#EF4444' },
};

export const MOCK_ME: SocialUser = {
  id: 'me',
  fullName: 'Bảnh Dev',
  username: 'banhdev',
  avatarUrl: 'https://i.pravatar.cc/150?img=3',
  role: UserRole.User,
};
