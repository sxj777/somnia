"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  BadgeCheck,
  CalendarCheck2,
  CheckCircle2,
  Copy,
  Mail,
  ShieldCheck,
  Trophy,
  UserRound,
  Users,
  Wallet
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import {
  avatarOptions,
  describeReason,
  formatDateTime,
  generateInviteCode,
  isProfileComplete,
  normalizeAddress,
  pointRules,
  shortAddress,
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
  const checkedInToday = latestCheckin?.checkin_date === todayKey();
  const profileComplete = isProfileComplete(profile);
  const accountReady = Boolean(profile?.email_verified && profileComplete);
  const completedSteps = [Boolean(wallet), Boolean(profile?.email_verified), profileComplete, Boolean(checkedInToday)].filter(Boolean).length;
  const completionPercent = Math.round((completedSteps / 4) * 100);
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
    <main className="points-page">
      <header className="topbar">
        <a className="brand" href="/">
          <img className="brand-mark" src="/icon.svg" alt="" />
          <span>
            <strong>Somnia Points</strong>
            <small>Account Center</small>
          </span>
        </a>
        <div className="topbar-meta" aria-label="产品状态">
          <span>Beta</span>
          <span>Supabase</span>
        </div>
        <ConnectButton label="连接钱包" showBalance={false} />
      </header>

      <section className="command-hero">
        <div className="hero-copy">
          <p className="eyebrow">Somnia Points</p>
          <h1>正式积分账户中心</h1>
          <p>首版专注账户系统和积分系统：连接钱包、绑定邮箱、创建资料、每日签到和邀请好友。</p>
          <div className="hero-actions">
            <span className={accountReady ? "state-chip ok" : "state-chip"}>{accountReady ? "账户已就绪" : "账户待完善"}</span>
            <span className="state-chip">{wallet ? shortAddress(wallet) : "未连接钱包"}</span>
          </div>
        </div>

        <aside className="score-console" aria-label="积分总览">
          <div className="console-head">
            <span>Current Balance</span>
            <BadgeCheck size={18} />
          </div>
          <strong>{totalPoints}</strong>
          <div className="progress-block">
            <div>
              <span>账户完成度</span>
              <b>{completionPercent}%</b>
            </div>
            <div className="progress-track" aria-hidden="true">
              <span style={{ width: `${completionPercent}%` }} />
            </div>
          </div>
        </aside>
      </section>

      {!isSupabaseConfigured ? (
        <section className="notice-panel">Supabase 环境变量缺失，请先配置项目 URL 和 anon key。</section>
      ) : null}

      <section className="status-strip" aria-label="账户进度">
        <StepPill active={Boolean(wallet)} label="连接钱包" value="+10" />
        <StepPill active={Boolean(profile?.email_verified)} label="绑定邮箱" value="+20" />
        <StepPill active={profileComplete} label="创建资料" value="+30" />
        <StepPill active={Boolean(checkedInToday)} label="每日签到" value="+10" />
      </section>

      <section className="dashboard-grid">
        <article className="panel summary-panel">
          <PanelTitle icon={<Wallet size={18} />} meta={busy ? "同步中" : profile ? "已创建" : "等待连接"} title="账户身份" />
          <div className={wallet ? "wallet-line" : "wallet-line muted-wallet"}>{wallet ? shortAddress(wallet) : "等待钱包连接"}</div>
          <div className="summary-list">
            <Row label="邮箱" value={profile?.email_verified ? profile.email || "已绑定" : "未绑定"} done={Boolean(profile?.email_verified)} />
            <Row label="资料" value={profileComplete ? "已完成" : "未完成"} done={profileComplete} />
            <Row label="今日签到" value={checkedInToday ? "已签到" : "未签到"} done={Boolean(checkedInToday)} />
          </div>
          <p className="status-text">{status}</p>
        </article>

        <article className="panel email-panel">
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

        <article className="panel checkin-panel">
          <PanelTitle icon={<CalendarCheck2 size={18} />} meta="+10" title="每日签到" />
          <div className="streak-number">
            <span>连续签到</span>
            <strong>{latestCheckin?.streak_day ?? 0}</strong>
          </div>
          <button className="full-button" disabled={!wallet || busy || checkedInToday} onClick={checkIn} type="button">
            {checkedInToday ? "今天已签到" : "签到"}
          </button>
        </article>
      </section>

      <section className="work-grid">
        <article className="panel profile-panel">
          <PanelTitle icon={<UserRound size={18} />} meta="+30" title="账户资料" />
          <form className="profile-form" onSubmit={saveProfile}>
            <div className="avatar-grid" role="radiogroup" aria-label="头像">
              {avatarOptions.map((avatar) => (
                <button
                  className={draft.avatar_url === avatar.value ? "selected" : ""}
                  disabled={!wallet || busy}
                  key={avatar.value}
                  onClick={() => setDraft((current) => ({ ...current, avatar_url: avatar.value }))}
                  type="button"
                >
                  <span className={`avatar-dot ${avatar.value}`} />
                  {avatar.label}
                </button>
              ))}
            </div>
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
            <button className="full-button" disabled={!wallet || busy} type="submit">
              保存资料
            </button>
          </form>
        </article>

        <aside className="side-stack">
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

          <article className="panel rewards-panel">
            <PanelTitle icon={<Trophy size={18} />} title="连续签到奖励" />
            <div className="streak-rewards">
              {streakRewards.map((reward) => (
                <div key={reward.days}>
                  <small>{reward.days} 天</small>
                  <strong>+{reward.points}</strong>
                </div>
              ))}
            </div>
          </article>
        </aside>
      </section>

      <section className="rules-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Rules</p>
            <h2>积分获取规则</h2>
          </div>
        </div>
        <div className="rules-grid">
          {pointRules.map((rule) => (
            <div className="rule-card" key={rule.key}>
              <strong>+{rule.points}</strong>
              <span>{rule.title}</span>
              <small>{rule.detail}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel ledger-panel">
        <PanelTitle meta={`${ledger.length} 条`} title="积分流水" />
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

function PanelTitle({ icon, meta, title }: { icon?: React.ReactNode; meta?: string; title: string }) {
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

function Row({ label, value, done }: { label: string; value: string; done: boolean }) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <strong className={done ? "ok" : ""}>{value}</strong>
    </div>
  );
}
