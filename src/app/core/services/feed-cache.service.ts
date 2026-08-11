import { Injectable, signal } from '@angular/core';
import { Post } from '../models/post.models';
import { FriendRequest, FriendSuggestion } from '../models/friend.models';

interface FeedSnapshot {
  posts: Post[];
  cursorId: string | undefined;
  hasMore: boolean;
  cachedAt: number; // timestamp ms
}

interface ProfileSnapshot {
  posts: Post[];
  page: number;
  hasMore: boolean;
  cachedAt: number;
}

const FEED_TTL_MS = 60_000;
const PROFILE_TTL_MS = 60_000;
const SIDEBAR_TTL_MS = 300_000;

@Injectable({ providedIn: 'root' })
export class FeedCacheService {
  private feedSnap: FeedSnapshot | null = null;

  saveFeed(
    posts: Post[],
    cursorId: string | undefined,
    hasMore: boolean,
  ): void {
    this.feedSnap = { posts, cursorId, hasMore, cachedAt: Date.now() };
  }

  getFeed(): FeedSnapshot | null {
    if (!this.feedSnap) return null;
    if (Date.now() - this.feedSnap.cachedAt > FEED_TTL_MS) {
      this.feedSnap = null;
      return null;
    }
    return this.feedSnap;
  }

  /** Thêm post mới lên đầu feed cache (sau createPost) */
  prependPost(post: Post): void {
    if (!this.feedSnap) return;
    this.feedSnap = {
      ...this.feedSnap,
      posts: [post, ...this.feedSnap.posts],
      cachedAt: Date.now(),
    };
  }

  /** Xóa post khỏi feed cache (sau deletePost) */
  removePost(postId: string): void {
    if (!this.feedSnap) return;
    this.feedSnap = {
      ...this.feedSnap,
      posts: this.feedSnap.posts.filter((p) => p.id !== postId),
    };
  }

  /** Cập nhật post trong feed cache (sau updatePost / like) */
  updatePost(post: Post): void {
    if (!this.feedSnap) return;
    this.feedSnap = {
      ...this.feedSnap,
      posts: this.feedSnap.posts.map((p) => (p.id === post.id ? post : p)),
    };
  }

  invalidateFeed(): void {
    this.feedSnap = null;
  }

  // ── Sidebar (pending requests + suggestions) ──────────────────────────
  private pendingSnap: { data: FriendRequest[]; cachedAt: number } | null =
    null;
  private suggestSnap: { data: FriendSuggestion[]; cachedAt: number } | null =
    null;

  savePending(data: FriendRequest[]): void {
    this.pendingSnap = { data, cachedAt: Date.now() };
  }

  getPending(): FriendRequest[] | null {
    if (!this.pendingSnap) return null;
    if (Date.now() - this.pendingSnap.cachedAt > SIDEBAR_TTL_MS) {
      this.pendingSnap = null;
      return null;
    }
    return this.pendingSnap.data;
  }

  removePending(requestId: string): void {
    if (!this.pendingSnap) return;
    this.pendingSnap.data = this.pendingSnap.data.filter(
      (r) => r.requestId !== requestId,
    );
  }

  saveSuggestions(data: FriendSuggestion[]): void {
    this.suggestSnap = { data, cachedAt: Date.now() };
  }

  getSuggestions(): FriendSuggestion[] | null {
    if (!this.suggestSnap) return null;
    if (Date.now() - this.suggestSnap.cachedAt > SIDEBAR_TTL_MS) {
      this.suggestSnap = null;
      return null;
    }
    return this.suggestSnap.data;
  }

  removeSuggestion(userId: string): void {
    if (!this.suggestSnap) return;
    this.suggestSnap.data = this.suggestSnap.data.filter(
      (s) => s.user.id !== userId,
    );
  }

  // ── Profile posts ─────────────────────────────────────────────────────
  private profileCache = new Map<string, ProfileSnapshot>();

  saveProfilePosts(
    userId: string,
    posts: Post[],
    page: number,
    hasMore: boolean,
  ): void {
    this.profileCache.set(userId, {
      posts,
      page,
      hasMore,
      cachedAt: Date.now(),
    });
  }

  getProfilePosts(userId: string): ProfileSnapshot | null {
    const snap = this.profileCache.get(userId);
    if (!snap) return null;
    if (Date.now() - snap.cachedAt > PROFILE_TTL_MS) {
      this.profileCache.delete(userId);
      return null;
    }
    return snap;
  }

  updateProfilePost(userId: string, post: Post): void {
    const snap = this.profileCache.get(userId);
    if (!snap) return;
    snap.posts = snap.posts.map((p) => (p.id === post.id ? post : p));
  }

  removeProfilePost(userId: string, postId: string): void {
    const snap = this.profileCache.get(userId);
    if (!snap) return;
    snap.posts = snap.posts.filter((p) => p.id !== postId);
  }

  invalidateProfile(userId: string): void {
    this.profileCache.delete(userId);
  }
}
