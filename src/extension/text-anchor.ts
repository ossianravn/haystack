interface ScrollPosition { element: Element; top: number; left: number }

export interface TextAnchor {
  owner: Element;
  context: Element;
  contextText: string;
  key: string;
  positions: ScrollPosition[];
}

export function anchorText(owner: Element): TextAnchor {
  // A table cell's words alone cannot distinguish two companies in the same industry.
  const context = owner.closest('tr,[role="row"],li,[role="listitem"]') ?? owner;
  const contextText = context.textContent ?? '';
  const path: number[] = [];
  for (let child = owner; child !== context && child.parentElement; child = child.parentElement) {
    path.unshift(Array.prototype.indexOf.call(child.parentElement.children, child));
  }
  const positions: ScrollPosition[] = [];
  let target = owner;
  for (let element = owner.parentElement; element; element = element.parentElement) {
    const style = getComputedStyle(element);
    const isDocument = element === document.scrollingElement;
    const vertical = isDocument || /auto|scroll/.test(style.overflowY);
    const horizontal = isDocument || /auto|scroll/.test(style.overflowX);
    if (!(vertical && element.scrollHeight > element.clientHeight) &&
        !(horizontal && element.scrollWidth > element.clientWidth)) continue;
    const targetRect = target.getBoundingClientRect();
    const rect = isDocument ? { top: 0, left: 0 } : element.getBoundingClientRect();
    positions.push({ element,
      top: vertical ? element.scrollTop + targetRect.top - rect.top - element.clientTop +
        (targetRect.height - element.clientHeight) / 2 : element.scrollTop,
      left: horizontal ? element.scrollLeft + targetRect.left - rect.left - element.clientLeft +
        (targetRect.width - element.clientWidth) / 2 : element.scrollLeft,
    });
    target = element;
  }
  return { owner, context, contextText, positions, key: JSON.stringify([context.tagName, contextText, path]) };
}

export function restorePosition(anchor: TextAnchor) {
  // Restore outer containers first so a virtual list can render the original row again.
  for (const { element, top, left } of anchor.positions.toReversed()) {
    if (element.isConnected) element.scrollTo({ top, left, behavior: 'instant' });
  }
}

export function afterScroll() {
  // Scroll events and framework commits run before the following rendered frame.
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
