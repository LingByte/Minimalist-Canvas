import { describe, expect, it } from "bun:test";

import { extractCdnDomain } from "../cdn-traffic";

describe("cdn traffic helpers", () => {
    it("extracts hostname from public base urls", () => {
        expect(extractCdnDomain("https://cdn.example.com/path")).toBe("cdn.example.com");
        expect(extractCdnDomain("cdn.example.com")).toBe("cdn.example.com");
        expect(extractCdnDomain("")).toBe("");
    });
});
