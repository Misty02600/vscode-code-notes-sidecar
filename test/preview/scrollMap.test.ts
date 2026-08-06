import { describe, expect, it } from "vitest";
import {
  PreviewLayout,
  interpolate,
  previewOffsetToSourceLine,
  previewScrollTopToSourceLine,
  sourceLineToPreviewScrollTop,
  sourceLineToPreviewOffset
} from "../../src/preview/scrollMap";

describe("interpolate", () => {
  it("interpolates and clamps between anchor points", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 100 },
      { x: 20, y: 300 }
    ];

    expect(interpolate(-1, points)).toBe(0);
    expect(interpolate(5, points)).toBe(50);
    expect(interpolate(15, points)).toBe(200);
    expect(interpolate(30, points)).toBe(300);
  });

  it("averages duplicate source anchors", () => {
    expect(
      interpolate(10, [
        { x: 0, y: 0 },
        { x: 10, y: 80 },
        { x: 10, y: 120 },
        { x: 20, y: 200 }
      ])
    ).toBe(100);
  });
});

describe("source/preview mapping", () => {
  const layout: PreviewLayout = {
    anchors: [
      { sourceLine: 20, previewOffset: 100 },
      { sourceLine: 60, previewOffset: 500 }
    ],
    scrollHeight: 1100,
    clientHeight: 300,
    lineCount: 101
  };

  it("maps source lines through annotation card anchors", () => {
    expect(sourceLineToPreviewOffset(20, layout, 101)).toBe(100);
    expect(sourceLineToPreviewOffset(40, layout, 101)).toBe(300);
    expect(sourceLineToPreviewOffset(60, layout, 101)).toBe(500);
  });

  it("preserves fractional line progress for smoother reverse scrolling", () => {
    const previewOffset = sourceLineToPreviewOffset(20.5, layout, 101);

    expect(previewOffset).toBe(105);
    expect(previewOffsetToSourceLine(previewOffset, layout, 101)).toBeCloseTo(20.5, 6);
  });

  it("approximately reverses the mapping", () => {
    for (const sourceLine of [0, 10, 20, 40, 60, 80, 100]) {
      const previewOffset = sourceLineToPreviewOffset(sourceLine, layout, 101);
      expect(previewOffsetToSourceLine(previewOffset, layout, 101)).toBeCloseTo(
        sourceLine,
        6
      );
    }
  });

  it("maps a normalized preview origin back to the first annotation start", () => {
    const normalizedLayout: PreviewLayout = {
      anchors: [
        { sourceLine: 20, previewOffset: 0 },
        { sourceLine: 60, previewOffset: 400 }
      ],
      scrollHeight: 800,
      clientHeight: 300,
      lineCount: 101
    };

    expect(sourceLineToPreviewScrollTop(0, normalizedLayout, 101)).toBe(0);
    expect(sourceLineToPreviewScrollTop(20, normalizedLayout, 101)).toBe(0);
    expect(previewScrollTopToSourceLine(0, normalizedLayout, 101)).toBe(20);
  });

  it("uses viewport top positions and clamps at the scroll boundary", () => {
    const topAlignedLayout: PreviewLayout = {
      anchors: [
        { sourceLine: 20, previewOffset: 0 },
        { sourceLine: 60, previewOffset: 400 }
      ],
      scrollHeight: 800,
      clientHeight: 300,
      lineCount: 101
    };

    expect(sourceLineToPreviewScrollTop(40, topAlignedLayout, 101)).toBe(200);
    expect(previewScrollTopToSourceLine(200, topAlignedLayout, 101)).toBe(40);
    expect(sourceLineToPreviewScrollTop(100, topAlignedLayout, 101)).toBe(500);
    expect(previewScrollTopToSourceLine(500, topAlignedLayout, 101)).toBe(100);
  });

  it("uses the first card as the canonical anchor for a shared source start", () => {
    const duplicateStartLayout: PreviewLayout = {
      anchors: [
        { sourceLine: 20, previewOffset: 0 },
        { sourceLine: 20, previewOffset: 96 },
        { sourceLine: 40, previewOffset: 300 }
      ],
      scrollHeight: 700,
      clientHeight: 300,
      lineCount: 61
    };

    expect(sourceLineToPreviewScrollTop(20, duplicateStartLayout, 61)).toBe(0);
    expect(previewScrollTopToSourceLine(0, duplicateStartLayout, 61)).toBe(20);
    expect(previewScrollTopToSourceLine(96, duplicateStartLayout, 61)).toBe(20);
  });

  it("maps a non-scrollable preview to the first card instead of averaging anchors", () => {
    const nonScrollableLayout: PreviewLayout = {
      anchors: [
        { sourceLine: 10, previewOffset: 0 },
        { sourceLine: 30, previewOffset: 96 }
      ],
      scrollHeight: 300,
      clientHeight: 300,
      lineCount: 50
    };

    expect(previewScrollTopToSourceLine(0, nonScrollableLayout, 50)).toBe(10);
  });
});
