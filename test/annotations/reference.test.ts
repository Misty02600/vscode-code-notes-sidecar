import { describe, expect, it } from "vitest";
import { parseAnnotationReference } from "../../src/annotations/reference";

describe("parseAnnotationReference", () => {
  it("parses a page and annotation id", () => {
    expect(
      parseAnnotationReference(
        "annotation:design-decisions/decision-single-locked-environment"
      )
    ).toEqual({
      pageId: "design-decisions",
      annotationId: "decision-single-locked-environment"
    });
  });

  it("accepts the URL-like double-slash form and encoded ids", () => {
    expect(parseAnnotationReference("annotation://design%20notes/choice%2Fone")).toEqual({
      pageId: "design notes",
      annotationId: "choice/one"
    });
  });

  it("rejects malformed or unrelated links", () => {
    expect(parseAnnotationReference("https://example.com")).toBeUndefined();
    expect(parseAnnotationReference("annotation:only-one-part")).toBeUndefined();
    expect(parseAnnotationReference("annotation:page/id/extra")).toBeUndefined();
    expect(parseAnnotationReference("annotation:/id")).toBeUndefined();
    expect(parseAnnotationReference("annotation:%zz/id")).toBeUndefined();
  });
});
