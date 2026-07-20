export const COLUMN_SORTER_TYPES = {
  STRING: "string",
  NUMBER: "number",
  DATE: "date",
};

const basicSorters = {
  [COLUMN_SORTER_TYPES.STRING]: (field) => (a, b) =>
    (a?.[field] || "").localeCompare(b?.[field] || ""),
  [COLUMN_SORTER_TYPES.NUMBER]: (field) => (a, b) =>
    (a?.[field] || 0) - (b?.[field] || 0),
  [COLUMN_SORTER_TYPES.DATE]: (field) => (a, b) =>
    new Date(a?.[field] || 0) - new Date(b?.[field] || 0),
};

/**
 * Builds a sorter function for an Ant Design table column.
 *
 * @param {string} field - The data key to sort by.
 * @param {object} [options]
 * @param {"string"|"number"|"date"} [options.type="string"] - Value type.
 * @param {Function} [options.customCompare] - Overrides the default comparator.
 * @param {boolean} [options.nullsLast=true] - Push null/undefined values to the bottom.
 * @returns {Function} An Ant Design `sorter` function.
 */
export const buildSorter = (field, options = {}) => {
  const {
    type = COLUMN_SORTER_TYPES.STRING,
    customCompare,
    nullsLast = true,
  } = options;

  if (customCompare) return customCompare;

  const basic = (basicSorters[type] || basicSorters.string)(field);

  if (!nullsLast) return basic;

  return (a, b) => {
    // Push nulls/undefined to the end
    if (!a?.[field] && !b?.[field]) return 0;
    if (!a?.[field]) return 1;
    if (!b?.[field]) return -1;
    return basic(a, b);
  };
};
