import type { Category } from "@/types/purchase-request";
import { categoryColors, categoryIcons, categoryLabels } from "../utils";

export function CategoryVisual({
  category,
  large = false,
}: {
  category: Category;
  large?: boolean;
}) {
  return (
    <div
      className={`category-visual ${categoryColors[category]}${large ? " category-visual-large" : ""}`}
      role="img"
      aria-label={`${categoryLabels[category]} 카테고리 이미지`}
    >
      <span className="visual-orbit visual-orbit-one" aria-hidden="true" />
      <span className="visual-orbit visual-orbit-two" aria-hidden="true" />
      <span className="visual-icon" aria-hidden="true">{categoryIcons[category]}</span>
      <span className="visual-caption" aria-hidden="true">{categoryLabels[category]}</span>
    </div>
  );
}
