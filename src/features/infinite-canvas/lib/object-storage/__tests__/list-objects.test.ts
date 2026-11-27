import { describe, expect, it } from "bun:test";

import { buildBucketRootUrl } from "../client";
import { defaultObjectStorageConfig, type ObjectStorageConfig } from "../types";

function config(patch: Partial<ObjectStorageConfig>): ObjectStorageConfig {
    return { ...defaultObjectStorageConfig, enabled: true, ...patch };
}

describe("object storage list helpers", () => {
    it("builds path-style bucket root for COS", () => {
        expect(
            buildBucketRootUrl(
                config({
                    provider: "cos",
                    region: "ap-guangzhou",
                    bucket: "demo-bucket",
                    accessKeyId: "ak",
                    secretAccessKey: "sk",
                }),
            ),
        ).toBe("https://cos.ap-guangzhou.myqcloud.com/demo-bucket");
    });

    it("builds virtual-hosted bucket root for S3", () => {
        expect(
            buildBucketRootUrl(
                config({
                    provider: "s3",
                    region: "us-east-1",
                    bucket: "demo-bucket",
                    accessKeyId: "ak",
                    secretAccessKey: "sk",
                    forcePathStyle: false,
                }),
            ),
        ).toBe("https://demo-bucket.s3.us-east-1.amazonaws.com");
    });
});
