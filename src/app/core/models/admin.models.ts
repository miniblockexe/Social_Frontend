import { UserBrief, UserRole } from './auth.models';

export interface AdminDashboard {
  totalUsers: number;
  activeUsersLast7Days: number;
  newUsersToday: number;
  totalPosts: number;
  activePosts: number;
  deletedPosts: number;
  postsToday: number;
  totalMessages: number;
  messagesToday: number;
  totalComments: number;
  totalLikes: number;
  bannedUsers: number;
  totalFriendships: number;
  generatedAt: string;
  // totalReports và onlineUsers đã xóa — không có trong backend AdminDashboardDto
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: UserRole | string;
  isActive: boolean;
  isBanned: boolean;
  bannedReason: string | null;
  createdAt: string;
  // joinedAt đã xóa — không có trong backend AdminUserDto, dùng createdAt thay thế
  lastSeen: string | null;
  postCount: number;
  friendCount: number;
  messageCount: number;
}

export interface AdminPost {
  id: string;
  content: string | null;
  privacy: number;
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: UserBrief;
  mediaCount: number;
  likeCount: number;
  commentCount: number;
  deletedByAdmin: boolean;
  adminDeleteReason: string | null;
}

export interface AdminCloudFile {
  key: string;
  publicUrl: string;
  fileName: string;
  fileSize: number;
  fileSizeMB: number;
  contentType: string;
  lastModified: string;
}

export interface AdminCloudStats {
  cloudinaryUsageMB: number;
  cloudinaryUsageGB: number;
  cloudinaryPlanLimitMB: number;
  cloudinaryUsagePercent: number;
  r2Stats: {
    totalFiles: number;
    totalSizeBytes: number;
    totalSizeMB: number;
    totalSizeGB: number;
    filesByType: Record<string, number>;
  };
  recentR2Files: AdminCloudFile[];
}
