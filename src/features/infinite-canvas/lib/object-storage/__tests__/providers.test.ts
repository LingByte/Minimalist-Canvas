import { describe, expect, it } from "bun:test";

import {
    buildObjectAccessUrl,
    buildObjectUploadUrl,
    normalizeKodoEndpoint,
    normalizeKodoRegion,
    resolveForcePathStyle,
    resolveObjectStorageEndpoint,
    resolveObjectStoragePublicBase,
    resolveSigningRegion,
} from "../providers";
import { canonicalUriPath } from "../s3-sigv4";
import { defaultObjectStorageConfig, type ObjectStorageConfig } from "../types";

function config(patch: Partial<ObjectStorageConfig>): ObjectStorageConfig {
    return { ...defaultObjectStorageConfig, enabled: true, ...patch };
}

describe("object storage providers", () => {
    it("builds default endpoints per vendor", () => {
        expect(resolveObjectStorageEndpoint(config({ provider: "oss", region: "cn-hangzhou" }))).toBe(
            "https://s3.oss-cn-hangzhou.aliyuncs.com",
        );
        expect(resolveObjectStorageEndpoint(config({ provider: "cos", region: "ap-guangzhou" }))).toBe(
            "https://cos.ap-guangzhou.myqcloud.com",
        );
        expect(resolveObjectStorageEndpoint(config({ provider: "tos", region: "cn-beijing" }))).toBe(
            "https://tos-s3-cn-beijing.volces.com",
        );
        expect(resolveObjectStorageEndpoint(config({ provider: "kodo", region: "cn-south-1" }))).toBe(
            "https://s3.cn-south-1.qiniucs.com",
        );
        expect(resolveObjectStorageEndpoint(config({ provider: "kodo", region: "huanan" }))).toBe(
            "https://s3.cn-south-1.qiniucs.com",
        );
        expect(resolveObjectStorageEndpoint(config({ provider: "minio", endpoint: "http://127.0.0.1:9000/" }))).toBe(
            "http://127.0.0.1:9000",
        );
    });

    it("normalizes mistaken Qiniu endpoints and region nicknames", () => {
        expect(normalizeKodoRegion("huanan")).toBe("cn-south-1");
        expect(normalizeKodoRegion("z2")).toBe("cn-south-1");
        expect(normalizeKodoEndpoint("https://s3-huanan.qiniucs.com")).toBe("https://s3.cn-south-1.qiniucs.com");
        expect(normalizeKodoEndpoint("https://s3-cn-south-1.qiniucs.com")).toBe("https://s3.cn-south-1.qiniucs.com");
        expect(
            resolveSigningRegion(
                config({
                    provider: "kodo",
                    region: "huanan",
                    endpoint: "https://s3-huanan.qiniucs.com",
                }),
            ),
        ).toBe("cn-south-1");
    });

    it("uses path-style for cos/minio and virtual-hosted for oss/s3 by default", () => {
        expect(resolveForcePathStyle(config({ provider: "cos" }))).toBe(true);
        expect(resolveForcePathStyle(config({ provider: "minio" }))).toBe(true);
        expect(resolveForcePathStyle(config({ provider: "oss" }))).toBe(false);
        expect(resolveForcePathStyle(config({ provider: "s3" }))).toBe(false);
    });

    it("builds path-style and virtual-hosted upload URLs", () => {
        const pathStyle = buildObjectUploadUrl(
            config({
                provider: "minio",
                endpoint: "http://127.0.0.1:9000",
                bucket: "canvas",
                forcePathStyle: true,
            }),
            "canvas/a b.png",
        );
        expect(pathStyle).toBe("http://127.0.0.1:9000/canvas/canvas/a%20b.png");

        const virtual = buildObjectUploadUrl(
            config({
                provider: "s3",
                region: "us-east-1",
                bucket: "my-bucket",
                forcePathStyle: false,
            }),
            "canvas/demo.png",
        );
        expect(virtual).toBe("https://my-bucket.s3.us-east-1.amazonaws.com/canvas/demo.png");
    });

    it("does not double the bucket when endpoint is already virtual-hosted", () => {
        const url = buildObjectUploadUrl(
            config({
                provider: "s3",
                endpoint: "https://my-bucket.s3.us-east-1.amazonaws.com",
                bucket: "my-bucket",
                forcePathStyle: false,
            }),
            "x.png",
        );
        expect(url).toBe("https://my-bucket.s3.us-east-1.amazonaws.com/x.png");
    });

    it("prefers publicBaseUrl for access URLs", () => {
        const access = buildObjectAccessUrl(
            config({
                provider: "oss",
                region: "cn-hangzhou",
                bucket: "demo",
                publicBaseUrl: "https://cdn.example.com/media/",
            }),
            "canvas/hi.png",
        );
        expect(access).toBe("https://cdn.example.com/media/canvas/hi.png");
    });

    it("derives a public base that matches upload host style", () => {
        const base = resolveObjectStoragePublicBase(
            config({
                provider: "s3",
                region: "us-east-1",
                bucket: "demo",
                forcePathStyle: false,
            }),
        );
        expect(base).toBe("https://demo.s3.us-east-1.amazonaws.com");
    });

    it("canonicalizes URI paths without double-encoding", () => {
        expect(canonicalUriPath("/canvas/a%20b.png")).toBe("/canvas/a%20b.png");
        expect(canonicalUriPath("/canvas/a b.png")).toBe("/canvas/a%20b.png");
    });
});
