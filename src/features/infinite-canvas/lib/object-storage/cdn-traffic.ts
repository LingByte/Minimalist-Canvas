import { isTauri } from "@canvas/services/fs-store";

import type { ObjectStorageConfig } from "./types";

export type CdnTrafficPoint = {
    /** `YYYY-MM-DD` or `YYYY-MM-DD HH:00`. */
    time: string;
    bytes: number;
};

export type CdnTrafficInterval = "5min" | "hour" | "day" | "month";

export type CdnTrafficSummary = {
    supported: boolean;
    provider: ObjectStorageConfig["provider"];
    domain?: string;
    /** Traffic for the current calendar day (UTC+8 for CN providers when API is day-based). */
    bytesToday?: number;
    /** Traffic for the last 7 days inclusive. */
    bytesLast7Days?: number;
    /** Sum across the requested window. */
    bytesTotal?: number;
    /** Edge / CDN traffic series for charts. */
    series?: CdnTrafficPoint[];
    /** Optional download / upload / origin breakdown when the vendor exposes it. */
    downloadSeries?: CdnTrafficPoint[];
    uploadSeries?: CdnTrafficPoint[];
    originSeries?: CdnTrafficPoint[];
    peakBandwidthBps?: number;
    requestCount?: number;
    originRequestCount?: number;
    hitRate?: number;
    interval?: CdnTrafficInterval;
    rangeDays?: number;
    error?: string;
};

export type FetchCdnTrafficOptions = {
    /**
     * Lookback window.
     * - For 5min/hour/day: number of days
     * - For month: number of months
     * Ignored when startDate+endDate are set.
     */
    days?: number;
    /** Chart granularity. */
    interval?: CdnTrafficInterval;
    /** Absolute range start `YYYY-MM-DD` (inclusive). */
    startDate?: string;
    /** Absolute range end `YYYY-MM-DD` (inclusive). */
    endDate?: string;
    signal?: AbortSignal;
};

type QuerySpec = {
    back: number;
    interval: CdnTrafficInterval;
    startDate: string;
    endDate: string;
};

const encoder = new TextEncoder();

export function normalizeCdnInterval(value?: string): CdnTrafficInterval {
    if (value === "5min" || value === "day" || value === "month") return value;
    return "hour";
}

/** Max lookback units allowed for each interval (days, or months when interval=month). */
export function maxCdnRangeUnits(interval: CdnTrafficInterval) {
    if (interval === "5min") return 3;
    if (interval === "hour") return 31;
    if (interval === "month") return 12;
    return 90;
}

export function defaultCdnRangeUnits(interval: CdnTrafficInterval) {
    if (interval === "5min") return 1;
    if (interval === "month") return 6;
    if (interval === "day") return 30;
    return 7;
}

/** Best-effort CDN flux via vendor control-plane APIs using the same AK/SK + publicBaseUrl host. */
export async function fetchCdnTrafficSummary(
    config: ObjectStorageConfig,
    options?: FetchCdnTrafficOptions | AbortSignal,
): Promise<CdnTrafficSummary> {
    const opts: FetchCdnTrafficOptions =
        options instanceof AbortSignal || options === undefined
            ? { signal: options instanceof AbortSignal ? options : undefined, days: 7, interval: "hour" }
            : options;
    const interval = normalizeCdnInterval(opts.interval);
    const window = resolveCdnQueryWindow(opts, interval);
    const signal = opts.signal;
    const domain = extractCdnDomain(config.publicBaseUrl);
    const base: CdnTrafficSummary = {
        supported: false,
        provider: config.provider,
        domain,
        rangeDays: window.units,
        interval,
    };
    if (!domain) {
        return { ...base, error: "missing-domain" };
    }

    const spec: QuerySpec = {
        back: window.back,
        interval,
        startDate: window.startDate,
        endDate: window.endDate,
    };

    try {
        switch (config.provider) {
            case "kodo":
                return { ...base, supported: true, ...(await fetchQiniuFlux(config, domain, spec, signal)) };
            case "cos":
                return { ...base, supported: true, ...(await fetchTencentCdnFlux(config, domain, spec, signal)) };
            case "oss":
                return { ...base, supported: true, ...(await fetchAliyunCdnFlux(config, domain, spec, signal)) };
            case "obs":
                return { ...base, supported: true, ...(await fetchHuaweiCdnFlux(config, domain, spec, signal)) };
            case "tos":
                return { ...base, supported: true, ...(await fetchVolcengineCdnFlux(config, domain, spec, signal)) };
            case "ks3":
                return { ...base, supported: true, ...(await fetchKsyunCdnFlux(config, domain, spec, signal)) };
            case "s3":
                return { ...base, supported: true, ...(await fetchAwsCloudFrontFlux(config, domain, spec, signal)) };
            case "minio":
            default:
                return { ...base, error: "unsupported-provider" };
        }
    } catch (error) {
        return {
            ...base,
            supported: true,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

export function extractCdnDomain(publicBaseUrl: string) {
    const raw = publicBaseUrl.trim();
    if (!raw) return "";
    try {
        const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
        return url.hostname.toLowerCase();
    } catch {
        return raw.replace(/^https?:\/\//i, "").split("/")[0]?.trim().toLowerCase() || "";
    }
}

async function fetchQiniuFlux(config: ObjectStorageConfig, domain: string, spec: QuerySpec, signal?: AbortSignal) {
    const { interval } = spec;
    const windows = splitQueryWindows(spec, maxApiDaySpan(interval));
    const seriesChunks: CdnTrafficPoint[][] = [];
    for (const window of windows) {
        const body = JSON.stringify({
            domains: domain,
            startDate: window.startDate,
            endDate: window.endDate,
            granularity: qiniuGranularity(interval),
        });
        const path = "/v2/tune/flux";
        const authorization = await qiniuQBoxAuth(config.accessKeyId.trim(), config.secretAccessKey.trim(), path);
        const response = await httpJson("POST", `https://fusion.qiniuapi.com${path}`, {
            headers: {
                "Content-Type": "application/json",
                Authorization: authorization,
            },
            body,
            signal,
        });
        if (response.code && response.code !== 200) {
            throw new Error(response.error || `Qiniu CDN ${response.code}`);
        }
        const seriesRaw = response.data?.[domain];
        const china: number[] = Array.isArray(seriesRaw?.china) ? seriesRaw.china : [];
        const oversea: number[] = Array.isArray(seriesRaw?.oversea) ? seriesRaw.oversea : [];
        const times: string[] = Array.isArray(response.time) ? response.time : [];
        const daily = china.map((value, index) => (Number(value) || 0) + (Number(oversea[index]) || 0));
        seriesChunks.push(
            daily.map((bytes, index) => ({
                time: normalizeTimeLabel(times[index], interval) || timeLabelFromEnd(window.back, index, daily.length, interval),
                bytes,
            })),
        );
    }
    return finalizeSeriesResult(mergeSeriesChunks(seriesChunks), interval);
}

async function fetchTencentCdnFlux(config: ObjectStorageConfig, domain: string, spec: QuerySpec, signal?: AbortSignal) {
    const { back, interval } = spec;
    const tcInterval = tencentInterval(interval);
    const windows = splitQueryWindows(spec, maxApiDaySpan(interval));
    const seriesChunks: CdnTrafficPoint[][] = [];
    const originChunks: CdnTrafficPoint[][] = [];
    let peakBandwidthBps = 0;

    for (const window of windows) {
        const { startTime, endTime } = chinaDayRange(window.back, window.startDate, window.endDate);
        const [fluxRes, bwRes, originRes] = await Promise.all([
            tencentCloudApi({
                service: "cdn",
                host: "cdn.tencentcloudapi.com",
                action: "DescribeCdnData",
                version: "2018-06-06",
                payload: { StartTime: startTime, EndTime: endTime, Metric: "flux", Interval: tcInterval, Domains: [domain] },
                secretId: config.accessKeyId.trim(),
                secretKey: config.secretAccessKey.trim(),
                signal,
            }),
            tencentCloudApi({
                service: "cdn",
                host: "cdn.tencentcloudapi.com",
                action: "DescribeCdnData",
                version: "2018-06-06",
                payload: { StartTime: startTime, EndTime: endTime, Metric: "bandwidth", Interval: tcInterval, Domains: [domain] },
                secretId: config.accessKeyId.trim(),
                secretKey: config.secretAccessKey.trim(),
                signal,
            }).catch(() => null),
            // Origin pull uses DescribeOriginData (DataSource on DescribeCdnData is ignored / invalid).
            tencentCloudApi({
                service: "cdn",
                host: "cdn.tencentcloudapi.com",
                action: "DescribeOriginData",
                version: "2018-06-06",
                payload: { StartTime: startTime, EndTime: endTime, Metric: "flux", Interval: tcInterval, Domains: [domain] },
                secretId: config.accessKeyId.trim(),
                secretKey: config.secretAccessKey.trim(),
                signal,
            }).catch(() => null),
        ]);
        const error = fluxRes.Response?.Error;
        if (error?.Message) throw new Error(error.Message);
        const points = fluxRes.Response?.Data?.[0]?.CdnData?.[0]?.DetailData || [];
        seriesChunks.push(
            (Array.isArray(points) ? points : []).map((point: { Value?: number; Time?: string }, index: number) => ({
                time: normalizeTimeLabel(point.Time, interval) || timeLabelFromEnd(window.back, index, points.length, interval),
                bytes: Number(point.Value) || 0,
            })),
        );
        const bwPoints = bwRes?.Response?.Data?.[0]?.CdnData?.[0]?.DetailData || [];
        if (Array.isArray(bwPoints)) {
            peakBandwidthBps = Math.max(peakBandwidthBps, ...bwPoints.map((point: { Value?: number }) => Number(point.Value) || 0));
        }
        const originPoints =
            originRes?.Response?.Data?.[0]?.OriginData?.[0]?.DetailData ||
            originRes?.Response?.Data?.[0]?.CdnData?.[0]?.DetailData ||
            [];
        if (Array.isArray(originPoints) && originPoints.length) {
            originChunks.push(
                originPoints.map((point: { Value?: number; Time?: string }, index: number) => ({
                    time: normalizeTimeLabel(point.Time, interval) || timeLabelFromEnd(window.back, index, originPoints.length, interval),
                    bytes: Number(point.Value) || 0,
                })),
            );
        }
    }

    const series = mergeSeriesChunks(seriesChunks);
    const originSeries = mergeSeriesChunks(originChunks);
    return {
        ...finalizeSeriesResult(series, interval),
        originSeries: originSeries.length ? maybeAggregateMonth(originSeries, interval) : undefined,
        peakBandwidthBps: peakBandwidthBps > 0 ? peakBandwidthBps : undefined,
    };
}

async function fetchAliyunCdnFlux(config: ObjectStorageConfig, domain: string, spec: QuerySpec, signal?: AbortSignal) {
    const { back, interval } = spec;
    const windows = splitQueryWindows(spec, maxApiDaySpan(interval));
    const seriesChunks: CdnTrafficPoint[][] = [];
    const originChunks: CdnTrafficPoint[][] = [];

    for (const window of windows) {
        const end = endOfRangeDate(window.endDate);
        const start = startOfRangeDate(window.startDate, window.back);
        const edge = await aliyunCdnMetric({
            config,
            action: "DescribeDomainTrafficData",
            domain,
            start,
            end,
            interval,
            signal,
        });
        if (edge.Code || edge.Message) {
            throw new Error(edge.Message || edge.Code || "Aliyun CDN error");
        }
        const items = edge.TrafficDataPerInterval?.DataModule || [];
        seriesChunks.push(
            (Array.isArray(items) ? items : []).map(
                (item: { Value?: string | number; Traf?: string | number; TimeStamp?: string }, index: number) => ({
                    time: normalizeTimeLabel(item.TimeStamp, interval) || timeLabelFromEnd(window.back, index, items.length, interval),
                    bytes: Number(item.Value ?? item.Traf) || 0,
                }),
            ),
        );

        const origin = await aliyunCdnMetric({
            config,
            action: "DescribeDomainSrcTrafficData",
            domain,
            start,
            end,
            interval,
            signal,
        }).catch(() => null);
        const originItems = origin?.SrcTrafficDataPerInterval?.DataModule || origin?.TrafficDataPerInterval?.DataModule || [];
        if (Array.isArray(originItems) && originItems.length) {
            originChunks.push(
                originItems.map(
                    (item: { Value?: string | number; Traf?: string | number; TimeStamp?: string }, index: number) => ({
                        time: normalizeTimeLabel(item.TimeStamp, interval) || timeLabelFromEnd(window.back, index, originItems.length, interval),
                        bytes: Number(item.Value ?? item.Traf) || 0,
                    }),
                ),
            );
        }
    }

    const series = mergeSeriesChunks(seriesChunks);
    const originSeries = mergeSeriesChunks(originChunks);
    return {
        ...finalizeSeriesResult(series, interval),
        originSeries: originSeries.length ? maybeAggregateMonth(originSeries, interval) : undefined,
    };
}

async function aliyunCdnMetric(input: {
    config: ObjectStorageConfig;
    action: string;
    domain: string;
    start: Date;
    end: Date;
    interval: CdnTrafficInterval;
    signal?: AbortSignal;
}) {
    const params: Record<string, string> = {
        Format: "JSON",
        Version: "2018-05-10",
        AccessKeyId: input.config.accessKeyId.trim(),
        SignatureMethod: "HMAC-SHA1",
        Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        SignatureVersion: "1.0",
        SignatureNonce: `${Date.now()}${Math.random().toString(36).slice(2, 10)}`,
        Action: input.action,
        DomainName: input.domain,
        StartTime: input.start.toISOString().replace(/\.\d{3}Z$/, "Z"),
        EndTime: input.end.toISOString().replace(/\.\d{3}Z$/, "Z"),
        Interval: aliyunInterval(input.interval),
    };
    params.Signature = await aliyunRpcSignature("GET", params, input.config.secretAccessKey.trim());
    const query = Object.keys(params)
        .sort()
        .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
        .join("&");
    return httpJson("GET", `https://cdn.aliyuncs.com/?${query}`, { signal: input.signal });
}

/** Huawei CDN ShowDomainStats (OBS users typically share IAM AK/SK). */
async function fetchHuaweiCdnFlux(config: ObjectStorageConfig, domain: string, spec: QuerySpec, signal?: AbortSignal) {
    const { interval } = spec;
    const windows = splitQueryWindows(spec, maxApiDaySpan(interval));
    const seriesChunks: CdnTrafficPoint[][] = [];
    for (const window of windows) {
        const end = endOfRangeDate(window.endDate, true);
        const start = startOfRangeDate(window.startDate, window.back);
        const params = new URLSearchParams({
            action: "detail",
            start_time: String(start.getTime()),
            end_time: String(end.getTime()),
            domain_name: domain,
            stat_type: "flux",
            interval: huaweiInterval(interval),
        });
        const path = `/v1.0/cdn/statistics/domain-stats?${params.toString()}`;
        const host = "cdn.myhuaweicloud.com";
        const headers = await huaweiSdkSign({
            method: "GET",
            host,
            pathWithQuery: path,
            accessKey: config.accessKeyId.trim(),
            secretKey: config.secretAccessKey.trim(),
        });
        const response = await httpJson("GET", `https://${host}${path}`, { headers, signal });
        if (response.error_msg || response.error_code) {
            throw new Error(response.error_msg || response.error_code || "Huawei CDN error");
        }
        seriesChunks.push(extractHuaweiFluxSeries(response.result ?? response, window.back, interval));
    }
    return finalizeSeriesResult(mergeSeriesChunks(seriesChunks), interval);
}

/** Volcengine CDN DescribeDistrictData (TOS + CDN share AccessKey). */
async function fetchVolcengineCdnFlux(config: ObjectStorageConfig, domain: string, spec: QuerySpec, signal?: AbortSignal) {
    const { back, interval, startDate, endDate } = spec;
    const endSec = Math.floor(endOfRangeDate(endDate).getTime() / 1000);
    const startSec = Math.floor(startOfRangeDate(startDate, back).getTime() / 1000);
    const response = await volcengineCdnApi({
        action: "DescribeDistrictData",
        payload: {
            Metric: "traffic",
            Domain: domain,
            StartTime: startSec,
            EndTime: endSec,
            Interval: volcInterval(interval),
        },
        accessKey: config.accessKeyId.trim(),
        secretKey: config.secretAccessKey.trim(),
        signal,
    });
    if (response.ResponseMetadata?.Error?.Message) {
        throw new Error(response.ResponseMetadata.Error.Message);
    }
    const series = extractVolcSeries(response, back, interval);
    if (!series.length) {
        // Fallback to summary APIs if detail is empty/unavailable.
        const todayStart = Math.floor(startOfLocalDay(new Date()).getTime() / 1000);
        const [windowSum, today] = await Promise.all([
            volcengineCdnApi({
                action: "DescribeEdgeNrtDataSummary",
                payload: { Metric: "flux", Domain: domain, StartTime: startSec, EndTime: endSec },
                accessKey: config.accessKeyId.trim(),
                secretKey: config.secretAccessKey.trim(),
                signal,
            }),
            volcengineCdnApi({
                action: "DescribeEdgeNrtDataSummary",
                payload: { Metric: "flux", Domain: domain, StartTime: todayStart, EndTime: endSec },
                accessKey: config.accessKeyId.trim(),
                secretKey: config.secretAccessKey.trim(),
                signal,
            }),
        ]);
        const bytesTotal = extractVolcFlux(windowSum);
        const bytesToday = extractVolcFlux(today);
        return finalizeSeriesResult([{ time: ymd(new Date()), bytes: bytesToday }], interval, {
            bytesToday,
            bytesLast7Days: bytesTotal,
            bytesTotal,
        });
    }
    return finalizeSeriesResult(series, interval);
}

/** Kingsoft CDN GetDomainUsageData (KS3 AK/SK, AWS4-style open API). */
async function fetchKsyunCdnFlux(config: ObjectStorageConfig, domain: string, spec: QuerySpec, signal?: AbortSignal) {
    const { back, interval, startDate, endDate } = spec;
    const end = endOfRangeDate(endDate);
    const start = startOfRangeDate(startDate, back);
    const bodyObj = {
        StartTime: ksyunTime(start),
        EndTime: ksyunTime(end),
        Metric: "traffic",
        CdnType: "file,video,page",
        Domains: domain,
        Areas: "CN",
        Interval: ksyunInterval(interval),
    };
    const body = JSON.stringify(bodyObj);
    const path = "/2020-09-01/statistics/GetDomainUsageData";
    const host = "cdn.api.ksyun.com";
    const region = (config.region || "cn-beijing-6").trim() || "cn-beijing-6";
    const headers = await aws4Sign({
        method: "POST",
        host,
        path,
        service: "cdn",
        region,
        accessKeyId: config.accessKeyId.trim(),
        secretAccessKey: config.secretAccessKey.trim(),
        body,
        extraHeaders: {
            "content-type": "application/json",
            "x-action": "GetDomainUsageData",
            "x-version": "2020-09-01",
        },
    });
    const response = await httpJson("POST", `https://${host}${path}`, { headers, body, signal });
    if (response.Error?.Message || response.ErrorMessage) {
        throw new Error(response.Error?.Message || response.ErrorMessage || "Ksyun CDN error");
    }
    let metrics = Array.isArray(response.Metric) ? response.Metric : [];
    if (!metrics.length) {
        for (const cdnType of ["file", "video", "page"] as const) {
            const retryBody = JSON.stringify({ ...bodyObj, CdnType: cdnType });
            const retryHeaders = await aws4Sign({
                method: "POST",
                host,
                path,
                service: "cdn",
                region,
                accessKeyId: config.accessKeyId.trim(),
                secretAccessKey: config.secretAccessKey.trim(),
                body: retryBody,
                extraHeaders: {
                    "content-type": "application/json",
                    "x-action": "GetDomainUsageData",
                    "x-version": "2020-09-01",
                },
            });
            const retry = await httpJson("POST", `https://${host}${path}`, {
                headers: retryHeaders,
                body: retryBody,
                signal,
            });
            metrics = Array.isArray(retry.Metric) ? retry.Metric : [];
            if (metrics.length) break;
        }
    }
    const series = metrics.map((item: { Value?: number; Time?: string }, index: number) => ({
        time: normalizeTimeLabel(item.Time, interval) || timeLabelFromEnd(back, index, metrics.length, interval),
        bytes: Number(item.Value) || 0,
    }));
    return finalizeSeriesResult(series, interval);
}

/** AWS CloudFront BytesDownloaded via ListDistributions + CloudWatch. */
async function fetchAwsCloudFrontFlux(config: ObjectStorageConfig, domain: string, spec: QuerySpec, signal?: AbortSignal) {
    const { back, interval, startDate, endDate } = spec;
    const accessKeyId = config.accessKeyId.trim();
    const secretAccessKey = config.secretAccessKey.trim();
    const listPath = "/2020-05-31/distribution";
    const listHost = "cloudfront.amazonaws.com";
    const listHeaders = await aws4Sign({
        method: "GET",
        host: listHost,
        path: listPath,
        service: "cloudfront",
        region: "us-east-1",
        accessKeyId,
        secretAccessKey,
        body: "",
    });
    const listXml = await httpText("GET", `https://${listHost}${listPath}`, { headers: listHeaders, signal });
    const distributionId = findCloudFrontDistributionId(listXml, domain);
    if (!distributionId) {
        throw new Error(`No CloudFront distribution found for ${domain}`);
    }

    const end = endOfRangeDate(endDate);
    const start = startOfRangeDate(startDate, back);
    const period = awsPeriod(interval);
    const cwHost = "monitoring.us-east-1.amazonaws.com";
    const makeParams = (withRegionDim: boolean) => {
        const params = new URLSearchParams({
            Action: "GetMetricStatistics",
            Version: "2010-08-01",
            Namespace: "AWS/CloudFront",
            MetricName: "BytesDownloaded",
            StartTime: start.toISOString().replace(/\.\d{3}Z$/, "Z"),
            EndTime: end.toISOString().replace(/\.\d{3}Z$/, "Z"),
            Period: period,
            "Statistics.member.1": "Sum",
            "Dimensions.member.1.Name": "DistributionId",
            "Dimensions.member.1.Value": distributionId,
        });
        if (withRegionDim) {
            params.set("Dimensions.member.2.Name", "Region");
            params.set("Dimensions.member.2.Value", "Global");
        }
        return params;
    };

    let xml = "";
    for (const withRegion of [true, false]) {
        const queryPath = `/?${makeParams(withRegion).toString()}`;
        const cwHeaders = await aws4Sign({
            method: "GET",
            host: cwHost,
            path: queryPath,
            service: "monitoring",
            region: "us-east-1",
            accessKeyId,
            secretAccessKey,
            body: "",
        });
        xml = await httpText("GET", `https://${cwHost}${queryPath}`, { headers: cwHeaders, signal });
        if (/<Sum>/i.test(xml)) break;
    }

    const datapoints = [...xml.matchAll(/<member>([\s\S]*?)<\/member>/gi)];
    const series = datapoints
        .map((match) => {
            const block = match[1];
            const sum = Number(xmlTag(block, "Sum")) || 0;
            const timestamp = normalizeTimeLabel(xmlTag(block, "Timestamp"), interval);
            return { time: timestamp, bytes: sum };
        })
        .filter((point) => point.time)
        .sort((a, b) => a.time.localeCompare(b.time));
    if (!series.length) {
        const sums = [...xml.matchAll(/<Sum>([^<]+)<\/Sum>/gi)].map((match) => Number(match[1]) || 0);
        return finalizeSeriesResult(
            sums.map((bytes, index) => ({
                time: timeLabelFromEnd(back, index, sums.length, interval),
                bytes,
            })),
            interval,
        );
    }
    return finalizeSeriesResult(series, interval);
}

function summarizeSeries(series: CdnTrafficPoint[]) {
    const cleaned = series.filter((point) => Boolean(point.time));
    const bytesTotal = cleaned.reduce((sum, point) => sum + (point.bytes || 0), 0);
    const today = ymd(new Date());
    const weekAgo = new Date();
    weekAgo.setHours(0, 0, 0, 0);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const weekCutoff = ymd(weekAgo);
    return {
        series: cleaned,
        bytesToday: cleaned.filter((point) => (point.time || "").startsWith(today)).reduce((sum, point) => sum + (point.bytes || 0), 0),
        bytesLast7Days: cleaned
            .filter((point) => (point.time || "").slice(0, 10) >= weekCutoff)
            .reduce((sum, point) => sum + (point.bytes || 0), 0),
        bytesTotal,
    };
}

/** Vendor single-request span limits (day/month queried as day). */
function maxApiDaySpan(interval: CdnTrafficInterval) {
    if (interval === "5min") return 3;
    if (interval === "hour") return 31;
    return 90;
}

function splitQueryWindows(spec: QuerySpec, maxDays: number): QuerySpec[] {
    const daySpan = Math.max(1, spec.back + 1);
    if (daySpan <= maxDays) return [spec];
    const windows: QuerySpec[] = [];
    const end = new Date(`${spec.endDate}T00:00:00`);
    if (Number.isNaN(end.getTime())) return [spec];
    let cursorEnd = new Date(end.getTime());
    let remaining = daySpan;
    while (remaining > 0) {
        const span = Math.min(maxDays, remaining);
        const cursorStart = new Date(cursorEnd.getTime());
        cursorStart.setDate(cursorStart.getDate() - (span - 1));
        windows.unshift({
            back: span - 1,
            interval: spec.interval,
            startDate: ymd(cursorStart),
            endDate: ymd(cursorEnd),
        });
        cursorEnd = new Date(cursorStart.getTime());
        cursorEnd.setDate(cursorEnd.getDate() - 1);
        remaining -= span;
    }
    return windows;
}

function mergeSeriesChunks(chunks: CdnTrafficPoint[][]) {
    const map = new Map<string, number>();
    for (const chunk of chunks) {
        for (const point of chunk) {
            if (!point.time) continue;
            map.set(point.time, (map.get(point.time) || 0) + (point.bytes || 0));
        }
    }
    return [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([time, bytes]) => ({ time, bytes }));
}

function extractHuaweiFluxSeries(result: any, back: number, interval: CdnTrafficInterval = "day"): CdnTrafficPoint[] {
    if (!result) return [];
    if (typeof result.flux === "number") {
        return [{ time: ymd(new Date()), bytes: result.flux }];
    }
    if (Array.isArray(result.flux)) {
        return result.flux.map((item: any, index: number) => ({
            time: normalizeTimeLabel(item?.time || item?.Time, interval) || timeLabelFromEnd(back, index, result.flux.length, interval),
            bytes: Number(typeof item === "number" ? item : item?.value ?? item?.flux) || 0,
        }));
    }
    if (result.flux && typeof result.flux === "object") {
        return Object.keys(result.flux)
            .sort()
            .map((key) => ({
                time: normalizeTimeLabel(key, interval) || key,
                bytes: Number(result.flux[key]) || 0,
            }));
    }
    if (Array.isArray(result)) {
        return result.map((item, index) => ({
            time: normalizeTimeLabel(item?.time, interval) || timeLabelFromEnd(back, index, result.length, interval),
            bytes: Number(item?.flux ?? item?.value) || 0,
        }));
    }
    for (const key of Object.keys(result)) {
        const value = result[key];
        if (typeof value === "number") return [{ time: ymd(new Date()), bytes: value }];
        if (value && typeof value === "object" && !Array.isArray(value)) {
            return Object.keys(value)
                .sort()
                .map((k) => ({
                    time: normalizeTimeLabel(k, interval) || k,
                    bytes: Number(value[k]) || 0,
                }));
        }
    }
    return [];
}

function extractVolcSeries(response: any, back: number, interval: CdnTrafficInterval = "day"): CdnTrafficPoint[] {
    const metricData =
        response?.Result?.MetricDataList ||
        response?.Result?.Resources ||
        response?.Result?.Data ||
        response?.Result?.CdnData ||
        [];
    if (!Array.isArray(metricData) || !metricData.length) return [];

    const points: CdnTrafficPoint[] = [];
    for (const item of metricData) {
        if (Array.isArray(item?.Values) && Array.isArray(item?.Timestamps)) {
            item.Timestamps.forEach((ts: number | string, index: number) => {
                points.push({
                    time: normalizeTimeLabel(typeof ts === "number" ? new Date(ts * 1000).toISOString() : String(ts), interval),
                    bytes: Number(item.Values[index]) || 0,
                });
            });
            continue;
        }
        if (Array.isArray(item?.ValueDetails)) {
            for (const detail of item.ValueDetails) {
                points.push({
                    time: normalizeTimeLabel(detail?.TimeStamp || detail?.Timestamp || detail?.Time, interval),
                    bytes: Number(detail?.Value ?? detail?.Traffic ?? detail?.Flux) || 0,
                });
            }
            continue;
        }
        if (item?.TimeStamp != null || item?.Timestamp != null || item?.Time != null) {
            points.push({
                time: normalizeTimeLabel(item.TimeStamp || item.Timestamp || item.Time, interval),
                bytes: Number(item.Value ?? item.Traffic ?? item.Flux) || 0,
            });
        }
    }
    if (!points.length && metricData.length === 1 && typeof metricData[0]?.Value === "number") {
        return [{ time: ymd(new Date()), bytes: Number(metricData[0].Value) || 0 }];
    }
    const sorted = points.filter((p) => p.time).sort((a, b) => a.time.localeCompare(b.time));
    if (!sorted.length) {
        for (const item of metricData) {
            if (Array.isArray(item?.Values)) {
                return item.Values.map((value: number, index: number) => ({
                    time: timeLabelFromEnd(back, index, item.Values.length, interval),
                    bytes: Number(value) || 0,
                }));
            }
        }
    }
    return sorted;
}

function extractVolcFlux(response: any): number {
    const resources = response?.Result?.Resources || response?.Result?.MetricDataList || response?.Result?.Data || [];
    if (Array.isArray(resources) && resources.length) {
        let total = 0;
        for (const item of resources) {
            if (typeof item?.Value === "number") total += item.Value;
            else if (typeof item?.Traffic === "number") total += item.Traffic;
            else if (typeof item?.Flux === "number") total += item.Flux;
            else if (Array.isArray(item?.Metrics)) {
                for (const metric of item.Metrics) {
                    if (metric?.Metric === "flux" || metric?.Metric === "traffic") total += Number(metric.Value) || 0;
                    else total += Number(metric?.Value) || 0;
                }
            } else if (item?.CdnData?.[0]?.Value != null) {
                total += Number(item.CdnData[0].Value) || 0;
            }
        }
        if (total) return total;
    }
    const direct = response?.Result?.Total ?? response?.Result?.Value ?? response?.Result?.flux;
    return Number(direct) || 0;
}

function finalizeSeriesResult(
    series: CdnTrafficPoint[],
    interval: CdnTrafficInterval,
    overrides?: Partial<CdnTrafficSummary>,
) {
    const normalized = trimTrailingEmpty(clipSeriesToNow(maybeAggregateMonth(series, interval), interval));
    return {
        ...summarizeSeries(normalized),
        downloadSeries: normalized,
        peakBandwidthBps: estimatePeakBandwidthBps(normalized, interval),
        interval,
        ...overrides,
        series: overrides?.series || normalized,
    };
}

/** Drop future slots when the API pads the rest of today with zeros. */
function clipSeriesToNow(series: CdnTrafficPoint[], interval: CdnTrafficInterval) {
    if (interval === "day" || interval === "month" || series.length < 2) return series;
    const now = new Date();
    const cutoff =
        interval === "5min"
            ? `${ymd(now)} ${pad(now.getHours())}:${pad(Math.floor(now.getMinutes() / 5) * 5)}`
            : `${ymd(now)} ${pad(now.getHours())}:00`;
    const clipped = series.filter((point) => !point.time || point.time <= cutoff);
    return clipped.length ? clipped : series;
}

/** Keep one trailing zero after the last non-zero so the line settles, but drop long flat futures. */
function trimTrailingEmpty(series: CdnTrafficPoint[]) {
    if (series.length < 3) return series;
    let lastNonZero = -1;
    for (let i = series.length - 1; i >= 0; i -= 1) {
        if ((series[i]?.bytes || 0) > 0) {
            lastNonZero = i;
            break;
        }
    }
    if (lastNonZero < 0) return series.slice(0, Math.min(series.length, 2));
    const end = Math.min(series.length - 1, lastNonZero + 1);
    return series.slice(0, end + 1);
}

function maybeAggregateMonth(series: CdnTrafficPoint[], interval: CdnTrafficInterval) {
    if (interval !== "month") return series;
    const map = new Map<string, number>();
    for (const point of series) {
        const key = (point.time || "").slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(key)) continue;
        map.set(key, (map.get(key) || 0) + (point.bytes || 0));
    }
    return [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([time, bytes]) => ({ time, bytes }));
}

function qiniuGranularity(interval: CdnTrafficInterval) {
    if (interval === "5min") return "5min";
    if (interval === "hour") return "hour";
    return "day";
}

function tencentInterval(interval: CdnTrafficInterval) {
    if (interval === "5min") return "5min";
    if (interval === "hour") return "hour";
    return "day";
}

function aliyunInterval(interval: CdnTrafficInterval) {
    if (interval === "5min") return "300";
    if (interval === "hour") return "3600";
    return "86400";
}

function huaweiInterval(interval: CdnTrafficInterval) {
    if (interval === "5min") return "300";
    if (interval === "hour") return "3600";
    return "86400";
}

function volcInterval(interval: CdnTrafficInterval) {
    if (interval === "5min") return "5min";
    if (interval === "hour") return "hour";
    return "day";
}

function ksyunInterval(interval: CdnTrafficInterval) {
    if (interval === "5min") return 5;
    if (interval === "hour") return 60;
    return 1440;
}

function awsPeriod(interval: CdnTrafficInterval) {
    if (interval === "5min") return "300";
    if (interval === "hour") return "3600";
    return "86400";
}

function normalizeTimeLabel(raw?: string | null, interval: CdnTrafficInterval = "day") {
    if (!raw) return "";
    const text = String(raw).trim();
    const withMinute = text.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
    if (withMinute) {
        if (interval === "5min") return `${withMinute[1]} ${withMinute[2]}:${withMinute[3]}`;
        if (interval === "hour") return `${withMinute[1]} ${withMinute[2]}:00`;
        if (interval === "month") return withMinute[1].slice(0, 7);
        return withMinute[1];
    }
    const withHour = text.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2})/);
    if (withHour) {
        if (interval === "5min" || interval === "hour") return `${withHour[1]} ${withHour[2]}:00`;
        if (interval === "month") return withHour[1].slice(0, 7);
        return withHour[1];
    }
    const iso = text.match(/(\d{4}-\d{2}-\d{2})/);
    if (iso) return interval === "month" ? iso[1].slice(0, 7) : iso[1];
    const compact = text.match(/(\d{4})(\d{2})(\d{2})/);
    if (compact) {
        const day = `${compact[1]}-${compact[2]}-${compact[3]}`;
        return interval === "month" ? `${compact[1]}-${compact[2]}` : day;
    }
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
        if (interval === "5min") return `${ymd(date)} ${pad(date.getHours())}:${pad(Math.floor(date.getMinutes() / 5) * 5)}`;
        if (interval === "hour") return `${ymd(date)} ${pad(date.getHours())}:00`;
        if (interval === "month") return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
        return ymd(date);
    }
    return "";
}

function timeLabelFromEnd(back: number, index: number, length: number, interval: CdnTrafficInterval) {
    if (interval === "5min") {
        const totalSlots = Math.max(length, (back + 1) * 24 * 12);
        const start = new Date();
        start.setSeconds(0, 0);
        start.setMinutes(Math.floor(start.getMinutes() / 5) * 5);
        start.setMinutes(start.getMinutes() - (totalSlots - 1 - index) * 5);
        return `${ymd(start)} ${pad(start.getHours())}:${pad(start.getMinutes())}`;
    }
    if (interval === "hour") {
        const totalHours = Math.max(length, (back + 1) * 24);
        const start = new Date();
        start.setMinutes(0, 0, 0);
        start.setHours(start.getHours() - (totalHours - 1) + index);
        return `${ymd(start)} ${pad(start.getHours())}:00`;
    }
    if (interval === "month") {
        const date = new Date();
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        date.setMonth(date.getMonth() - (Math.max(length, back + 1) - 1 - index));
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
    }
    const offsetFromStart = Math.max(0, back - (length - 1) + index);
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - back + offsetFromStart);
    return ymd(date);
}

function estimatePeakBandwidthBps(series: CdnTrafficPoint[], interval: CdnTrafficInterval) {
    if (!series.length) return undefined;
    const seconds = interval === "5min" ? 300 : interval === "hour" ? 3600 : interval === "month" ? 30 * 86400 : 86400;
    let peak = 0;
    for (const point of series) {
        peak = Math.max(peak, ((point.bytes || 0) * 8) / seconds);
    }
    return peak > 0 ? peak : undefined;
}

function findCloudFrontDistributionId(xml: string, domain: string) {
    const blocks = xml.match(/<DistributionSummary\b[\s\S]*?<\/DistributionSummary>/gi) || [];
    const needle = domain.toLowerCase();
    for (const block of blocks) {
        const id = xmlTag(block, "Id");
        const aliases = [...block.matchAll(/<CNAME>([^<]+)<\/CNAME>/gi)].map((m) => m[1].toLowerCase());
        const domainName = xmlTag(block, "DomainName").toLowerCase();
        if (aliases.includes(needle) || domainName === needle || domainName.startsWith(`${needle}.`)) {
            return id;
        }
    }
    // Fallback: single distribution account
    if (blocks.length === 1) return xmlTag(blocks[0], "Id") || undefined;
    return undefined;
}

function xmlTag(xml: string, tag: string) {
    const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
    return match?.[1]?.trim() || "";
}

export function resolveCdnQueryWindow(
    opts: Pick<FetchCdnTrafficOptions, "days" | "startDate" | "endDate">,
    interval: CdnTrafficInterval,
) {
    const absolute = parseAbsoluteRange(opts.startDate, opts.endDate);
    if (absolute) {
        // Month view aggregates daily points; keep absolute span but prefer month-aligned starts.
        let daySpan = Math.max(1, absolute.daySpan);
        let startDate = absolute.startDate;
        let endDate = absolute.endDate;
        if (interval === "month") {
            const start = new Date(`${absolute.startDate}T00:00:00`);
            start.setDate(1);
            startDate = ymd(start);
            daySpan = Math.floor((new Date(`${endDate}T00:00:00`).getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
        }
        return {
            units: interval === "month" ? Math.max(1, Math.ceil(daySpan / 31)) : daySpan,
            back: Math.max(0, daySpan - 1),
            startDate,
            endDate,
        };
    }
    const maxUnits = maxCdnRangeUnits(interval);
    let units = Math.min(maxUnits, Math.max(1, opts.days || defaultCdnRangeUnits(interval)));
    // Guard: day presets (7/30) must not be treated as N months (7*31 → invalid time range).
    if (interval === "month" && units > 12) units = defaultCdnRangeUnits("month");
    if (interval === "month" && (units === 7 || units === 30)) {
        units = units === 30 ? 1 : defaultCdnRangeUnits("month");
    }
    let daySpan: number;
    let start: Date;
    const end = new Date();
    if (interval === "month") {
        // Inclusive calendar months ending this month.
        start = new Date(end.getFullYear(), end.getMonth() - (units - 1), 1);
        daySpan = Math.floor((startOfLocalDay(end).getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    } else {
        daySpan = units;
        start = new Date(end.getTime() - Math.max(0, daySpan - 1) * 24 * 60 * 60 * 1000);
    }
    const back = Math.max(0, daySpan - 1);
    return { units, back, startDate: ymd(start), endDate: ymd(end) };
}

function parseAbsoluteRange(startDate?: string, endDate?: string) {
    if (!startDate || !endDate) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return null;
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    const from = start <= end ? start : end;
    const to = start <= end ? end : start;
    const daySpan = Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    return { startDate: ymd(from), endDate: ymd(to), daySpan: Math.max(1, Math.min(366, daySpan)) };
}

function startOfRangeDate(startDate: string | undefined, backInclusive: number) {
    if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        const date = new Date(`${startDate}T00:00:00`);
        if (!Number.isNaN(date.getTime())) return date;
    }
    const end = new Date();
    return new Date(end.getTime() - backInclusive * 24 * 60 * 60 * 1000);
}

function endOfRangeDate(endDate?: string, nextMidnight = false) {
    if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        const today = ymd(new Date());
        if (endDate < today) {
            const date = new Date(`${endDate}T23:59:59`);
            if (nextMidnight) {
                date.setSeconds(date.getSeconds() + 1);
            }
            return Number.isNaN(date.getTime()) ? new Date() : date;
        }
    }
    if (nextMidnight) {
        const date = startOfChinaDay(new Date(), 1);
        return date;
    }
    return new Date();
}

function dateRangeDays(backInclusive: number, startDate?: string, endDate?: string) {
    if (startDate && endDate) return { start: startDate, end: endDate };
    const end = new Date();
    const start = new Date(end.getTime() - backInclusive * 24 * 60 * 60 * 1000);
    return { start: ymd(start), end: ymd(end) };
}

function chinaDayRange(backInclusive: number, startDate?: string, endDate?: string) {
    if (startDate && endDate) {
        const today = ymd(new Date());
        const endClock =
            endDate >= today
                ? `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}:${pad(new Date().getSeconds())}`
                : "23:59:59";
        return {
            startTime: `${startDate} 00:00:00`,
            endTime: `${endDate} ${endClock}`,
        };
    }
    const end = new Date();
    const start = new Date(end.getTime() - backInclusive * 24 * 60 * 60 * 1000);
    return {
        startTime: `${ymd(start)} 00:00:00`,
        endTime: `${ymd(end)} ${pad(end.getHours())}:${pad(end.getMinutes())}:${pad(end.getSeconds())}`,
    };
}

function startOfChinaDay(base: Date, dayOffset: number) {
    // Approximate local day boundaries; Huawei expects CST midnight millis.
    const date = new Date(base.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + dayOffset);
    return date;
}

function startOfLocalDay(base: Date) {
    const date = new Date(base.getTime());
    date.setHours(0, 0, 0, 0);
    return date;
}

function ymd(date: Date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(value: number) {
    return String(value).padStart(2, "0");
}

function ksyunTime(date: Date) {
    return `${ymd(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}+0800`;
}

async function qiniuQBoxAuth(accessKey: string, secretKey: string, pathWithQuery: string) {
    const signature = await hmacSha1Raw(secretKey, `${pathWithQuery}\n`);
    return `QBox ${accessKey}:${bytesToUrlSafeBase64(signature)}`;
}

async function aliyunRpcSignature(method: string, params: Record<string, string>, secret: string) {
    const canonical = Object.keys(params)
        .sort()
        .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
        .join("&");
    const stringToSign = `${method}&${percentEncode("/")}&${percentEncode(canonical)}`;
    const signature = await hmacSha1Raw(`${secret}&`, stringToSign);
    return bytesToBase64(signature);
}

async function huaweiSdkSign(input: {
    method: string;
    host: string;
    pathWithQuery: string;
    accessKey: string;
    secretKey: string;
}) {
    const sdkDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const [pathname, query = ""] = input.pathWithQuery.split("?");
    const canonicalUri = pathname.endsWith("/") ? pathname : `${pathname}/`;
    const canonicalQuery = [...new URLSearchParams(query).entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
        .join("&");
    const headers: Record<string, string> = {
        "content-type": "application/json",
        host: input.host,
        "x-sdk-date": sdkDate,
    };
    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join("");
    const signedHeaders = signedHeaderNames.join(";");
    const payloadHash = await sha256Hex("");
    const canonicalRequest = [
        input.method.toUpperCase(),
        canonicalUri,
        canonicalQuery,
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    ].join("\n");
    const stringToSign = ["SDK-HMAC-SHA256", sdkDate, await sha256Hex(canonicalRequest)].join("\n");
    const signature = bufferToHex(await hmacSha256Raw(encoder.encode(input.secretKey), stringToSign));
    headers.authorization = `SDK-HMAC-SHA256 Access=${input.accessKey}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return headers;
}

async function volcengineCdnApi(input: {
    action: string;
    payload: Record<string, unknown>;
    accessKey: string;
    secretKey: string;
    signal?: AbortSignal;
}) {
    const host = "cdn.volcengineapi.com";
    const region = "cn-north-1";
    const service = "CDN";
    const body = JSON.stringify(input.payload);
    const xDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const shortDate = xDate.slice(0, 8);
    const payloadHash = await sha256Hex(body);
    const query = `Action=${input.action}&Version=2021-03-01`;
    const canonicalHeaders = [
        `content-type:application/json`,
        `host:${host}`,
        `x-content-sha256:${payloadHash}`,
        `x-date:${xDate}`,
    ].join("\n");
    const signedHeaders = "content-type;host;x-content-sha256;x-date";
    const canonicalRequest = ["POST", "/", query, `${canonicalHeaders}\n`, signedHeaders, payloadHash].join("\n");
    const credentialScope = `${shortDate}/${region}/${service}/request`;
    const stringToSign = ["HMAC-SHA256", xDate, credentialScope, await sha256Hex(canonicalRequest)].join("\n");
    const kDate = await hmacSha256Raw(encoder.encode(input.secretKey), shortDate);
    const kRegion = await hmacSha256Raw(kDate, region);
    const kService = await hmacSha256Raw(kRegion, service);
    const kSigning = await hmacSha256Raw(kService, "request");
    const signature = bufferToHex(await hmacSha256Raw(kSigning, stringToSign));
    const authorization = `HMAC-SHA256 Credential=${input.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return httpJson("POST", `https://${host}/?${query}`, {
        headers: {
            Authorization: authorization,
            "Content-Type": "application/json",
            Host: host,
            "X-Content-Sha256": payloadHash,
            "X-Date": xDate,
        },
        body,
        signal: input.signal,
    });
}

async function tencentCloudApi(input: {
    service: string;
    host: string;
    action: string;
    version: string;
    payload: Record<string, unknown>;
    secretId: string;
    secretKey: string;
    signal?: AbortSignal;
}) {
    const payload = JSON.stringify(input.payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const hashedPayload = await sha256Hex(payload);
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${input.host}\nx-tc-action:${input.action.toLowerCase()}\n`;
    const signedHeaders = "content-type;host;x-tc-action";
    const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, hashedPayload].join("\n");
    const credentialScope = `${date}/${input.service}/tc3_request`;
    const stringToSign = ["TC3-HMAC-SHA256", String(timestamp), credentialScope, await sha256Hex(canonicalRequest)].join("\n");
    const secretDate = await hmacSha256Raw(encoder.encode(`TC3${input.secretKey}`), date);
    const secretService = await hmacSha256Raw(secretDate, input.service);
    const secretSigning = await hmacSha256Raw(secretService, "tc3_request");
    const signature = bufferToHex(await hmacSha256Raw(secretSigning, stringToSign));
    const authorization = `TC3-HMAC-SHA256 Credential=${input.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return httpJson("POST", `https://${input.host}`, {
        headers: {
            Authorization: authorization,
            "Content-Type": "application/json; charset=utf-8",
            Host: input.host,
            "X-TC-Action": input.action,
            "X-TC-Timestamp": String(timestamp),
            "X-TC-Version": input.version,
        },
        body: payload,
        signal: input.signal,
    });
}

async function aws4Sign(input: {
    method: string;
    host: string;
    path: string;
    service: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    body: string;
    extraHeaders?: Record<string, string>;
}) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = await sha256Hex(input.body || "");
    const headers: Record<string, string> = {
        host: input.host,
        "x-amz-date": amzDate,
        ...(input.extraHeaders || {}),
    };
    if (input.body) headers["content-type"] = headers["content-type"] || "application/json";
    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name].trim().replace(/\s+/g, " ")}\n`).join("");
    const signedHeaders = signedHeaderNames.join(";");
    const url = new URL(`https://${input.host}${input.path}`);
    const canonicalQuery = [...url.searchParams.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${uriEncode(key)}=${uriEncode(value)}`)
        .join("&");
    const canonicalUri = url.pathname || "/";
    const canonicalRequest = [
        input.method.toUpperCase(),
        canonicalUri,
        canonicalQuery,
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    ].join("\n");
    const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256Hex(canonicalRequest)].join("\n");
    const kDate = await hmacSha256Raw(encoder.encode(`AWS4${input.secretAccessKey}`), dateStamp);
    const kRegion = await hmacSha256Raw(kDate, input.region);
    const kService = await hmacSha256Raw(kRegion, input.service);
    const kSigning = await hmacSha256Raw(kService, "aws4_request");
    const signature = bufferToHex(await hmacSha256Raw(kSigning, stringToSign));
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return headers;
}

async function httpJson(
    method: string,
    url: string,
    options?: { headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) {
    const text = await httpText(method, url, options);
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(text.slice(0, 200) || "CDN response is not JSON");
    }
}

async function httpText(
    method: string,
    url: string,
    options?: { headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) {
    const headers = { ...(options?.headers || {}) };
    delete headers.host;
    delete headers.Host;

    if (isTauri()) {
        const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
        const response = await tauriFetch(url, {
            method,
            headers,
            body: options?.body,
            signal: options?.signal,
        });
        const text = await response.text().catch(() => "");
        if (!response.ok) {
            let detail = text.slice(0, 240);
            try {
                const json = JSON.parse(text);
                detail = json.error || json.Message || json.msg || json.error_msg || detail;
            } catch {
                // keep raw text
            }
            throw new Error(detail || `CDN request failed (${response.status})`);
        }
        return text;
    }

    const response = await fetch(url, {
        method,
        headers,
        body: options?.body,
        signal: options?.signal,
    });
    const text = await response.text().catch(() => "");
    if (!response.ok) {
        let detail = text.slice(0, 240);
        try {
            const json = JSON.parse(text);
            detail = json.error || json.Message || json.msg || json.error_msg || detail;
        } catch {
            // keep raw text
        }
        throw new Error(detail || `CDN request failed (${response.status})`);
    }
    return text;
}

async function sha256Hex(data: string) {
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(data));
    return bufferToHex(digest);
}

async function hmacSha256Raw(key: BufferSource, data: string) {
    const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

async function hmacSha1Raw(key: string, data: string) {
    const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

function bufferToHex(buffer: ArrayBuffer) {
    return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function bytesToUrlSafeBase64(buffer: ArrayBuffer) {
    return bytesToBase64(buffer).replace(/\+/g, "-").replace(/\//g, "_");
}

function percentEncode(value: string) {
    return encodeURIComponent(value).replace(/\+/g, "%20").replace(/\*/g, "%2A").replace(/%7E/g, "~");
}

function uriEncode(value: string) {
    return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
