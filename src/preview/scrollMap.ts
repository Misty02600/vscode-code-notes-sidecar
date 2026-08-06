export interface ScrollAnchor {
  /** Zero-based source range start line. */
  sourceLine: number;
  /** Scroll-container offset of the annotation card's top edge. */
  previewOffset: number;
}

export interface PreviewLayout {
  anchors: ScrollAnchor[];
  scrollHeight: number;
  clientHeight: number;
  lineCount: number;
}

interface Point {
  x: number;
  y: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function collapseDuplicateX(points: Point[]): Point[] {
  const grouped = new Map<number, number[]>();
  for (const point of points) {
    const values = grouped.get(point.x) ?? [];
    values.push(point.y);
    grouped.set(point.x, values);
  }

  return [...grouped.entries()]
    .map(([x, values]) => ({
      x,
      y: values.reduce((sum, value) => sum + value, 0) / values.length
    }))
    .sort((left, right) => left.x - right.x);
}

function collapseSourceAnchors(points: Point[]): Point[] {
  const topByLine = new Map<number, number>();
  for (const point of points) {
    topByLine.set(point.x, Math.min(topByLine.get(point.x) ?? point.y, point.y));
  }
  return [...topByLine.entries()]
    .map(([x, y]) => ({ x, y }))
    .sort((left, right) => left.x - right.x);
}

export function interpolate(value: number, rawPoints: Point[]): number {
  const points = collapseDuplicateX(rawPoints);
  if (points.length === 0) {
    return 0;
  }
  if (points.length === 1) {
    return points[0]?.y ?? 0;
  }

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const clamped = clamp(value, first.x, last.x);

  for (let index = 1; index < points.length; index += 1) {
    const right = points[index]!;
    if (clamped <= right.x) {
      const left = points[index - 1]!;
      const span = right.x - left.x;
      if (span === 0) {
        return right.y;
      }
      const ratio = (clamped - left.x) / span;
      return left.y + ratio * (right.y - left.y);
    }
  }

  return last.y;
}

function anchorPoints(layout: PreviewLayout, lineCount: number): Point[] {
  const maximumLine = Math.max(0, lineCount - 1);
  const maximumPreviewOffset = Math.max(
    0,
    layout.scrollHeight - layout.clientHeight
  );
  return layout.anchors
    .map(anchor => ({
      x: clamp(anchor.sourceLine, 0, maximumLine),
      y: clamp(anchor.previewOffset, 0, maximumPreviewOffset)
    }))
    .sort((left, right) => left.x - right.x || left.y - right.y);
}

function addBoundaryPoints(
  anchors: Point[],
  layout: PreviewLayout,
  lineCount: number
): Point[] {
  const maximumLine = Math.max(0, lineCount - 1);
  const maximumPreviewOffset = Math.max(
    0,
    layout.scrollHeight - layout.clientHeight
  );

  if (anchors.length === 0) {
    return maximumLine === 0
      ? [{ x: 0, y: 0 }]
      : [
          { x: 0, y: 0 },
          { x: maximumLine, y: maximumPreviewOffset }
        ];
  }

  const points = [...anchors];
  const first = anchors[0]!;
  const last = anchors[anchors.length - 1]!;

  // Source-aligned pages intentionally remove the blank source area before the
  // first card. In that layout, preview offset 0 belongs to the first annotation
  // rather than both line 0 and the annotation start.
  if (first.x > 0 && first.y > 0) {
    points.unshift({ x: 0, y: 0 });
  }
  if (last.x < maximumLine && last.y < maximumPreviewOffset) {
    points.push({ x: maximumLine, y: maximumPreviewOffset });
  }

  return points;
}

function sourcePoints(layout: PreviewLayout, lineCount: number): Point[] {
  return addBoundaryPoints(
    collapseSourceAnchors(anchorPoints(layout, lineCount)),
    layout,
    lineCount
  );
}

export function sourceLineToPreviewOffset(
  sourceLine: number,
  layout: PreviewLayout,
  lineCount: number
): number {
  return interpolate(sourceLine, sourcePoints(layout, lineCount));
}

export function previewOffsetToSourceLine(
  previewOffset: number,
  layout: PreviewLayout,
  lineCount: number
): number {
  if (layout.scrollHeight <= layout.clientHeight && layout.anchors.length > 0) {
    const firstAnchor = [...layout.anchors].sort(
      (left, right) =>
        left.previewOffset - right.previewOffset || left.sourceLine - right.sourceLine
    )[0]!;
    return clamp(firstAnchor.sourceLine, 0, Math.max(0, lineCount - 1));
  }
  const inversePoints = addBoundaryPoints(
    anchorPoints(layout, lineCount),
    layout,
    lineCount
  ).map(point => ({ x: point.y, y: point.x }));
  return interpolate(previewOffset, inversePoints);
}

export function sourceLineToPreviewScrollTop(
  sourceLine: number,
  layout: PreviewLayout,
  lineCount: number
): number {
  const maximumScroll = Math.max(0, layout.scrollHeight - layout.clientHeight);
  return clamp(
    sourceLineToPreviewOffset(sourceLine, layout, lineCount),
    0,
    maximumScroll
  );
}

export function previewScrollTopToSourceLine(
  scrollTop: number,
  layout: PreviewLayout,
  lineCount: number
): number {
  const maximumScroll = Math.max(0, layout.scrollHeight - layout.clientHeight);
  return previewOffsetToSourceLine(
    clamp(scrollTop, 0, maximumScroll),
    layout,
    lineCount
  );
}
