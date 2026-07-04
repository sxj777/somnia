"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  CalendarClock,
  FileCode2,
  Globe2,
  Hammer,
  Heart,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Wallet
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
      zh: "上传施工照片，自动生成预算、质量和风险的初步检查清单。"
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
      zh: "一个透明看板，用社区资金帮助创作者交付小工具、内容作品和原型。"
    },
    author: "0x19f7...ab04",
    signals: 19,
    paid: 10,
    featured: false,
    expiresAt: new Date(demoStartTime + days).toISOString()
  }
];

export default function Home() {
  const [lang, setLang] = useState<Lang>("en");
  const [dreams, setDreams] = useState(starterDreams);
  const [dataSource, setDataSource] = useState<"sample" | "onchain">("sample");
  const [isLoadingDreams, setIsLoadingDreams] = useState(false);
  const [sort, setSort] = useState<"hot" | "new" | "signals">("hot");
  const [placement, setPlacement] = useState<"standard" | "featured">("standard");
  const [activeFeature, setActiveFeature] = useState(0);
  const [status, setStatus] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const { isConnected, address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  useEffect(() => {
    let cancelled = false;

    async function loadOnchainDreams() {
      if (!publicClient || !somniaContractAddress) return;

      setIsLoadingDreams(true);
      try {
        const latestBlock = await publicClient.getBlockNumber();
        const fallbackStart = latestBlock > 1900n ? latestBlock - 1900n : 0n;
        const events = await getPublishedDreamEvents(
          publicClient,
          somniaDeployBlock ?? fallbackStart,
          latestBlock
        );

        const loadedDreams = (
          await Promise.all(events.map((event) => dreamFromPublishedLog(event as DreamPublishedLog)))
        ).filter((dream): dream is Dream => Boolean(dream));

        if (!cancelled && loadedDreams.length > 0) {
          setDreams(loadedDreams.sort((a, b) => b.id - a.id));
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
  const featuredDreams = liveDreams.filter((dream) => dream.featured);
  const selectedFee = placement === "featured" ? Number(featuredFeeUsdc) : Number(publishFeeUsdc);
  const selectedFeeUnits = placement === "featured" ? featuredFeeUnits : publishFeeUnits;
  const totalSignals = liveDreams.reduce((sum, dream) => sum + dream.signals, 0);
  const gross = liveDreams.reduce((sum, dream) => sum + dream.paid, 0);

  const sortedDreams = useMemo(() => {
    const cloned = [...liveDreams];
    if (sort === "signals") return cloned.sort((a, b) => b.signals - a.signals);
    if (sort === "new") return cloned.sort((a, b) => b.id - a.id);
    return cloned.sort((a, b) => b.signals * 2 + b.id - (a.signals * 2 + a.id));
  }, [liveDreams, sort]);

  useEffect(() => {
    if (featuredDreams.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveFeature((current) => (current + 1) % featuredDreams.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [featuredDreams.length]);

  const featuredDream = featuredDreams[activeFeature % Math.max(featuredDreams.length, 1)];

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

      setDreams((current) => [
        {
          id: Math.max(0, ...current.map((dream) => dream.id)) + 1,
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

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>Somnia</strong>
            <span>{tr(lang, "brandLine")}</span>
          </div>
        </div>

        <nav className="nav-stack" aria-label="Somnia navigation">
          <a href="#featured">{tr(lang, "navFeatured")}</a>
          <a href="#plaza">{tr(lang, "navPlaza")}</a>
          <a href="#publish">{tr(lang, "navPublish")}</a>
          <a href="#vault">{tr(lang, "navVault")}</a>
          <a href="#review">{tr(lang, "navReview")}</a>
        </nav>

        <section className="side-section">
          <p className="eyebrow">{tr(lang, "language")}</p>
          <div className="segmented">
            <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")} type="button">
              EN
            </button>
            <button className={lang === "zh" ? "active" : ""} onClick={() => setLang("zh")} type="button">
              中文
            </button>
          </div>
        </section>

        <section className="side-section wallet-section">
          <p className="eyebrow">{tr(lang, "wallet")}</p>
          <ConnectButton label={tr(lang, "connectWallet")} showBalance={false} />
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Somnia Alpha</p>
            <h1>{tr(lang, "heroTitle")}</h1>
            <p>{tr(lang, "heroBody")}</p>
          </div>
          <span className="chain-pill">
            <Globe2 size={16} />
            {tr(lang, "baseReady")}
          </span>
        </header>

        <section className="metrics">
          <Metric icon={<Sparkles size={19} />} label={tr(lang, "totalDreams")} value={liveDreams.length} />
          <Metric icon={<Megaphone size={19} />} label={tr(lang, "featuredFee")} value={`${featuredFeeUsdc} USDC`} />
          <Metric icon={<Heart size={19} />} label={tr(lang, "totalSignals")} value={totalSignals} />
          <Metric icon={<Wallet size={19} />} label={tr(lang, "publishFee")} value={`${publishFeeUsdc} USDC`} />
        </section>

        <section id="featured" className="spotlight-panel">
          <div className="spotlight-copy">
            <p className="eyebrow">{tr(lang, "spotlight")}</p>
            <h2>{featuredDream ? featuredDream.title[lang] : tr(lang, "featuredPlacement")}</h2>
            <p>{featuredDream ? featuredDream.summary[lang] : tr(lang, "featuredPlacementText")}</p>
            <div className="spotlight-meta">
              <span>
                <Megaphone size={16} />
                {featuredFeeUsdc} USDC
              </span>
              <span>
                <CalendarClock size={16} />
                {tr(lang, "displayWindow")}: {tr(lang, "threeDays")}
              </span>
              {featuredDream ? <span>{formatDate(featuredDream.expiresAt, lang)}</span> : null}
            </div>
          </div>
          <div className="spotlight-dots" aria-label="Featured dream carousel">
            {featuredDreams.map((dream, index) => (
              <button
                aria-label={`Show featured dream ${index + 1}`}
                className={index === activeFeature ? "active" : ""}
                key={dream.id}
                onClick={() => setActiveFeature(index)}
                type="button"
              />
            ))}
          </div>
        </section>

        <section className="grid-two">
          <section id="publish" className="panel">
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

              <div className="split-grid">
                {feeSplit.map((item) => (
                  <div key={item.key}>
                    <span>{tr(lang, item.key)}</span>
                    <strong>{splitAmount(selectedFee, item.percent)} USDC</strong>
                  </div>
                ))}
              </div>

              <button className="primary-button" disabled={isPublishing} type="submit">
                {isPublishing ? tr(lang, "publishing") : tr(lang, "publishDream")}
              </button>
              <p className="status-line">{status || tr(lang, "alphaText")}</p>
            </form>
          </section>

          <section id="vault" className="panel">
            <PanelHeading eyebrow={tr(lang, "navVault")} title={tr(lang, "feeDistribution")} tag="50 / 30 / 20" />
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
                  <button type="button" onClick={() => setDreams((current) => current.map((item) => item.id === dream.id ? { ...item, signals: item.signals + 1 } : item))}>
                    {tr(lang, "signals")} {dream.signals}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="review" className="panel contract-panel">
          <div>
            <p className="eyebrow">{tr(lang, "alphaMode")}</p>
            <h2>{tr(lang, "pointsLater")}</h2>
            <p>{tr(lang, "pointsLaterText")}</p>
          </div>
          <div className="contract-badges">
            <span>
              <FileCode2 size={16} />
              DreamRegistry
            </span>
            <span>
              <Hammer size={16} />
              IPFS + USDC
            </span>
          </div>
        </section>
      </section>
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
  const maxRange = 1900n;

  for (let start = fromBlock; start <= toBlock; start += maxRange + 1n) {
    const end = start + maxRange > toBlock ? toBlock : start + maxRange;
    const chunk = await publicClient.getContractEvents({
      address: somniaContractAddress,
      abi: somniaDreamRegistryAbi,
      eventName: "DreamPublished",
      fromBlock: start,
      toBlock: end
    });
    events.push(...(chunk as DreamPublishedLog[]));
  }

  return events;
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

function shortAddress(value: string) {
  return value.startsWith("0x") && value.length >= 10
    ? `${value.slice(0, 6)}...${value.slice(-4)}`
    : value;
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

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <article className="metric">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
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
