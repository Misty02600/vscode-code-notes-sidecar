import { describe, expect, it } from "vitest";
import {
  PreviewLayout,
  interpolate,
  previewOffsetToSourceLine,
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
    scrollHeight: 800,
    clientHeight: 300
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
});
