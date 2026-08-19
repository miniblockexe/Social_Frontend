import { UserBrief } from './auth.models';

// ── Enums ──────────────────────────────────────────────────────────────

export enum GroupPrivacy {
  Public = 0,
  Private = 1,
}

export enum GroupRole {
  Member = 0,
  Admin = 1,
  Owner = 2,
}

export enum JoinRequestStatus {
  Pending = 0,
  Approved = 1,
  Rejected = 2,
}

export enum GroupPostStatus {
  Approved = 0,
  Pending = 1,
  Rejected = 2,
}

export enum GroupMembershipStatus {
  None = 0,
  Member = 1,
  PendingApproval = 2,
}

// ── Response DTOs ──────────────────────────────────────────────────────

export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  privacy: GroupPrivacy;
  requireApproval: boolean;
  requirePostApproval: boolean;
  memberCount: number;
  createdAt: string;
  membershipStatus: GroupMembershipStatus;
  viewerRole: GroupRole | null;
}

export interface GroupDetail extends GroupSummary {
  owner: UserBrief;
  admins: GroupMember[];
}

export interface GroupMember {
  user: UserBrief;
  role: GroupRole;
  joinedAt: string;
}

export interface GroupJoinRequest {
  id: string;
  user: UserBrief;
  status: JoinRequestStatus;
  createdAt: string;
}

// ── Request DTOs ───────────────────────────────────────────────────────

export interface CreateGroupRequest {
  name: string;
  description?: string;
  privacy: GroupPrivacy;
  requireApproval: boolean;
  requirePostApproval: boolean;
  avatar?: File;
}

export interface UpdateGroupRequest {
  name?: string;
  description?: string;
  privacy?: GroupPrivacy;
  requireApproval?: boolean;
  requirePostApproval?: boolean;
  avatar?: File;
  cover?: File;
}

export interface ApproveJoinRequestDto {
  approve: boolean;
  rejectReason?: string;
}

export interface UpdateMemberRoleDto {
  role: GroupRole;
}

export interface ReviewGroupPostDto {
  approve: boolean;
  rejectReason?: string;
}
