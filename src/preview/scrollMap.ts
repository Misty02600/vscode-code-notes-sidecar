export interface ScrollAnchor {
  sourceLine: number;
  previewOffset: number;
}

export interface PreviewLayout {
  anchors: ScrollAnchor[];
  scrollHeight: number;
  clientHeight: number;
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

function sourcePoints(layout: PreviewLayout, lineCount: number): Point[] {
  const maximumLine = Math.max(0, lineCount - 1);
  return [
    { x: 0, y: 0 },
    ...layout.anchors.map(anchor => ({
      x: clamp(anchor.sourceLine, 0, maximumLine),
      y: clamp(anchor.previewOffset, 0, layout.scrollHeight)
    })),
    { x: maximumLine, y: layout.scrollHeight }
  ];
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
  const inversePoints = sourcePoints(layout, lineCount).map(point => ({
    x: point.y,
    y: point.x
  }));
  return interpolate(previewOffset, inversePoints);
}
