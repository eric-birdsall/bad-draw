/** The current theme's paper colors, read from the CSS custom properties so
 * the canvas, the menu sketch, and gallery cards match the page. */
export function paperColors() {
  const style = getComputedStyle(document.documentElement);
  const get = (name) => style.getPropertyValue(name).trim();
  return {
    paper: get("--paper"),
    dot: get("--paper-dot"),
    ink: get("--paper-ink"),
    pencil: get("--paper-pencil"),
    rule: get("--line"),
    bg: get("--bg"),
    title: get("--ink"),
    muted: get("--muted"),
    shadow: get("--surface-shadow"),
  };
}
