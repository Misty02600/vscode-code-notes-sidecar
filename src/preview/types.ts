import { AnnotationContentPatch } from "../annotations/edit";
import { PreviewLayout } from "./scrollMap";

export type CardLayout = "sourceAligned" | "compact";

export interface AnnotationPreviewHandlers {
  hover(annotationKey: string): void;
  leave(): void;
  pageChange(): void;
  select(annotationKey: string): void;
  previewScroll(scrollTop: number, clientHeight: number): void;
  layout(layout: PreviewLayout, syncEditor: boolean): void;
  toggleLock(): void;
  reload(): void;
  edit(annotationKey: string, patch: AnnotationContentPatch): void;
  openLink(href: string, annotationKey?: string): void;
  dispose(): void;
}
