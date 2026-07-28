import { UserBrief } from './auth.models';

export interface Post {
  id: string;
  content: string | null;
  privacy: PostPrivacy;
  createdAt: string;
  updatedAt: string;
  author: UserBrief;
  mediaFiles: PostMedia[];
  likeCount: number;
  commentCount: number;
  isLikedByMe: boolean;
  isOwner: boolean;
}

export interface PostMedia {
  id: string;
  mediaUrl: string;
  mediaType: MediaType;
  storageProvider: number;
  fileSize: number;
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: UserBrief;
  repliesCount: number;
  parentCommentId: string | null;
  isOwner: boolean;
}

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
