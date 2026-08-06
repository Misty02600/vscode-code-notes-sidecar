import { describe, expect, it } from "vitest";
import {
  DEFAULT_ANNOTATION_GLOB,
  LEGACY_ANNOTATION_GLOB,
  resolveAnnotationGlobs
} from "../../src/annotations/discovery";

describe("resolveAnnotationGlobs", () => {
  it("discovers both current and legacy locations when the default is used", () => {
    expect(resolveAnnotationGlobs(DEFAULT_ANNOTATION_GLOB)).toEqual([
      DEFAULT_ANNOTATION_GLOB,
      LEGACY_ANNOTATION_GLOB
    ]);
  });

  it("uses only an explicitly configured custom glob", () => {
    expect(resolveAnnotationGlobs("docs/annotations/**/*.json")).toEqual([
      "docs/annotations/**/*.json"
    ]);
  });
});
