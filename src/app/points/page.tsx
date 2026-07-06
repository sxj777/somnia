"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ArrowLeft, CalendarCheck2, CheckCircle2, Clock3, Medal, ShieldCheck, Trophy, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { Lang, tr } from "@/lib/i18n";
import {
  applyCheckIn,
  awardIdentityPoints,
  createPointsLedger,
  getLocalDateKey,
  getPointsLevel,
  loadPointsLedger,
  pointsRules,
  savePointsLedger,
  shortAddress,
  type PointsLedger,
  type PointsReason
} from "@/lib/points";

const accountCopy = {
  en: {
    back: "Back to site",
    title: "Somnia Points Account",
    subtitle: "Track your participation record before the full indexed points system goes live.",
    connectTitle: "Connect wallet",
    connectBody: "Your Somnia Points account is created from your wallet identity.",
    total: "Total Points",
    level: "Level",
    streak: "Check-in streak",
    today: "Today",
    checkIn: "Check in +10",
    checkedIn: "Checked in today",
    activity: "Activity ledger",
    noActivity: "No points activity yet. Connect a wallet to create your account.",
    tasks: "Task Center",
    done: "Done",
    available: "Available",
    soon: "Soon",
    lastCheckIn: "Last check-in",
    never: "Never",
    wallet: "Wallet",
    statusCreated: "Points account loaded.",
    statusCheckedIn: "Daily check-in recorded. Somnia Points increased by 10.",
    statusAlready: "You already checked in today.",
    localTag: "Local MVP",
    disclaimer:
      "Somnia Points are platform reputation and participation records. They are not tokens, are not transferable, and do not promise equity, yield, airdrops, or redemption."
  },
  zh: {
    back: "返回官网",
    title: "Somnia 积分账户",
    subtitle: "查看你的参与记录，后续会升级为可索引、可审核的正式积分系统。",
    connectTitle: "连接钱包",
    connectBody: "你的 Somnia Points 账户会基于钱包身份创建。",
    total: "总积分",
    level: "等级",
    streak: "连续签到",
    today: "今日",
    checkIn: "签到 +10",
    checkedIn: "今日已签到",
    activity: "积分流水",
    noActivity: "还没有积分记录。连接钱包后会创建你的积分账户。",
    tasks: "任务中心",
    done: "已完成",
    available: "可完成",
    soon: "即将开放",
    lastCheckIn: "上次签到",
    never: "暂无",
    wallet: "钱包",
    statusCreated: "积分账户已加载。",
    statusCheckedIn: "每日签到已记录，Somnia Points 增加 10 分。",
    statusAlready: "今天已经签到过了。",
    localTag: "本地 MVP",
    disclaimer:
      "Somnia Points 是平台内声誉和参与度记录，不是代币，不可转让，也不承诺股权、收益、空投或兑换。"
  }
} satisfies Record<Lang, Record<string, string>>;

function copy(lang: Lang, key: keyof typeof accountCopy.en) {
  return accountCopy[lang][key];
}

export default function PointsAccountPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [pointsLedger, setPointsLedger] = useState<PointsLedger | undefined>();
  const [status, setStatus] = useState("");
  const { address, isConnected } = useAccount();

  useEffect(() => {
    if (!isConnected || !address) {
      setPointsLedger(undefined);
      return;
    }

    const loaded = loadPointsLedger(address);
    setPointsLedger(awardIdentityPoints(loaded, address));
    setStatus(copy(lang, "statusCreated"));
  }, [address, isConnected, lang]);

  useEffect(() => {
    if (pointsLedger) savePointsLedger(pointsLedger);
  }, [pointsLedger]);

  const pointsLevel = getPointsLevel(pointsLedger?.total ?? 0);
  const hasCheckedInToday = pointsLedger?.lastCheckInDate === getLocalDateKey();
  const taskStatus = useMemo(() => buildTaskStatus(pointsLedger, hasCheckedInToday), [pointsLedger, hasCheckedInToday]);
  const recentEvents = pointsLedger?.events ?? [];

  function checkIn() {
    if (!isConnected || !address) {
      setStatus(tr(lang, "missingWallet"));
      return;
    }

    const base = pointsLedger ?? createPointsLedger(address);
    const result = applyCheckIn(base, address);
    setPointsLedger(result.ledger);
    setStatus(result.alreadyCheckedIn ? copy(lang, "statusAlready") : copy(lang, "statusCheckedIn"));
  }

  return (
    <main className="account-page">
      <nav className="account-nav" aria-label="Somnia points navigation">
        <Link href="/">
          <ArrowLeft size={17} />
          {copy(lang, "back")}
        </Link>
        <div className="nav-actions">
          <div className="language-toggle" aria-label={tr(lang, "language")}>
            <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")} type="button">
              EN
            </button>
            <button className={lang === "zh" ? "active" : ""} onClick={() => setLang("zh")} type="button">
              中文
            </button>
          </div>
          <ConnectButton />
        </div>
      </nav>

      <section className="account-shell">
        <div className="account-hero">
          <div>
            <p className="eyebrow">Somnia Points</p>
            <h1>{copy(lang, "title")}</h1>
            <p>{copy(lang, "subtitle")}</p>
          </div>
          <span className="tag">{copy(lang, "localTag")}</span>
        </div>

        <div className="account-grid">
          <section className="account-panel account-summary">
            <div className="account-card-head">
              <span>
                <Medal size={18} />
                {copy(lang, "total")}
              </span>
              <small>{isConnected && address ? shortAddress(address) : copy(lang, "connectTitle")}</small>
            </div>
            <div className="account-total">
              <strong>{pointsLedger?.total ?? 0}</strong>
              <span>Points</span>
            </div>
            <div className="level-row">
              <span>
                {copy(lang, "level")}: {pointsLevel.label[lang]}
              </span>
              <span>{pointsLevel.nextLabel}</span>
            </div>
            <div className="level-meter" aria-hidden="true">
              <span style={{ width: `${pointsLevel.progress}%` }} />
            </div>
            {status ? <p className="account-status">{status}</p> : null}
          </section>

          <section className="account-panel account-checkin">
            <div className="account-card-head">
              <span>
                <CalendarCheck2 size={18} />
                {copy(lang, "today")}
              </span>
              <small>{copy(lang, "lastCheckIn")}: {pointsLedger?.lastCheckInDate ?? copy(lang, "never")}</small>
            </div>
            <div className="checkin-big">
              <div>
                <span>{copy(lang, "streak")}</span>
                <strong>{pointsLedger?.checkInStreak ?? 0}</strong>
              </div>
              <button disabled={Boolean(hasCheckedInToday)} onClick={checkIn} type="button">
                {hasCheckedInToday ? copy(lang, "checkedIn") : copy(lang, "checkIn")}
              </button>
            </div>
          </section>

          <section className="account-panel account-wallet">
            <div className="account-card-head">
              <span>
                <Wallet size={18} />
                {copy(lang, "wallet")}
              </span>
            </div>
            <strong>{isConnected && address ? shortAddress(address) : copy(lang, "connectTitle")}</strong>
            <p>{copy(lang, "connectBody")}</p>
          </section>
        </div>

        <section className="account-section">
          <div className="account-section-head">
            <h2>{copy(lang, "tasks")}</h2>
          </div>
          <div className="task-grid">
            {pointsRules.map((rule) => (
              <div className="task-card" key={rule.reason}>
                <div>
                  <strong>+{rule.points}</strong>
                  <span>{rule.title[lang]}</span>
                  <p>{rule.body[lang]}</p>
                </div>
                <TaskBadge label={copy(lang, taskStatus[rule.reason])} state={taskStatus[rule.reason]} />
              </div>
            ))}
          </div>
        </section>

        <section className="account-section account-ledger">
          <div className="account-section-head">
            <h2>{copy(lang, "activity")}</h2>
            <span>{recentEvents.length}</span>
          </div>
          <div className="ledger-list">
            {recentEvents.map((event) => (
              <div className="ledger-row" key={event.id}>
                <div>
                  <span>{event.label[lang]}</span>
                  <small>{formatAccountDate(event.createdAt, lang)}</small>
                </div>
                <strong>+{event.points}</strong>
              </div>
            ))}
            {!recentEvents.length ? <p className="empty-state">{copy(lang, "noActivity")}</p> : null}
          </div>
        </section>

        <div className="points-disclaimer">
          <ShieldCheck size={20} />
          <p>{copy(lang, "disclaimer")}</p>
        </div>
      </section>
    </main>
  );
}

function TaskBadge({ label, state }: { label: string; state: "done" | "available" | "soon" }) {
  const icon = state === "done" ? <CheckCircle2 size={15} /> : state === "available" ? <Trophy size={15} /> : <Clock3 size={15} />;

  return (
    <span className={`task-badge ${state}`}>
      {icon}
      {label}
    </span>
  );
}

function buildTaskStatus(ledger: PointsLedger | undefined, hasCheckedInToday: boolean): Record<PointsReason, "done" | "available" | "soon"> {
  const completedReasons = new Set(ledger?.events.map((event) => event.reason) ?? []);

  return {
    identity: ledger ? "done" : "available",
    checkIn: hasCheckedInToday ? "done" : "available",
    publish: completedReasons.has("publish") ? "done" : "available",
    progress: "soon",
    signalSent: completedReasons.has("signalSent") ? "done" : "available",
    signalReceived: "soon",
    featuredCandidate: "soon"
  };
}

function formatAccountDate(value: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai"
  }).format(new Date(value));
}
