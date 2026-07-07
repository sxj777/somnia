"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileText,
  Globe2,
  Heart,
  Megaphone,
  Medal,
  ShieldCheck,
  Sparkles,
  Trophy
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import {
  categories,
  displayDurationDays,
  featuredFeeUnits,
  featuredFeeUsdc,
  feeSplit,
  hasOnchainConfig,
  publishFeeUnits,
  publishFeeUsdc,
  somniaContractAddress,
  somniaDeployBlock,
  usdcAddress
} from "@/lib/config";
import { Lang, tr } from "@/lib/i18n";
import {
  addPointsEvent,
  applyCheckIn,
  awardIdentityPoints,
  buildLeaderboard,
  createPointsLedger,
  getLocalDateKey,
  getPointsLevel,
  loadPointsLedger,
  normalizeAddress,
  pointsRules,
  savePointsLedger,
  shortAddress,
  type PointsEvent,
  type PointsLedger
} from "@/lib/points";
import { erc20Abi, somniaDreamRegistryAbi } from "@/lib/somniaAbi";

type Dream = {
  id: number;
  title: Record<Lang, string>;
  category: string;
  summary: Record<Lang, string>;
  author: string;
  signals: number;
  paid: number;
  featured: boolean;
  expiresAt: string;
};

type DreamMetadata = {
  title?: string;
  category?: string;
  summary?: string;
  note?: string;
  creator?: string;
  featured?: boolean;
  paid?: number;
  expiresAt?: string;
};

type DreamPublishedLog = {
  args: {
    dreamId?: bigint;
    creator?: `0x${string}`;
    contentHash?: string;
    category?: string;
    paid?: bigint;
    expiresAt?: bigint;
    featured?: boolean;
  };
};

type SomniaPublicClient = NonNullable<ReturnType<typeof usePublicClient>>;

const days = 24 * 60 * 60 * 1000;
const demoStartTime = Date.UTC(2026, 6, 4, 8, 0, 0);
const shouldLoadOnchainDreams = Boolean(somniaContractAddress);
const dreamCacheKey = "somnia.dreams.v1";
const dreamCacheTtlMs = 60_000;
const eventScanBlockWindow = 150_000n;
const eventScanChunkSize = 1_900n;
const eventScanConcurrency = 6;

const starterDreams: Dream[] = [
  {
    id: 1,
    title: {
      en: "Neighborhood care desk",
      zh: "社区健康服务点"
    },
    category: "Healthcare",
    summary: {
      en: "A light clinic workflow for elderly communities with checkups, reminders, and family reports.",
      zh: "为老人社区提供轻量健康检查、提醒和家属报告的服务流程。"
    },
    author: "0x8c22...9d10",
    signals: 38,
    paid: 100,
    featured: true,
    expiresAt: new Date(demoStartTime + 3 * days).toISOString()
  },
  {
    id: 2,
    title: {
      en: "AI renovation inspector",
      zh: "AI 装修验收助手"
    },
    category: "AI",
    summary: {
      en: "Upload construction photos and receive a first-pass checklist for budget, quality, and risks.",
      zh: "上传施工照片，生成预算、质量和风险的初步检查清单。"
    },
    author: "0x42a1...c931",
    signals: 26,
    paid: 100,
    featured: true,
    expiresAt: new Date(demoStartTime + 2 * days).toISOString()
  },
  {
    id: 3,
    title: {
      en: "Open grant board for small creators",
      zh: "小创作者开放资助板"
    },
    category: "Public Goods",
    summary: {
      en: "A transparent board where community funds help makers ship small tools, zines, and prototypes.",
      zh: "用透明看板帮助创作者交付小工具、内容作品和原型。"
    },
    author: "0x19f7...ab04",
    signals: 19,
    paid: 10,
    featured: false,
    expiresAt: new Date(demoStartTime + days).toISOString()
  }
];

function SomniaMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" width="42" height="42" aria-hidden="true" focusable="false">
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

export default function Home() {
  const [lang, setLang] = useState<Lang>("en");
  const [dreams, setDreams] = useState<Dream[]>(shouldLoadOnchainDreams ? [] : starterDreams);
  const [dataSource, setDataSource] = useState<"sample" | "onchain">(shouldLoadOnchainDreams ? "onchain" : "sample");
  const [isLoadingDreams, setIsLoadingDreams] = useState(shouldLoadOnchainDreams);
  const [sort, setSort] = useState<"hot" | "new" | "signals">("hot");
  const [placement, setPlacement] = useState<"standard" | "featured">("standard");
  const [status, setStatus] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [pointsLedger, setPointsLedger] = useState<PointsLedger | undefined>();
  const { isConnected, address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  useEffect(() => {
    if (!address) {
      setPointsLedger(undefined);
      return;
    }

    const loaded = loadPointsLedger(address);
    setPointsLedger(awardIdentityPoints(loaded, address));
  }, [address]);

  useEffect(() => {
    if (pointsLedger) savePointsLedger(pointsLedger);
  }, [pointsLedger]);

  useEffect(() => {
    let cancelled = false;

    async function loadOnchainDreams() {
      if (!publicClient || !somniaContractAddress) return;

      const cachedDreams = loadCachedDreams();
      if (cachedDreams.length > 0) {
        setDreams(cachedDreams);
        setDataSource("onchain");
        if (isDreamCacheFresh()) {
          setIsLoadingDreams(false);
          return;
        }
      }

      setIsLoadingDreams(true);
      try {
        const latestBlock = await publicClient.getBlockNumber();
        const fallbackStart = getRecentEventStartBlock(0n, latestBlock);
        const events = await getPublishedDreamEvents(
          publicClient,
          somniaDeployBlock ?? fallbackStart,
          latestBlock
        );

        const loadedDreams = (
          await Promise.all(events.map((event) => dreamFromPublishedLog(event as DreamPublishedLog)))
        ).filter((dream): dream is Dream => Boolean(dream));

        if (!cancelled) {
          const sortedLoadedDreams = loadedDreams.sort((a, b) => b.id - a.id);
          setDreams(sortedLoadedDreams);
          saveCachedDreams(sortedLoadedDreams);
          setDataSource("onchain");
        }
      } catch (error) {
        console.error("Failed to load onchain Dreams", error);
      } finally {
        if (!cancelled) setIsLoadingDreams(false);
      }
    }

    void loadOnchainDreams();

    return () => {
      cancelled = true;
    };
  }, [publicClient]);

  const liveDreams = useMemo(
    () => dreams.filter((dream) => Date.parse(dream.expiresAt) > Date.now()),
    [dreams]
  );
  const selectedFee = placement === "featured" ? Number(featuredFeeUsdc) : Number(publishFeeUsdc);
  const selectedFeeUnits = placement === "featured" ? featuredFeeUnits : publishFeeUnits;
  const totalSignals = liveDreams.reduce((sum, dream) => sum + dream.signals, 0);
  const gross = liveDreams.reduce((sum, dream) => sum + dream.paid, 0);
  const pointsLevel = getPointsLevel(pointsLedger?.total ?? 0);
  const todayKey = getLocalDateKey();
  const hasCheckedInToday = pointsLedger?.lastCheckInDate === todayKey;
  const leaderboard = useMemo(() => buildLeaderboard(pointsLedger, address, lang), [pointsLedger, address, lang]);

  const sortedDreams = useMemo(() => {
    const cloned = [...liveDreams];
    if (sort === "signals") return cloned.sort((a, b) => b.signals - a.signals);
    if (sort === "new") return cloned.sort((a, b) => b.id - a.id);
    return cloned.sort((a, b) => b.signals * 2 + b.id - (a.signals * 2 + a.id));
  }, [liveDreams, sort]);

  async function publishDream(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const category = String(form.get("category") || "");
    const summary = String(form.get("summary") || "").trim();
    const note = String(form.get("note") || "").trim();
    const featured = placement === "featured";

    if (!isConnected || !address) {
      setStatus(tr(lang, "missingWallet"));
      return;
    }

    if (!hasOnchainConfig || !somniaContractAddress || !usdcAddress) {
      setStatus(tr(lang, "publishDisabled"));
      return;
    }

    setIsPublishing(true);
    setStatus(tr(lang, "publishing"));

    try {
      const expiresAt = new Date(Date.now() + displayDurationDays * days).toISOString();
      const ipfsResponse = await fetch("/api/ipfs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          summary,
          note,
          creator: address,
          featured,
          paid: selectedFee,
          displayDurationDays,
          createdAt: new Date().toISOString(),
          expiresAt
        })
      });

      if (!ipfsResponse.ok) {
        const errorBody = (await ipfsResponse.json().catch(() => undefined)) as { error?: string } | undefined;
        throw new Error(errorBody?.error || "IPFS_FAILED");
      }

      const { uri } = (await ipfsResponse.json()) as { uri: string };
      const approvalHash = await writeContractAsync({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [somniaContractAddress, selectedFeeUnits]
      });

      await publicClient?.waitForTransactionReceipt({ hash: approvalHash });

      const publishHash = await writeContractAsync({
        address: somniaContractAddress,
        abi: somniaDreamRegistryAbi,
        functionName: "publishDreamWithPlacement",
        args: [uri, category, featured]
      });

      await publicClient?.waitForTransactionReceipt({ hash: publishHash });

      const nextDreamId = Math.max(0, ...dreams.map((dream) => dream.id)) + 1;
      setDreams((current) => [
        {
          id: nextDreamId,
          title: { en: title, zh: title },
          category,
          summary: { en: summary, zh: summary },
          author: shortAddress(address),
          signals: 0,
          paid: selectedFee,
          featured,
          expiresAt
        },
        ...current
      ]);
      setDataSource("onchain");
      setStatus(tr(lang, "published"));
      awardPoints({
        id: `publish:${normalizeAddress(address)}:${nextDreamId}`,
        reason: "publish",
        points: 100,
        label: { en: `Published Dream #${nextDreamId}`, zh: `发布 Dream #${nextDreamId}` },
        createdAt: new Date().toISOString(),
        dreamId: nextDreamId
      });
      event.currentTarget.reset();
      setPlacement("standard");
    } catch (error) {
      if (error instanceof Error && error.message === "PINATA_FORBIDDEN") {
        setStatus(tr(lang, "pinataForbidden"));
      } else if (error instanceof Error && error.message === "PINATA_NETWORK") {
        setStatus(tr(lang, "pinataNetwork"));
      } else {
        setStatus(error instanceof Error && error.message === "IPFS_FAILED" ? tr(lang, "ipfsFailed") : String(error));
      }
    } finally {
      setIsPublishing(false);
    }
  }

  function awardPoints(event: PointsEvent, markSignaledDreamId?: number) {
    setPointsLedger((current) => {
      const base = current ?? (address ? createPointsLedger(address) : undefined);
      if (!base) return current;
      const next = addPointsEvent(base, event);
      if (typeof markSignaledDreamId !== "number" || next.signaledDreamIds.includes(markSignaledDreamId)) return next;
      return {
        ...next,
        signaledDreamIds: [...next.signaledDreamIds, markSignaledDreamId],
        updatedAt: new Date().toISOString()
      };
    });
  }

  function checkIn() {
    if (!isConnected || !address) {
      setStatus(tr(lang, "missingWallet"));
      return;
    }

    if (pointsLedger?.lastCheckInDate === getLocalDateKey()) {
      setStatus(tr(lang, "pointsCheckInAlready"));
      return;
    }

    setPointsLedger((current) => {
      const base = current ?? createPointsLedger(address);
      return applyCheckIn(base, address).ledger;
    });
    setStatus(tr(lang, "pointsCheckInAdded"));
  }

  function signalDream(dream: Dream) {
    if (!isConnected || !address) {
      setStatus(tr(lang, "missingWallet"));
      return;
    }

    if (dream.author === shortAddress(address)) {
      setStatus(tr(lang, "pointsSelfSignalBlocked"));
      return;
    }

    if (pointsLedger?.signaledDreamIds.includes(dream.id)) {
      setStatus(tr(lang, "pointsSignalAlready"));
      return;
    }

    setDreams((current) =>
      current.map((item) => item.id === dream.id ? { ...item, signals: item.signals + 1 } : item)
    );
    awardPoints(
      {
        id: `signal:${normalizeAddress(address)}:${dream.id}`,
        reason: "signalSent",
        points: 5,
        label: { en: `Signaled Dream #${dream.id}`, zh: `支持 Dream #${dream.id}` },
        createdAt: new Date().toISOString(),
        dreamId: dream.id
      },
      dream.id
    );
    setStatus(tr(lang, "pointsSignalAdded"));
  }

  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="brand" href="#home" aria-label="Somnia home">
          <SomniaMark />
          <span>
            <strong>Somnia</strong>
            <small>{tr(lang, "brandLine")}</small>
          </span>
        </a>
        <nav className="nav-links" aria-label="Primary navigation">
          <a href="#how">{tr(lang, "navHow")}</a>
          <a href="/points">{tr(lang, "navPoints")}</a>
          <a href="#plaza">{tr(lang, "navPlaza")}</a>
          <a href="#publish">{tr(lang, "navPublish")}</a>
          <a href="#rewards">{tr(lang, "navRewards")}</a>
          <a href="#faq">{tr(lang, "navFaq")}</a>
        </nav>
        <div className="header-actions">
          <div className="segmented">
            <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")} type="button">
              EN
            </button>
            <button className={lang === "zh" ? "active" : ""} onClick={() => setLang("zh")} type="button">
              中文
            </button>
          </div>
          <ConnectButton label={tr(lang, "connectWallet")} showBalance={false} />
        </div>
      </header>

      <section id="home" className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">
            <Globe2 size={15} />
            {tr(lang, "liveAlpha")}
          </p>
          <h1>{tr(lang, "heroTitle")}</h1>
          <p>{tr(lang, "heroBody")}</p>
          <div className="hero-actions">
            <a className="primary-link" href="#publish">
              {tr(lang, "primaryCta")}
              <ArrowRight size={17} />
            </a>
            <a className="secondary-link" href="#how">
              {tr(lang, "secondaryCta")}
            </a>
          </div>
        </div>

        <div className="hero-product" aria-label="Somnia product preview">
          <div className="preview-top">
            <span />
            <span />
            <span />
          </div>
          <div className="preview-spotlight">
            <small>{tr(lang, "featuredPlacement")}</small>
            <strong>{starterDreams[0].title[lang]}</strong>
            <p>{starterDreams[0].summary[lang]}</p>
          </div>
          <div className="preview-grid">
            <MiniStat label={tr(lang, "publishFee")} value={`${publishFeeUsdc} USDC`} />
            <MiniStat label={tr(lang, "featuredFee")} value={`${featuredFeeUsdc} USDC`} />
            <MiniStat label={tr(lang, "totalSignals")} value={totalSignals} />
          </div>
        </div>
      </section>

      <section className="metrics">
        <Metric icon={<Sparkles size={19} />} label={tr(lang, "totalDreams")} value={liveDreams.length} />
        <Metric icon={<Megaphone size={19} />} label={tr(lang, "featuredFee")} value={`${featuredFeeUsdc} USDC`} />
        <Metric icon={<Heart size={19} />} label={tr(lang, "totalSignals")} value={totalSignals} />
        <Metric icon={<Medal size={19} />} label={tr(lang, "points")} value={pointsLedger?.total ?? 0} />
      </section>

      <section id="how" className="section-block">
        <div className="section-intro">
          <p className="eyebrow">{tr(lang, "howEyebrow")}</p>
          <h2>{tr(lang, "howTitle")}</h2>
        </div>
        <div className="step-grid">
          <StepCard number="01" title={tr(lang, "howOneTitle")} body={tr(lang, "howOneBody")} />
          <StepCard number="02" title={tr(lang, "howTwoTitle")} body={tr(lang, "howTwoBody")} />
          <StepCard number="03" title={tr(lang, "howThreeTitle")} body={tr(lang, "howThreeBody")} />
        </div>
      </section>

      <section id="points" className="section-block points-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">{tr(lang, "pointsEyebrow")}</p>
            <h2>{tr(lang, "pointsTitle")}</h2>
          </div>
          <div className="section-actions">
            <span className="tag">{tr(lang, "pointsMvpTag")}</span>
            <a className="secondary-link compact-link" href="/points">{tr(lang, "pointsAccountCta")}</a>
          </div>
        </div>
        <div className="points-layout">
          <div className="points-card points-profile">
            <div className="points-profile-head">
              <div>
                <span>{tr(lang, "pointsProfile")}</span>
                <strong>{isConnected && address ? shortAddress(address) : tr(lang, "connectWallet")}</strong>
              </div>
              <Medal size={30} />
            </div>
            <div className="points-total">
              <strong>{pointsLedger?.total ?? 0}</strong>
              <span>{tr(lang, "points")}</span>
            </div>
            <div className="level-row">
              <span>
                {tr(lang, "pointsLevel")}: {pointsLevel.label[lang]}
              </span>
              <span>{pointsLevel.nextLabel}</span>
            </div>
            <div className="level-meter" aria-hidden="true">
              <span style={{ width: `${pointsLevel.progress}%` }} />
            </div>
            <div className="checkin-panel">
              <div>
                <span>{tr(lang, "pointsCheckInStreak")}</span>
                <strong>{pointsLedger?.checkInStreak ?? 0}</strong>
              </div>
              <button disabled={Boolean(hasCheckedInToday)} onClick={checkIn} type="button">
                {hasCheckedInToday ? tr(lang, "pointsCheckInDone") : tr(lang, "pointsCheckInCta")}
              </button>
            </div>
            <p>{tr(lang, "pointsProfileText")}</p>
          </div>

          <div className="points-card">
            <div className="points-card-head">
              <span>{tr(lang, "pointsActivity")}</span>
              <small>{tr(lang, "pointsLocalOnly")}</small>
            </div>
            <div className="activity-list">
              {(pointsLedger?.events.length ? pointsLedger.events.slice(0, 8) : []).map((event) => (
                <div className="activity-row" key={event.id}>
                  <span>{event.label[lang]}</span>
                  <strong>+{event.points}</strong>
                </div>
              ))}
              {!pointsLedger?.events.length ? <p className="empty-state">{tr(lang, "pointsEmpty")}</p> : null}
            </div>
          </div>

          <div className="points-card rules-card">
            <div className="points-card-head">
              <span>{tr(lang, "pointsRules")}</span>
              <small>{tr(lang, "pointsRulesTag")}</small>
            </div>
            <div className="points-rules">
              {pointsRules.map((rule) => (
                <div className="points-rule" key={rule.reason}>
                  <strong>+{rule.points}</strong>
                  <div>
                    <span>{rule.title[lang]}</span>
                    <p>{rule.body[lang]}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="points-card leaderboard-card">
            <div className="points-card-head">
              <span>
                <Trophy size={16} />
                {tr(lang, "pointsLeaderboard")}
              </span>
              <small>{tr(lang, "pointsLeaderboardTag")}</small>
            </div>
            <div className="leader-list">
              {leaderboard.map((leader, index) => (
                <div className="leader-row" key={`${leader.label}-${index}`}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{leader.label}</strong>
                    <small>{leader.detail}</small>
                  </div>
                  <b>{leader.score}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="points-disclaimer">
          <ShieldCheck size={20} />
          <p>{tr(lang, "pointsDisclaimer")}</p>
        </div>
      </section>

      <section className="product-grid">
        <section id="publish" className="panel publish-panel">
          <PanelHeading eyebrow={tr(lang, "navPublish")} title={tr(lang, "createDream")} tag={`${selectedFee} USDC`} />
          <form className="dream-form" onSubmit={publishDream}>
            <div className="placement-grid" role="radiogroup" aria-label={tr(lang, "placement")}>
              <button
                className={placement === "standard" ? "active" : ""}
                onClick={() => setPlacement("standard")}
                type="button"
              >
                <strong>{tr(lang, "standardPlacement")}</strong>
                <span>{publishFeeUsdc} USDC · {tr(lang, "standardPlacementText")}</span>
              </button>
              <button
                className={placement === "featured" ? "active" : ""}
                onClick={() => setPlacement("featured")}
                type="button"
              >
                <strong>{tr(lang, "featuredPlacement")}</strong>
                <span>{featuredFeeUsdc} USDC · {tr(lang, "featuredPlacementText")}</span>
              </button>
            </div>

            <label>
              <span>{tr(lang, "title")}</span>
              <input name="title" maxLength={72} placeholder={tr(lang, "titlePlaceholder")} required />
            </label>
            <label>
              <span>{tr(lang, "category")}</span>
              <select name="category" required>
                {categories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {tr(lang, category.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{tr(lang, "summary")}</span>
              <input name="summary" maxLength={120} placeholder={tr(lang, "summaryPlaceholder")} required />
            </label>
            <label>
              <span>{tr(lang, "note")}</span>
              <textarea name="note" maxLength={560} placeholder={tr(lang, "notePlaceholder")} rows={5} required />
            </label>

            <button className="primary-button" disabled={isPublishing} type="submit">
              {isPublishing ? tr(lang, "publishing") : tr(lang, "publishDream")}
            </button>
            <p className="status-line">{status || tr(lang, "alphaText")}</p>
          </form>
        </section>

        <section id="rewards" className="panel rewards-panel">
          <PanelHeading eyebrow={tr(lang, "navRewards")} title={tr(lang, "rewardsTitle")} tag="50 / 30 / 20" />
          <p className="panel-copy">{tr(lang, "rewardsBody")}</p>
          <div className="vault-stack">
            {feeSplit.map((item) => (
              <div className="vault-row" key={item.key}>
                <div>
                  <span>{tr(lang, item.key)}</span>
                  <strong>{splitAmount(gross, item.percent)} USDC</strong>
                </div>
                <div className="bar-track">
                  <span style={{ width: `${item.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="rule-box">
            <ShieldCheck size={20} />
            <div>
              <strong>{tr(lang, "noInvestment")}</strong>
              <p>{tr(lang, "noInvestmentText")}</p>
            </div>
          </div>
        </section>
      </section>

      <section id="plaza" className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">{tr(lang, "plaza")}</p>
            <h2>{tr(lang, "communitySignals")}</h2>
          </div>
          <div className="plaza-controls">
            <span className="tag">{tr(lang, isLoadingDreams ? "loadingOnchainDreams" : dataSource === "onchain" ? "onchainData" : "sampleData")}</span>
            <div className="segmented compact">
              {(["hot", "new", "signals"] as const).map((item) => (
                <button className={sort === item ? "active" : ""} key={item} onClick={() => setSort(item)} type="button">
                  {tr(lang, item)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="dream-grid">
          {sortedDreams.map((dream) => (
            <article className={`dream-card ${dream.featured ? "featured" : ""}`} key={dream.id}>
              <div className="card-top">
                <span>{tr(lang, categories.find((item) => item.value === dream.category)?.labelKey || "catAI")}</span>
                <small>Dream #{dream.id}</small>
              </div>
              <div>
                {dream.featured ? <div className="featured-badge">{tr(lang, "featuredBadge")}</div> : null}
                <h3>{dream.title[lang]}</h3>
                <p>{dream.summary[lang]}</p>
              </div>
              <div className="expiry-line">
                <CalendarClock size={15} />
                {tr(lang, "liveUntil")}: {formatDate(dream.expiresAt, lang)}
              </div>
              <div className="card-bottom">
                <small>{dream.author}</small>
                <button
                  type="button"
                  onClick={() => signalDream(dream)}
                >
                  {tr(lang, "signals")} {dream.signals}
                </button>
              </div>
            </article>
          ))}
          {isLoadingDreams ? (
            <p className="empty-state plaza-empty">{tr(lang, "loadingOnchainDreams")}</p>
          ) : null}
          {!isLoadingDreams && sortedDreams.length === 0 ? (
            <p className="empty-state plaza-empty">{tr(lang, "noOnchainDreams")}</p>
          ) : null}
        </div>
      </section>

      <section id="faq" className="section-block faq-block">
        <div className="section-intro">
          <p className="eyebrow">FAQ</p>
          <h2>{tr(lang, "faqTitle")}</h2>
        </div>
        <div className="faq-grid">
          <FaqItem question={tr(lang, "faqOneQ")} answer={tr(lang, "faqOneA")} />
          <FaqItem question={tr(lang, "faqTwoQ")} answer={tr(lang, "faqTwoA")} />
          <FaqItem question={tr(lang, "faqThreeQ")} answer={tr(lang, "faqThreeA")} />
        </div>
      </section>

      <section className="risk-banner">
        <FileText size={22} />
        <div>
          <strong>{tr(lang, "riskTitle")}</strong>
          <p>{tr(lang, "riskBody")}</p>
        </div>
      </section>

      <footer className="site-footer">
        <div className="brand">
          <SomniaMark />
          <span>
            <strong>Somnia</strong>
            <small>{tr(lang, "footerLine")}</small>
          </span>
        </div>
        <div className="footer-links">
          <a href="#how">{tr(lang, "navHow")}</a>
          <a href="/points">{tr(lang, "navPoints")}</a>
          <a href="#publish">{tr(lang, "navPublish")}</a>
          <a href="#faq">{tr(lang, "navFaq")}</a>
        </div>
      </footer>
    </main>
  );
}

async function dreamFromPublishedLog(event: DreamPublishedLog): Promise<Dream | undefined> {
  const { dreamId, creator, contentHash, category, paid, expiresAt, featured } = event.args;
  if (!dreamId || !creator || !contentHash || !category || !paid || !expiresAt) return undefined;

  const metadata = await fetchDreamMetadata(contentHash);
  const title = metadata?.title || `Dream #${dreamId.toString()}`;
  const summary = metadata?.summary || contentHash;

  return {
    id: Number(dreamId),
    title: { en: title, zh: title },
    category: metadata?.category || category,
    summary: { en: summary, zh: summary },
    author: shortAddress(metadata?.creator || creator),
    signals: 0,
    paid: Number(formatUnits(paid, 6)),
    featured: Boolean(metadata?.featured ?? featured),
    expiresAt: new Date(Number(expiresAt) * 1000).toISOString()
  };
}

async function getPublishedDreamEvents(
  publicClient: SomniaPublicClient,
  fromBlock: bigint,
  toBlock: bigint
) {
  if (fromBlock > toBlock) return [];

  const events: DreamPublishedLog[] = [];
  const startBlock = getRecentEventStartBlock(fromBlock, toBlock);
  const ranges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];

  for (let start = startBlock; start <= toBlock; start += eventScanChunkSize + 1n) {
    ranges.push({
      fromBlock: start,
      toBlock: start + eventScanChunkSize > toBlock ? toBlock : start + eventScanChunkSize
    });
  }

  for (let index = 0; index < ranges.length; index += eventScanConcurrency) {
    const batch = ranges.slice(index, index + eventScanConcurrency);
    const chunks = await Promise.all(
      batch.map((range) =>
        publicClient.getContractEvents({
          address: somniaContractAddress,
          abi: somniaDreamRegistryAbi,
          eventName: "DreamPublished",
          fromBlock: range.fromBlock,
          toBlock: range.toBlock
        })
      )
    );
    chunks.forEach((chunk) => events.push(...(chunk as DreamPublishedLog[])));
  }

  return events;
}

function getRecentEventStartBlock(fromBlock: bigint, toBlock: bigint) {
  const recentStart = toBlock > eventScanBlockWindow ? toBlock - eventScanBlockWindow : 0n;
  return fromBlock > recentStart ? fromBlock : recentStart;
}

function loadCachedDreams() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(dreamCacheKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { dreams?: Dream[] };
    return Array.isArray(parsed.dreams) ? parsed.dreams : [];
  } catch {
    return [];
  }
}

function isDreamCacheFresh() {
  if (typeof window === "undefined") return false;

  try {
    const raw = window.localStorage.getItem(dreamCacheKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { updatedAt?: string };
    return typeof parsed.updatedAt === "string" && Date.now() - Date.parse(parsed.updatedAt) < dreamCacheTtlMs;
  } catch {
    return false;
  }
}

function saveCachedDreams(dreams: Dream[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(dreamCacheKey, JSON.stringify({ dreams, updatedAt: new Date().toISOString() }));
}

async function fetchDreamMetadata(uri: string): Promise<DreamMetadata | undefined> {
  try {
    const response = await fetch(ipfsToGatewayUrl(uri), { cache: "no-store" });
    if (!response.ok) return undefined;
    return (await response.json()) as DreamMetadata;
  } catch {
    return undefined;
  }
}

function ipfsToGatewayUrl(uri: string) {
  if (!uri.startsWith("ipfs://")) return uri;
  return `https://gateway.pinata.cloud/ipfs/${uri.replace("ipfs://", "")}`;
}

function splitAmount(total: number, percent: number) {
  return (total * (percent / 100)).toLocaleString(undefined, {
    maximumFractionDigits: 2
  });
}

function formatDate(value: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai"
  }).format(new Date(value));
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <article className="metric">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function StepCard({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <article className="step-card">
      <span>{number}</span>
      <CheckCircle2 size={22} />
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

function PanelHeading({ eyebrow, title, tag }: { eyebrow: string; title: string; tag: string }) {
  return (
    <div className="section-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <span className="tag">{tag}</span>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <article className="faq-item">
      <h3>{question}</h3>
      <p>{answer}</p>
    </article>
  );
}
