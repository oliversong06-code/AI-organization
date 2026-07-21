import { describe, expect, it } from "vitest";
import { assertSameOrigin, CrossOriginRequestError } from "./csrf";

function makeRequest(headers: Record<string, string>) {
  return new Request("http://127.0.0.1:3000/api/approvals/x/approve", { headers });
}

describe("assertSameOrigin", () => {
  it("allows a request with no Origin header", () => {
    expect(() => assertSameOrigin(makeRequest({ host: "127.0.0.1:3000" }))).not.toThrow();
  });

  it("allows a same-origin request", () => {
    expect(() =>
      assertSameOrigin(makeRequest({ origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }))
    ).not.toThrow();
  });

  it("blocks a cross-origin request", () => {
    expect(() =>
      assertSameOrigin(makeRequest({ origin: "http://evil.example", host: "127.0.0.1:3000" }))
    ).toThrow(CrossOriginRequestError);
  });

  it("blocks a malformed Origin header", () => {
    expect(() =>
      assertSameOrigin(makeRequest({ origin: "not-a-url", host: "127.0.0.1:3000" }))
    ).toThrow(CrossOriginRequestError);
  });
});
