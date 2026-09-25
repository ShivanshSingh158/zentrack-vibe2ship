import React from 'react';
import { motion } from 'framer-motion';

export const FILTER_CATEGORIES = ['All', 'Documents', 'Images', 'Notes'] as const;
export type FilterCategory = typeof FILTER_CATEGORIES[number];

interface CategoryFilterTabsProps {
  categories?: readonly FilterCategory[];
  activeCategory: FilterCategory;
  categoryCounts: Record<FilterCategory, number>;
  onSelectCategory: (category: FilterCategory) => void;
  compact?: boolean;
}

export const CategoryFilterTabs: React.FC<CategoryFilterTabsProps> = ({
  categories = FILTER_CATEGORIES,
  activeCategory,
  categoryCounts,
  onSelectCategory,
  compact = false,
}) => {
  return (
    <div className={`notes-category-filter-strip ${compact ? 'compact' : ''}`}>
      {categories.map((cat) => {
        const isActive = activeCategory === cat;
        const count = categoryCounts[cat] ?? 0;
        return (
          <motion.button
            key={cat}
            type="button"
            className={`notes-category-pill ${isActive ? 'active' : ''}`}
            onClick={() => onSelectCategory(cat)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.12 }}
            title={`Filter by ${cat} (${count})`}
          >
            <span className="category-pill-label">{cat}</span>
            <span className={`category-pill-badge ${isActive ? 'active' : ''}`}>
              {count}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
};
