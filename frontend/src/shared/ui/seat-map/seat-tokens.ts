// Sizes inside the seat map's SVG, in SVG user units (the viewBox grid), not CSS px or theme rem sizes.
// The whole drawing scales with the container width, so a theme `rem` size would not scale with it;
// the marker, the row labels and the layout in seat-layout.ts must stay in proportion to each other.

/** Side of one seat marker. */
export const markerSize = 24;

/** Font size of the row letters beside each row. */
export const rowLabelFontSize = 13;
