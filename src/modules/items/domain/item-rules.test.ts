import { describe, expect, it } from "vitest";
import {
  assertItemCanBeReviewed,
  assertItemCanBeSubmitted,
  assertRequestCanBeSelected,
} from "./item-rules";

describe("item state rules", () => {
  it("only submits drafts or rejected listings", () => {
    expect(() => assertItemCanBeSubmitted("DRAFT")).not.toThrow();
    expect(() => assertItemCanBeSubmitted("REJECTED")).not.toThrow();
    expect(() => assertItemCanBeSubmitted("PUBLISHED")).toThrow(/下書き/);
  });

  it("only reviews pending listings", () => {
    expect(() => assertItemCanBeReviewed("PENDING_REVIEW")).not.toThrow();
    expect(() => assertItemCanBeReviewed("DRAFT")).toThrow(/審査待ち/);
  });

  it("only selects pending requests on published items", () => {
    expect(() => assertRequestCanBeSelected("PUBLISHED", "REQUESTED")).not.toThrow();
    expect(() => assertRequestCanBeSelected("RESERVED", "REQUESTED")).toThrow(/公開中/);
  });
});
