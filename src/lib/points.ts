import type { Lang } from "@/lib/i18n";

export type PointsReason =
  | "identity"
  | "checkIn"
  | "publish"
  | "progress"
  | "signalSent"
  | "signalReceived"
  | "featuredCandidate";

export type PointsEvent = {
  id: string;
  reason: PointsReason;
  points: number;
  label: Record<Lang, string>;
  createdAt: string;
  dreamId?: number;
};

export type PointsLedger = {
  address: string;
  total: number;
  events: PointsEvent[];
  signaledDreamIds: number[];
  lastCheckInDate?: string;
  checkInStreak: number;
  updatedAt: string;
};

export type Leader = {
  label: string;
  score: number;
  detail: string;
};

export const pointsRules: Array<{
  reason: PointsReason;
  points: number;
  title: Record<Lang, string>;
  body: Record<Lang, string>;
}> = [
  {
    reason: "identity",
    points: 20,
    title: { en: "Create identity", zh: "创建身份" },
    body: { en: "Connect a wallet and start a local Somnia profile.", zh: "连接钱包并生成 Somnia 本地身份。" }
  },
  {
    reason: "checkIn",
    points: 10,
    title: { en: "Daily check-in", zh: "每日签到" },
    body: { en: "Check in once per day to keep participation active.", zh: "每天签到一次，保持参与活跃度。" }
  },
  {
    reason: "publish",
    points: 100,
    title: { en: "Publish a Dream", zh: "发布 Dream" },
    body: { en: "Submit a valid Dream through the publishing flow.", zh: "通过发布流程提交一个有效 Dream。" }
  },
  {
    reason: "progress",
    points: 30,
    title: { en: "Progress update", zh: "进展更新" },
    body: { en: "Reserved for the next build-note update flow.", zh: "预留给下一版进展更新流程。" }
  },
  {
    reason: "signalSent",
    points: 5,
    title: { en: "Signal a Dream", zh: "支持 Dream" },
    body: { en: "Support another creator's Dream once per wallet.", zh: "用钱包给其他创建者的 Dream 发送一次 signal。" }
  },
  {
    reason: "signalReceived",
    points: 2,
    title: { en: "Receive support", zh: "收到支持" },
    body: { en: "Will be counted from indexed signal events.", zh: "后续通过索引 signal 事件计入。" }
  },
  {
    reason: "featuredCandidate",
    points: 50,
    title: { en: "Featured candidate", zh: "精选候选" },
    body: { en: "Reserved for reviewer and Spotlight workflows.", zh: "预留给审核者和 Spotlight 流程。" }
  }
];

const pointsStoragePrefix = "somnia.points.v1";
const maxStoredEvents = 30;

export function shortAddress(value: string) {
  return value.startsWith("0x") && value.length >= 10
    ? `${value.slice(0, 6)}...${value.slice(-4)}`
    : value;
}

export function normalizeAddress(value: string) {
  return value.toLowerCase();
}

export function pointsStorageKey(address: string) {
  return `${pointsStoragePrefix}:${normalizeAddress(address)}`;
}

export function createPointsLedger(address: string): PointsLedger {
  return {
    address: normalizeAddress(address),
    total: 0,
    events: [],
    signaledDreamIds: [],
    checkInStreak: 0,
    updatedAt: new Date().toISOString()
  };
}

export function loadPointsLedger(address: string): PointsLedger {
  if (typeof window === "undefined") return createPointsLedger(address);

  try {
    const raw = window.localStorage.getItem(pointsStorageKey(address));
    if (!raw) return createPointsLedger(address);
    const parsed = JSON.parse(raw) as PointsLedger;
    return {
      ...createPointsLedger(address),
      ...parsed,
      address: normalizeAddress(address),
      events: Array.isArray(parsed.events) ? parsed.events : [],
      signaledDreamIds: Array.isArray(parsed.signaledDreamIds) ? parsed.signaledDreamIds : [],
      checkInStreak: Number.isFinite(parsed.checkInStreak) ? parsed.checkInStreak : 0,
      lastCheckInDate: typeof parsed.lastCheckInDate === "string" ? parsed.lastCheckInDate : undefined
    };
  } catch {
    return createPointsLedger(address);
  }
}

export function savePointsLedger(ledger: PointsLedger) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(pointsStorageKey(ledger.address), JSON.stringify(ledger));
}

export function addPointsEvent(ledger: PointsLedger, event: PointsEvent): PointsLedger {
  if (ledger.events.some((item) => item.id === event.id)) return ledger;

  return {
    ...ledger,
    total: ledger.total + event.points,
    events: [event, ...ledger.events].slice(0, maxStoredEvents),
    updatedAt: event.createdAt
  };
}

export function awardIdentityPoints(ledger: PointsLedger, address: string): PointsLedger {
  return addPointsEvent(ledger, {
    id: `identity:${normalizeAddress(address)}`,
    reason: "identity",
    points: 20,
    label: { en: "Wallet identity created", zh: "钱包身份已创建" },
    createdAt: new Date().toISOString()
  });
}

export function applyCheckIn(ledger: PointsLedger, address: string) {
  const checkInDate = getLocalDateKey();
  if (ledger.lastCheckInDate === checkInDate) {
    return { ledger, alreadyCheckedIn: true, streak: ledger.checkInStreak };
  }

  const yesterdayKey = getLocalDateKey(-1);
  const nextStreak = ledger.lastCheckInDate === yesterdayKey ? ledger.checkInStreak + 1 : 1;
  const next = addPointsEvent(ledger, {
    id: `checkIn:${normalizeAddress(address)}:${checkInDate}`,
    reason: "checkIn",
    points: 10,
    label: { en: `Daily check-in · Day ${nextStreak}`, zh: `每日签到 · 第 ${nextStreak} 天` },
    createdAt: new Date().toISOString()
  });

  return {
    ledger: {
      ...next,
      lastCheckInDate: checkInDate,
      checkInStreak: nextStreak,
      updatedAt: new Date().toISOString()
    },
    alreadyCheckedIn: false,
    streak: nextStreak
  };
}

export function getLocalDateKey(dayOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getPointsLevel(total: number) {
  const levels = [
    { min: 0, label: { en: "Seed", zh: "种子" } },
    { min: 100, label: { en: "Builder", zh: "建设者" } },
    { min: 250, label: { en: "Scout", zh: "发现者" } },
    { min: 500, label: { en: "Reviewer candidate", zh: "审核候选人" } }
  ];

  const current = [...levels].reverse().find((level) => total >= level.min) ?? levels[0];
  const next = levels.find((level) => level.min > total);
  const start = current.min;
  const end = next?.min ?? Math.max(total, current.min + 1);
  const progress = next ? Math.min(100, Math.round(((total - start) / (end - start)) * 100)) : 100;

  return {
    label: current.label,
    nextLabel: next ? `${total}/${next.min}` : "MAX",
    progress
  };
}

export function buildLeaderboard(ledger: PointsLedger | undefined, address: string | undefined, lang: Lang): Leader[] {
  if (ledger && address) {
    return [
      {
        label: shortAddress(address),
        score: ledger.total,
        detail: lang === "zh" ? "你的 Somnia Points" : "Your Somnia Points"
      }
    ];
  }

  return [
    {
      label: lang === "zh" ? "连接钱包" : "Connect wallet",
      score: 0,
      detail: lang === "zh" ? "创建你的积分档案" : "Create your points profile"
    }
  ];
}
