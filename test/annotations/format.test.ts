import { describe, expect, it } from "vitest";
import {
  normalizeRelativeFilePath,
  parseAnnotationDocument
} from "../../src/annotations/format";

describe("normalizeRelativeFilePath", () => {
  it("normalizes workspace-relative paths", () => {
    expect(normalizeRelativeFilePath("./src\\config.ts")).toBe("src/config.ts");
  });

  it("rejects paths that escape the workspace", () => {
    expect(normalizeRelativeFilePath("../secret.txt")).toBeUndefined();
    expect(normalizeRelativeFilePath("C:/secret.txt")).toBeUndefined();
    expect(normalizeRelativeFilePath("/etc/passwd")).toBeUndefined();
  });
});

describe("parseAnnotationDocument", () => {
  it("rejects unsupported document versions", () => {
    const result = parseAnnotationDocument({ version: 2, annotations: [] });

    expect(result.document).toBeUndefined();
    expect(result.issues[0]?.message).toContain("version must be 1");
  });

  it("parses valid range annotations", () => {
    const result = parseAnnotationDocument({
      version: 1,
      title: "Configuration flow",
      annotations: [
        {
          id: "load-config",
          file: "src/config.ts",
          title: "Trusted boundary",
          description: "The conversion happens here.",
          range: { startLine: 10, endLine: 15 },
          tags: ["config", "config"]
        }
      ]
    });

    expect(result.issues).toEqual([]);
    expect(result.document?.pages).toEqual([
      {
        title: "Annotations",
        annotations: [
          {
            id: "load-config",
            file: "src/config.ts",
            title: "Trusted boundary",
            description: "The conversion happens here.",
            range: { startLine: 10, endLine: 15 }
          }
        ]
      }
    ]);
  });

  it("keeps valid annotations when a sibling entry is invalid", () => {
    const result = parseAnnotationDocument({
      version: 1,
      annotations: [
        {
          id: "bad-range",
          file: "src/a.ts",
          title: "Bad",
          description: "Bad range",
          range: { startLine: 5, endLine: 2 }
        },
        {
          id: "good-range",
          file: "src/a.ts",
          title: "Good",
          description: "Good range",
          range: { startLine: 7, endLine: 9 }
        }
      ]
    });

    expect(result.issues).toHaveLength(1);
    expect(result.document?.pages[0]?.annotations.map(annotation => annotation.id)).toEqual([
      "good-range"
    ]);
  });

  it("rejects duplicate ids within one document", () => {
    const annotation = {
      id: "duplicate",
      file: "src/a.ts",
      title: "A",
      description: "A",
      range: { startLine: 1, endLine: 1 }
    };
    const result = parseAnnotationDocument({
      version: 1,
      annotations: [annotation, { ...annotation, title: "B" }]
    });

    expect(result.document?.pages[0]?.annotations).toHaveLength(1);
    expect(result.issues[0]?.message).toContain("duplicates");
  });

  it("parses any number of freely named pages", () => {
    const result = parseAnnotationDocument({
      version: 1,
      title: "Config guide",
      pages: [
        {
          id: "first-pass",
          title: "第一次阅读",
          annotations: [
            {
              id: "load",
              file: "src/a.ts",
              title: "Load",
              description: "What the code does.",
              range: { startLine: 1, endLine: 3 }
            }
          ]
        },
        {
          id: "tradeoffs",
          title: "为什么这样设计",
          annotations: [
            {
              id: "load",
              file: "src/a.ts",
              title: "Boundary",
              description: "Why the boundary exists.",
              range: { startLine: 1, endLine: 3 }
            }
          ]
        },
        { id: "notes", title: "随手记录", annotations: [] }
      ]
    });

    expect(result.issues).toEqual([]);
    expect(result.document?.pages.map(page => page.title)).toEqual([
      "第一次阅读",
      "为什么这样设计",
      "随手记录"
    ]);
    expect(result.document?.pages[0]?.annotations[0]?.id).toBe("load");
    expect(result.document?.pages[1]?.annotations[0]?.id).toBe("load");
  });

  it("rejects duplicate page ids", () => {
    const result = parseAnnotationDocument({
      version: 1,
      pages: [
        { id: "same", title: "One", annotations: [] },
        { id: "same", title: "Two", annotations: [] }
      ]
    });

    expect(result.document?.pages).toHaveLength(1);
    expect(result.issues[0]?.message).toContain("duplicates");
  });

  it("rejects ambiguous legacy and paged content", () => {
    const result = parseAnnotationDocument({
      version: 1,
      annotations: [],
      pages: []
    });

    expect(result.document).toBeUndefined();
    expect(result.issues[0]?.message).toContain("either");
  });
});
