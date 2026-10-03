type Child = Node | string | null | undefined | false;

/** Tiny DOM builder. Text is always inserted as text nodes (never parsed as HTML). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | boolean | number | ((event: Event) => void)> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === 'function') {
      element.addEventListener(key.replace(/^on/, '').toLowerCase(), value as EventListener);
    } else if (value === true) {
      element.setAttribute(key, '');
    } else if (value !== false) {
      element.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    element.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return element;
}

/** Inline SVG from a trusted, code-defined path string (never from network data). */
export function svgIcon(markup: string): SVGSVGElement {
  const template = document.createElement('template');
  template.innerHTML = `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${markup}</svg>`;
  return template.content.firstElementChild as SVGSVGElement;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
