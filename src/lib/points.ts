export type Profile = {
  id: string;
  wallet_address: string;
  email: string | null;
  email_verified: boolean;
  avatar_url: string | null;
  nickname: string | null;
  gender: "male" | "female" | "other" | null;
  bio: string | null;
  invite_code: string;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PointsLedgerEntry = {
  id: string;
  wallet_address: string;
  points: number;
  reason: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Checkin = {
  id: string;
  wallet_address: string;
  checkin_date: string;
  streak_day: number;
  created_at: string;
};

export const pointRules = [
  {
    key: "connect_wallet",
    points: 10,
    title: "连接钱包",
    detail: "每个钱包只奖励一次"
  },
  {
    key: "email_verified",
    points: 20,
    title: "绑定邮箱",
    detail: "邮箱验证完成后发放"
  },
  {
    key: "profile_created",
    points: 30,
    title: "创建账户资料",
    detail: "头像、昵称、性别为必填"
  },
  {
    key: "daily_checkin",
    points: 10,
    title: "每日签到",
    detail: "完成账户后每天一次"
  },
  {
    key: "referral",
    points: 50,
    title: "成功邀请好友",
    detail: "好友完成邮箱和资料后发放"
  }
];

export const streakRewards = [
  { days: 7, points: 50 },
  { days: 30, points: 300 },
  { days: 365, points: 5000 }
];

export function normalizeAddress(value: string) {
  return value.trim().toLowerCase();
}

export function shortAddress(value: string) {
  return value.startsWith("0x") && value.length >= 10
    ? `${value.slice(0, 6)}...${value.slice(-4)}`
    : value;
}

export function todayKey(dayOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isProfileComplete(profile: Profile | null | undefined) {
  return Boolean(profile?.avatar_url && profile.nickname?.trim() && profile.gender);
}

export function generateInviteCode(wallet: string) {
  const tail = normalizeAddress(wallet).replace(/^0x/, "").slice(-6).toUpperCase();
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase()
      : Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SOM${tail}${randomPart}`;
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai"
  }).format(new Date(value));
}

export function describeReason(reason: string, description: string | null) {
  const labels: Record<string, string> = {
    connect_wallet: "连接钱包",
    email_verified: "绑定邮箱",
    profile_created: "创建账户资料",
    daily_checkin: "每日签到",
    streak_7: "连续签到 7 天",
    streak_30: "连续签到 30 天",
    streak_365: "连续签到 365 天",
    referral: "成功邀请好友"
  };

  return description || labels[reason] || reason;
}
