"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  CalendarCheck2,
  CheckCircle2,
  Copy,
  Database,
  Mail,
  ShieldCheck,
  Trophy,
  UserRound,
  Users,
  Wallet,
  XCircle
} from "lucide-react";
import type { ReactNode } from "react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import {
  describeReason,
  formatDateTime,
  generateInviteCode,
  isProfileComplete,
  normalizeAddress,
  pointRules,
  streakRewards,
  todayKey,
  type Checkin,
  type PointsLedgerEntry,
  type Profile
} from "@/lib/points";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const referralStorageKey = "somnia.referral_code";

type ProfileDraft = {
  avatar_url: string;
  nickname: string;
  gender: "" | "male" | "female" | "other";
  bio: string;
};

type Referral = {
  id: string;
  inviter_wallet: string;
  invitee_wallet: string;
  invite_code: string;
  status: "pending" | "completed";
};

const emptyDraft: ProfileDraft = {
  avatar_url: "",
  nickname: "",
  gender: "",
  bio: ""
};

export function PointsApp() {
  const { address, isConnected } = useAccount();
  const wallet = useMemo(() => (address ? normalizeAddress(address) : ""), [address]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ledger, setLedger] = useState<PointsLedgerEntry[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("连接钱包后创建你的 Somnia Points 账户。");
  const [busy, setBusy] = useState(false);

  const totalPoints = useMemo(() => ledger.reduce((sum, item) => sum + item.points, 0), [ledger]);
  const latestCheckin = checkins[0];
  const currentStreak = latestCheckin?.streak_day ?? 0;
  const checkedInToday = latestCheckin?.checkin_date === todayKey();
  const profileComplete = isProfileComplete(profile);
  const accountReady = Boolean(profile?.email_verified && profileComplete);
  const completedSteps = [Boolean(wallet), Boolean(profile?.email_verified), profileComplete].filter(Boolean).length;
  const completionPercent = Math.round((completedSteps / 3) * 100);
  const profileRequiredDone = [Boolean(draft.avatar_url), Boolean(draft.nickname.trim()), Boolean(draft.gender)].filter(Boolean).length;
  const nextStreakReward = streakRewards.find((reward) => reward.days > currentStreak) || streakRewards[streakRewards.length - 1];
  const streakTarget = nextStreakReward?.days || 7;
  const streakProgress = Math.min(100, Math.round((currentStreak / streakTarget) * 100));
  const daysToNextReward = Math.max(streakTarget - currentStreak, 0);
  const inviteLink = useMemo(() => {
    if (typeof window === "undefined" || !profile?.invite_code) return "";
    return `${window.location.origin}/?ref=${profile.invite_code}`;
  }, [profile?.invite_code]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) window.sessionStorage.setItem(referralStorageKey, ref.trim().toUpperCase());
  }, []);

  useEffect(() => {
    if (!isConnected || !wallet) {
      setProfile(null);
      setLedger([]);
      setCheckins([]);
      setDraft(emptyDraft);
      setEmail("");
      setStatus("连接钱包后创建你的 Somnia Points 账户。");
      return;
    }

    void loadAccount(wallet);
  }, [isConnected, wallet]);

  async function loadAccount(targetWallet: string) {
    if (!supabase) {
      setStatus("Supabase 还没有配置好。");
      return;
    }

    setBusy(true);
    try {
      let currentProfile = await ensureProfile(targetWallet);
      await registerReferral(targetWallet, currentProfile);
      await awardPointsOnce(targetWallet, "connect_wallet", 10, "connect_wallet", "连接钱包");
      currentProfile = await claimVerifiedEmailFromSession(targetWallet, currentProfile, false);
      await completeReferralIfReady(targetWallet, currentProfile);
      await refreshAccount(targetWallet);
      setStatus("账户已同步。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "账户同步失败。");
    } finally {
      setBusy(false);
    }
  }

  async function ensureProfile(targetWallet: string) {
    if (!supabase) throw new Error("Supabase 还没有配置好。");

    const existing = await supabase
      .from("profiles")
      .select("*")
      .eq("wallet_address", targetWallet)
      .maybeSingle();

    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) {
      applyProfile(existing.data as Profile);
      return existing.data as Profile;
    }

    const created = await supabase
      .from("profiles")
      .insert({
        wallet_address: targetWallet,
        invite_code: generateInviteCode(targetWallet)
      })
      .select("*")
      .single();

    if (created.error) {
      const retry = await supabase
        .from("profiles")
        .select("*")
        .eq("wallet_address", targetWallet)
        .maybeSingle();
      if (retry.error || !retry.data) throw new Error(created.error.message);
      applyProfile(retry.data as Profile);
      return retry.data as Profile;
    }

    applyProfile(created.data as Profile);
    return created.data as Profile;
  }

  function applyProfile(nextProfile: Profile) {
    setProfile(nextProfile);
    setEmail(nextProfile.email || "");
    setDraft({
      avatar_url: nextProfile.avatar_url || "",
      nickname: nextProfile.nickname || "",
      gender: nextProfile.gender || "",
      bio: nextProfile.bio || ""
    });
  }

  async function refreshAccount(targetWallet: string) {
    if (!supabase) return;

    const [profileResult, ledgerResult, checkinResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("wallet_address", targetWallet).maybeSingle(),
      supabase
        .from("points_ledger")
        .select("*")
        .eq("wallet_address", targetWallet)
        .order("created_at", { ascending: false })
        .limit(80),
      supabase
        .from("checkins")
        .select("*")
        .eq("wallet_address", targetWallet)
        .order("checkin_date", { ascending: false })
        .limit(30)
    ]);

    if (profileResult.data) applyProfile(profileResult.data as Profile);
    if (!ledgerResult.error) setLedger((ledgerResult.data || []) as PointsLedgerEntry[]);
    if (!checkinResult.error) setCheckins((checkinResult.data || []) as Checkin[]);
  }

  async function awardPointsOnce(
    targetWallet: string,
    taskKey: string,
    points: number,
    reason: string,
    description: string,
    metadata: Record<string, unknown> = {}
  ) {
    if (!supabase) return false;

    const rpcResult = await supabase.rpc("award_points_once", {
      p_wallet_address: targetWallet,
      p_task_key: taskKey,
      p_points: points,
      p_reason: reason,
      p_description: description,
      p_metadata: metadata
    });

    if (!rpcResult.error) return true;

    const completion = await supabase
      .from("task_completions")
      .insert({ wallet_address: targetWallet, task_key: taskKey });

    if (completion.error) {
      if (completion.error.code === "23505") return false;
      throw new Error(completion.error.message);
    }

    const ledgerResult = await supabase.from("points_ledger").insert({
      wallet_address: targetWallet,
      points,
      reason,
      description,
      metadata
    });

    if (ledgerResult.error) throw new Error(ledgerResult.error.message);
    return true;
  }

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setStatus("请选择图片文件作为头像。");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setStatus("头像图片不要超过 5MB。");
      return;
    }

    try {
      const avatarDataUrl = await resizeAvatar(file);
      setDraft((current) => ({ ...current, avatar_url: avatarDataUrl }));
      setStatus("头像已选择，保存资料后生效。");
    } catch {
      setStatus("头像处理失败，请换一张图片试试。");
    }
  }

  async function sendEmailLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !wallet) return;

    const nextEmail = email.trim().toLowerCase();
    if (!nextEmail) {
      setStatus("请先填写邮箱。");
      return;
    }

    setBusy(true);
    const result = await supabase.auth.signInWithOtp({
      email: nextEmail,
      options: {
        emailRedirectTo: typeof window === "undefined" ? undefined : window.location.origin
      }
    });
    setBusy(false);

    setStatus(result.error ? result.error.message : "验证邮件已发送，请打开邮箱里的链接。");
  }

  async function claimEmailManually() {
    if (!wallet || !profile) return;
    setBusy(true);
    try {
      const nextProfile = await claimVerifiedEmailFromSession(wallet, profile, true);
      await completeReferralIfReady(wallet, nextProfile);
      await refreshAccount(wallet);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "邮箱绑定失败。");
    } finally {
      setBusy(false);
    }
  }

  async function claimVerifiedEmailFromSession(targetWallet: string, currentProfile: Profile, showMissing: boolean) {
    if (!supabase) return currentProfile;

    const sessionResult = await supabase.auth.getSession();
    const verifiedEmail = sessionResult.data.session?.user.email?.toLowerCase();

    if (!verifiedEmail) {
      if (showMissing) setStatus("还没有检测到已验证邮箱，请先点击邮件里的验证链接。");
      return currentProfile;
    }

    if (currentProfile.email_verified && currentProfile.email === verifiedEmail) return currentProfile;

    const updated = await supabase
      .from("profiles")
      .update({
        email: verifiedEmail,
        email_verified: true,
        updated_at: new Date().toISOString()
      })
      .eq("wallet_address", targetWallet)
      .select("*")
      .single();

    if (updated.error) {
      if (updated.error.code === "23505") {
        throw new Error("这个邮箱已经绑定过其他账户。");
      }
      throw new Error(updated.error.message);
    }

    await awardPointsOnce(targetWallet, "email_verified", 20, "email_verified", "绑定邮箱");
    setStatus("邮箱已绑定，积分已同步。");
    applyProfile(updated.data as Profile);
    return updated.data as Profile;
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !wallet) return;

    const nickname = draft.nickname.trim();
    if (!draft.avatar_url || !nickname || !draft.gender) {
      setStatus("头像、昵称、性别都需要填写。");
      return;
    }

    setBusy(true);
    try {
      const updated = await supabase
        .from("profiles")
        .update({
          avatar_url: draft.avatar_url,
          nickname,
          gender: draft.gender,
          bio: draft.bio.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq("wallet_address", wallet)
        .select("*")
        .single();

      if (updated.error) throw new Error(updated.error.message);

      await awardPointsOnce(wallet, "profile_created", 30, "profile_created", "创建账户资料");
      await completeReferralIfReady(wallet, updated.data as Profile);
      await refreshAccount(wallet);
      setStatus("账户资料已保存。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "账户资料保存失败。");
    } finally {
      setBusy(false);
    }
  }

  async function checkIn() {
    if (!supabase || !wallet) return;
    if (!accountReady) {
      setStatus("请先完成邮箱绑定和账户资料，再进行每日签到。");
      return;
    }

    const currentDate = todayKey();
    if (checkedInToday) {
      setStatus("今天已经签到过了。");
      return;
    }

    setBusy(true);
    try {
      const yesterday = todayKey(-1);
      const latest = await supabase
        .from("checkins")
        .select("*")
        .eq("wallet_address", wallet)
        .lt("checkin_date", currentDate)
        .order("checkin_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest.error) throw new Error(latest.error.message);

      const previous = latest.data as Checkin | null;
      const nextStreak = previous?.checkin_date === yesterday ? previous.streak_day + 1 : 1;
      const inserted = await supabase.from("checkins").insert({
        wallet_address: wallet,
        checkin_date: currentDate,
        streak_day: nextStreak
      });

      if (inserted.error) {
        if (inserted.error.code === "23505") {
          setStatus("今天已经签到过了。");
          return;
        }
        throw new Error(inserted.error.message);
      }

      await awardPointsOnce(wallet, `daily_checkin:${currentDate}`, 10, "daily_checkin", `每日签到 第 ${nextStreak} 天`, {
        checkin_date: currentDate,
        streak_day: nextStreak
      });

      const milestone = streakRewards.find((item) => item.days === nextStreak);
      if (milestone) {
        await awardPointsOnce(
          wallet,
          `streak_${milestone.days}:${currentDate}`,
          milestone.points,
          `streak_${milestone.days}`,
          `连续签到 ${milestone.days} 天奖励`,
          { checkin_date: currentDate, streak_day: nextStreak }
        );
      }

      await refreshAccount(wallet);
      setStatus(`签到成功，当前连续 ${nextStreak} 天。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "签到失败。");
    } finally {
      setBusy(false);
    }
  }

  async function registerReferral(targetWallet: string, currentProfile: Profile) {
    if (!supabase || typeof window === "undefined") return;

    const inviteCode = window.sessionStorage.getItem(referralStorageKey);
    if (!inviteCode || currentProfile.invited_by) return;
    if (inviteCode === currentProfile.invite_code) return;

    const inviter = await supabase
      .from("profiles")
      .select("wallet_address, invite_code")
      .eq("invite_code", inviteCode)
      .maybeSingle();

    if (inviter.error || !inviter.data) return;

    const inviterWallet = normalizeAddress(String(inviter.data.wallet_address));
    if (inviterWallet === targetWallet) return;

    const existing = await supabase
      .from("referrals")
      .select("id")
      .eq("invitee_wallet", targetWallet)
      .maybeSingle();

    if (!existing.data) {
      await supabase.from("referrals").insert({
        inviter_wallet: inviterWallet,
        invitee_wallet: targetWallet,
        invite_code: inviteCode,
        status: "pending"
      });
    }

    await supabase
      .from("profiles")
      .update({ invited_by: inviteCode, updated_at: new Date().toISOString() })
      .eq("wallet_address", targetWallet)
      .is("invited_by", null);
  }

  async function completeReferralIfReady(targetWallet: string, currentProfile: Profile) {
    if (!supabase || !currentProfile.email_verified || !isProfileComplete(currentProfile)) return;

    const referralResult = await supabase
      .from("referrals")
      .select("*")
      .eq("invitee_wallet", targetWallet)
      .eq("status", "pending")
      .maybeSingle();

    if (referralResult.error || !referralResult.data) return;

    const referral = referralResult.data as Referral;
    const completed = await supabase
      .from("referrals")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", referral.id)
      .eq("status", "pending");

    if (completed.error) return;

    await awardPointsOnce(
      normalizeAddress(referral.inviter_wallet),
      `referral:${targetWallet}`,
      50,
      "referral",
      "成功邀请好友",
      { invitee_wallet: targetWallet, invite_code: referral.invite_code }
    );
  }

  async function copyInviteLink() {
    if (!inviteLink || typeof navigator === "undefined") return;
    await navigator.clipboard.writeText(inviteLink);
    setStatus("邀请链接已复制。");
  }

  return (
    <main className="app-shell">
      <header className="brand-header">
        <a className="brand-block" href="/">
          <SomniaMark />
          <span>
            <strong>Somnia Points</strong>
            <small>Account Center</small>
          </span>
        </a>

        <nav className="brand-nav" aria-label="积分系统导航">
          <a href="#overview">Overview</a>
          <a href="#account">
            Account
          </a>
          <a href="#rewards">
            Rewards
          </a>
          <a href="#ledger">
            Ledger
          </a>
        </nav>

        <div className="top-actions">
          <span className={accountReady ? "state-chip ready" : "state-chip"}>{accountReady ? "账户已就绪" : "账户待完善"}</span>
          <ConnectButton label="连接钱包" showBalance={false} />
        </div>
      </header>

      <section className="main-stage">
        <section className="intro-band reward-hero">
          <div className="reward-hero-head">
            <p className="eyebrow">Account Infrastructure</p>
            <h1>Somnia Points</h1>
            <span className="top-subtitle">完成账户任务，领取 Somnia Points。</span>
          </div>

          <div className="reward-carousel" aria-label="积分奖励图片滚动">
            <div className="reward-track">
              <article className="reward-slide wallet">
                <div className="reward-visual">
                  <Wallet size={34} />
                  <i />
                </div>
                <div>
                  <span>STEP 01</span>
                  <strong>连接钱包</strong>
                  <b>+10 PTS</b>
                </div>
              </article>
              <article className="reward-slide email">
                <div className="reward-visual">
                  <Mail size={34} />
                  <i />
                </div>
                <div>
                  <span>STEP 02</span>
                  <strong>绑定邮箱</strong>
                  <b>+20 PTS</b>
                </div>
              </article>
              <article className="reward-slide profile">
                <div className="reward-visual">
                  <UserRound size={34} />
                  <i />
                </div>
                <div>
                  <span>STEP 03</span>
                  <strong>完成账户资料</strong>
                  <b>+30 PTS</b>
                </div>
              </article>
              <article className="reward-slide checkin">
                <div className="reward-visual">
                  <CalendarCheck2 size={34} />
                  <i />
                </div>
                <div>
                  <span>STEP 04</span>
                  <strong>每日签到</strong>
                  <b>+10 PTS</b>
                </div>
              </article>
              <article className="reward-slide invite">
                <div className="reward-visual">
                  <Users size={34} />
                  <i />
                </div>
                <div>
                  <span>STEP 05</span>
                  <strong>邀请好友</strong>
                  <b>+50 PTS</b>
                </div>
              </article>
              <article className="reward-slide wallet" aria-hidden="true">
                <div className="reward-visual">
                  <Wallet size={34} />
                  <i />
                </div>
                <div>
                  <span>STEP 01</span>
                  <strong>连接钱包</strong>
                  <b>+10 PTS</b>
                </div>
              </article>
              <article className="reward-slide email" aria-hidden="true">
                <div className="reward-visual">
                  <Mail size={34} />
                  <i />
                </div>
                <div>
                  <span>STEP 02</span>
                  <strong>绑定邮箱</strong>
                  <b>+20 PTS</b>
                </div>
              </article>
              <article className="reward-slide profile" aria-hidden="true">
                <div className="reward-visual">
                  <UserRound size={34} />
                  <i />
                </div>
                <div>
                  <span>STEP 03</span>
                  <strong>完成账户资料</strong>
                  <b>+30 PTS</b>
                </div>
              </article>
              <article className="reward-slide checkin" aria-hidden="true">
                <div className="reward-visual">
                  <CalendarCheck2 size={34} />
                  <i />
                </div>
                <div>
                  <span>STEP 04</span>
                  <strong>每日签到</strong>
                  <b>+10 PTS</b>
                </div>
              </article>
              <article className="reward-slide invite" aria-hidden="true">
                <div className="reward-visual">
                  <Users size={34} />
                  <i />
                </div>
                <div>
                  <span>STEP 05</span>
                  <strong>邀请好友</strong>
                  <b>+50 PTS</b>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="overview" className="overview-grid">
          <article className="account-overview-panel">
            <div className="account-overview-main">
              <div className="status-orb" aria-label={`账户状态完成 ${completedSteps} / 3`}>
                <span className={wallet ? "status-segment done" : "status-segment"} />
                <span className={profile?.email_verified ? "status-segment done" : "status-segment"} />
                <span className={profileComplete ? "status-segment done" : "status-segment"} />
                <div className="status-orb-center">
                  <strong>{completedSteps}/3</strong>
                  <small>账户状态</small>
                </div>
              </div>

              <div className="overview-points">
                <span>Somnia Points</span>
                <div>
                  <strong>{totalPoints}</strong>
                  <b>PTS</b>
                </div>
                <small>{completedSteps === 3 ? "账户已完成" : "账户待完成"}</small>
              </div>
            </div>

            <div className="account-status-list">
              <span className={wallet ? "done" : "pending"}>
                {wallet ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                钱包连接
              </span>
              <span className={profile?.email_verified ? "done" : "pending"}>
                {profile?.email_verified ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                邮箱绑定
              </span>
              <span className={profileComplete ? "done" : "pending"}>
                {profileComplete ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                账户资料完成
              </span>
            </div>

            <div className="overview-stat-row">
              <div>
                <span>账户完成度</span>
                <strong>{completionPercent}%</strong>
              </div>
              <div>
                <span>积分流水</span>
                <strong>{ledger.length}</strong>
              </div>
            </div>
          </article>

          <article className="panel checkin-panel overview-checkin">
            <PanelTitle icon={<CalendarCheck2 size={18} />} meta="+10" title="每日签到" />
            <div className="checkin-card">
              <div className="checkin-hero">
                <div>
                  <span>当前连续</span>
                  <strong>
                    {currentStreak}
                    <small>天</small>
                  </strong>
                </div>
                <b className={checkedInToday ? "today-state done" : "today-state"}>{checkedInToday ? "今日已完成" : "今日待签到"}</b>
              </div>
              <div className="checkin-week" aria-label="7 天签到进度">
                {Array.from({ length: 7 }, (_, index) => (
                  <span className={index < Math.min(currentStreak, 7) ? "done" : ""} key={index} />
                ))}
              </div>
              <div className="checkin-target">
                <div>
                  <span>下个奖励</span>
                  <strong>
                    {streakTarget} 天 / +{nextStreakReward?.points || 0}
                  </strong>
                </div>
                <small>{daysToNextReward ? `还差 ${daysToNextReward} 天` : "奖励节点已达成"}</small>
              </div>
              <div className="checkin-progress" aria-hidden="true">
                <span style={{ width: `${streakProgress}%` }} />
              </div>
              <p>{accountReady ? "每天签到增加 10 积分，连续签到会触发额外奖励。" : "完成邮箱绑定和账户资料后，就可以开始每日签到。"}</p>
            </div>
            <button className="primary-action checkin-action" disabled={!wallet || busy || checkedInToday} onClick={checkIn} type="button">
              {checkedInToday ? "今天已签到" : "签到"}
            </button>
          </article>
        </section>

        {!isSupabaseConfigured ? (
          <section className="notice-panel">Supabase 环境变量缺失，请先配置项目 URL 和 anon key。</section>
        ) : null}

        <section className="task-strip" aria-label="积分任务">
          <StepPill active={Boolean(wallet)} label="连接钱包" value="+10" />
          <StepPill active={Boolean(profile?.email_verified)} label="绑定邮箱" value="+20" />
          <StepPill active={profileComplete} label="创建资料" value="+30" />
          <StepPill active={Boolean(checkedInToday)} label="每日签到" value="+10" />
        </section>

        <section id="account" className="content-grid">
          <article className="panel profile-panel">
            <PanelTitle icon={<UserRound size={18} />} title="账户资料" />
            <div className="profile-overview">
              <div className="profile-preview">
                <AvatarPreview className="profile-avatar" value={draft.avatar_url} />
                <div>
                  <strong>{draft.nickname.trim() || "设置你的公开昵称"}</strong>
                  <small>{draft.gender ? `${genderLabel(draft.gender)} · 自定义头像` : "上传头像、设置昵称和性别后激活账户资料"}</small>
                </div>
              </div>
              <div className={profileComplete ? "profile-score ready" : "profile-score"}>
                <span>{profileRequiredDone}/3</span>
                <strong>{profileComplete ? "资料已锁定账户身份" : "完成必填项领取 30 积分"}</strong>
              </div>
            </div>
            <div className="profile-requirements" aria-label="资料完成项">
              <CheckItem done={Boolean(draft.avatar_url)} label="头像" />
              <CheckItem done={Boolean(draft.nickname.trim())} label="昵称" />
              <CheckItem done={Boolean(draft.gender)} label="性别" />
            </div>
            <form className="profile-form" onSubmit={saveProfile}>
              <div className="avatar-upload-card">
                <AvatarPreview className="upload-avatar" value={draft.avatar_url} />
                <div>
                  <strong>上传头像</strong>
                  <span>支持 JPG、PNG、WebP，系统会自动裁剪成方形头像。</span>
                </div>
                <label className={!wallet || busy ? "upload-button disabled" : "upload-button"}>
                  选择图片
                  <input accept="image/png,image/jpeg,image/webp" disabled={!wallet || busy} onChange={handleAvatarUpload} type="file" />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  昵称
                  <input
                    disabled={!wallet || busy}
                    maxLength={24}
                    onChange={(event) => setDraft((current) => ({ ...current, nickname: event.target.value }))}
                    required
                    value={draft.nickname}
                  />
                </label>
                <label>
                  性别
                  <select
                    disabled={!wallet || busy}
                    onChange={(event) => setDraft((current) => ({ ...current, gender: event.target.value as ProfileDraft["gender"] }))}
                    required
                    value={draft.gender}
                  >
                    <option value="">请选择</option>
                    <option value="male">男</option>
                    <option value="female">女</option>
                    <option value="other">其他</option>
                  </select>
                </label>
              </div>
              <label>
                简介
                <textarea
                  disabled={!wallet || busy}
                  maxLength={160}
                  onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
                  rows={4}
                  value={draft.bio}
                />
              </label>
              <button className="primary-action" disabled={!wallet || busy} type="submit">
                保存资料
              </button>
            </form>
          </article>

          <aside className="action-stack">
            <article className="panel">
              <PanelTitle icon={<Mail size={18} />} meta="+20" title="邮箱验证" />
              <form className="stack-form" onSubmit={sendEmailLink}>
                <input
                  disabled={!wallet || busy || Boolean(profile?.email_verified)}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  type="email"
                  value={email}
                />
                <div className="button-row">
                  <button disabled={!wallet || busy || Boolean(profile?.email_verified)} type="submit">
                    发送验证邮件
                  </button>
                  <button disabled={!wallet || busy} onClick={claimEmailManually} type="button">
                    检查验证
                  </button>
                </div>
              </form>
            </article>

          </aside>
        </section>

        <section id="rewards" className="reward-grid">
          <article className="panel invite-panel">
            <PanelTitle icon={<Users size={18} />} meta="+50" title="邀请好友" />
            <div className="invite-box">
              <small>邀请码</small>
              <strong>{profile?.invite_code || "连接钱包后生成"}</strong>
            </div>
            <button className="copy-button" disabled={!inviteLink} onClick={copyInviteLink} type="button">
              <Copy size={16} />
              复制邀请链接
            </button>
            <p className="fine-print">好友通过邀请链接进入，并完成钱包、邮箱和资料后，邀请人获得 50 积分。</p>
          </article>

          <article className="panel rules-panel">
            <PanelTitle icon={<Trophy size={18} />} title="奖励规则" />
            <div className="rules-grid">
              {pointRules.map((rule) => (
                <div className="rule-card" key={rule.key}>
                  <strong>+{rule.points}</strong>
                  <span>{rule.title}</span>
                  <small>{rule.detail}</small>
                </div>
              ))}
            </div>
            <div className="streak-row">
              {streakRewards.map((reward) => (
                <div key={reward.days}>
                  <small>{reward.days} 天连续签到</small>
                  <strong>+{reward.points}</strong>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section id="ledger" className="panel ledger-panel">
          <PanelTitle icon={<Database size={18} />} meta={`${ledger.length} 条`} title="积分流水" />
          <div className="ledger-list">
            {ledger.map((item) => (
              <div className="ledger-row" key={item.id}>
                <div>
                  <span>{describeReason(item.reason, item.description)}</span>
                  <small>{formatDateTime(item.created_at)}</small>
                </div>
                <strong>+{item.points}</strong>
              </div>
            ))}
            {!ledger.length ? <p className="empty-state">暂无积分流水。</p> : null}
          </div>
        </section>

        <section className="risk-note">
          <ShieldCheck size={20} />
          <p>Somnia Points 是平台内参与记录，不是代币，不可转让，不承诺收益、空投、股权或兑换。</p>
        </section>
      </section>
    </main>
  );
}

function StepPill({ active, label, value }: { active: boolean; label: string; value: string }) {
  return (
    <div className={active ? "step-pill done" : "step-pill"}>
      <CheckCircle2 size={16} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={done ? "check-item done" : "check-item"}>
      <CheckCircle2 size={15} />
      {label}
    </span>
  );
}

function PanelTitle({ icon, meta, title }: { icon?: ReactNode; meta?: string; title: string }) {
  return (
    <div className="panel-head">
      <span>
        {icon}
        {title}
      </span>
      {meta ? <small>{meta}</small> : null}
    </div>
  );
}

function AvatarPreview({ className, value }: { className: string; value: string }) {
  if (value && (value.startsWith("data:image/") || value.startsWith("http"))) {
    return <img alt="" className={className} src={value} />;
  }

  return <span className={value ? `${className} ${value}` : `${className} empty`} />;
}

function genderLabel(value: ProfileDraft["gender"]) {
  const labels: Record<Exclude<ProfileDraft["gender"], "">, string> = {
    female: "女",
    male: "男",
    other: "其他"
  };

  return value ? labels[value] : "";
}

function resizeAvatar(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const size = Math.min(image.naturalWidth, image.naturalHeight);
      const sourceX = Math.round((image.naturalWidth - size) / 2);
      const sourceY = Math.round((image.naturalHeight - size) / 2);
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("Canvas is not available."));
        return;
      }

      context.drawImage(image, sourceX, sourceY, size, size, 0, 0, 256, 256);
      resolve(canvas.toDataURL("image/jpeg", 0.84));
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image could not be loaded."));
    };

    image.src = objectUrl;
  });
}

function SomniaMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="12" fill="#111316" />
      <path
        d="M40.8 17.5C31.1 18.2 23.5 26.2 23.5 36c0 4.8 1.8 9.1 4.8 12.4C19.8 46.6 13.5 39 13.5 30c0-9.9 7.6-18.1 17.3-18.9 4-.3 7.4 1 10 3.4 1.1 1 .7 2.9 0 3Z"
        fill="#F8F4EA"
      />
      <path
        d="M22 42.5c8.5 7.7 21.5 6.8 28.8-1.9"
        fill="none"
        stroke="#0B8F7D"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <path
        d="m44 29 5.4 5.4L58 24.8"
        fill="none"
        stroke="#D5A036"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4.2"
      />
      <circle cx="48" cy="13.5" r="3.5" fill="#BD5B4B" />
    </svg>
  );
}
