import { digitCount, digitsPerBlock, fetchDigitBlock } from './digits.mjs';

const list = document.querySelector('#digit-list');
const rows = document.querySelector('#rows');
const measure = document.querySelector('#digit-measure');
const readerHeader = document.querySelector('.reader-header');
const position = document.querySelector('#position');
const positionSlider = document.querySelector('#position-slider');
const loadStatus = document.querySelector('#load-status');
const form = document.querySelector('#jump-form');
const input = document.querySelector('#digit');
const jumpError = document.querySelector('#jump-error');
const retry = document.querySelector('#retry');

const format = new Intl.NumberFormat('en-US');
const overscan = 12;
const scrubIdleDelay = 100;
const hoverDelay = 100;
const finalBlock = Math.floor((digitCount - 1) / digitsPerBlock);
const maxScrollHeight = 8_000_000;
const cache = new Map();
const initialDigits = document.querySelector('#initial-digits').textContent;
if (initialDigits) cache.set(0, initialDigits);
const pending = new Map();
const failed = new Set();
const rowNodes = new Map();

let layout;
let frame;
let currentDigit = 0;
let selectedDigit = -1;
let previousPosition = '';
let scrubbing = false;
let scrubTimer;
let scrubFetchReady = false;
let hoverTimer;
let hoverBlock;
let scrollDirection = 1;
let rowsDirty = true;
let mountedStart;
let mountedEnd;

function scheduleRender() {
  if (frame === undefined) frame = requestAnimationFrame(render);
}

function scrollToOffset(offset) {
  const listTop = list.getBoundingClientRect().top + window.scrollY;
  window.scrollTo(0, Math.floor(listTop - readerHeader.offsetHeight + offset * layout.scrollScale));
}

function scrollToDigit(digit) {
  const row = Math.floor(digit / layout.digitsPerRow);
  scrollToOffset(Math.min(layout.maxLogicalOffset, row * layout.rowHeight));
}

function measureLayout() {
  const char = measure.getBoundingClientRect();
  const availableDigits = rows.clientWidth / char.width;
  // Choose a divisor of the block size so each display row fits in one block.
  const digitsPerRow = [100, 80, 50, 40, 25, 20, 16, 10, 5, 1].find((width) => width <= availableDigits) ?? 1;
  const rowHeight = char.height;
  const rowCount = Math.ceil(digitCount / digitsPerRow);
  const endPadding = parseFloat(getComputedStyle(list).paddingBottom);
  const logicalHeight = rowCount * rowHeight + endPadding;
  const physicalHeight = Math.min(logicalHeight, maxScrollHeight);
  const viewportHeight = document.documentElement.clientHeight;
  const headerHeight = readerHeader.offsetHeight;
  const thumbHeight = parseFloat(getComputedStyle(positionSlider).getPropertyValue('--thumb-height'));
  const readingHeight = Math.max(1, viewportHeight - headerHeight);
  const maxLogicalOffset = logicalHeight - readingHeight;
  const scrollScale = (physicalHeight - readingHeight) / maxLogicalOffset;

  const dimensionsChanged = layout &&
    (layout.digitsPerRow !== digitsPerRow || layout.rowHeight !== rowHeight);
  layout = { digitsPerRow, rowHeight, rowCount, viewportHeight, maxLogicalOffset, scrollScale, thumbHeight };
  positionSlider.style.setProperty('--scrollbar-top', `${headerHeight}px`);
  positionSlider.style.setProperty('--scrollbar-left', `${char.left + digitsPerRow * char.width}px`);
  list.style.height = `${physicalHeight}px`;
  if (dimensionsChanged) {
    rowNodes.clear();
    rows.replaceChildren();
    rowsDirty = true;
    scrollToDigit(currentDigit);
  }
  scheduleRender();
}

function requestBlock(block) {
  if (cache.has(block)) {
    const digits = cache.get(block);
    cache.delete(block);
    cache.set(block, digits);
    return;
  }
  if (pending.has(block) || failed.has(block)) return;

  const controller = new AbortController();
  pending.set(block, controller);
  fetchDigitBlock(block, controller.signal).then((digits) => {
    if (controller.signal.aborted) return;
    cache.set(block, digits);
    if (cache.size > 12) cache.delete(cache.keys().next().value);
    rowsDirty = true;
  }).catch(() => {
    if (!controller.signal.aborted) failed.add(block);
  }).finally(() => {
    if (pending.get(block) === controller) {
      pending.delete(block);
      scheduleRender();
    }
  });
}

function requestBlocks(first, last, prefetch) {
  const ahead = prefetch ? (currentDigit === 0 ? 2 : 3) : 0;
  const behind = prefetch ? 1 : 0;
  const prefetchStart = Math.max(0, first - (scrollDirection < 0 ? ahead : behind));
  const prefetchEnd = Math.min(finalBlock, last + (scrollDirection > 0 ? ahead : behind));
  for (const [block, controller] of pending) {
    if (block !== hoverBlock && (block < prefetchStart || block > prefetchEnd)) {
      pending.delete(block);
      controller.abort();
    }
  }
  for (const block of failed) {
    if (block < prefetchStart || block > prefetchEnd) failed.delete(block);
  }

  let needsDigits = false;
  for (let block = first; block <= last; block++) {
    if (!cache.has(block)) needsDigits = true;
    requestBlock(block);
  }
  if (needsDigits || !prefetch) return;

  const leadingBlock = scrollDirection > 0 ? last : first;
  for (let block = leadingBlock + scrollDirection; block >= prefetchStart && block <= prefetchEnd; block += scrollDirection) {
    requestBlock(block);
  }
  const trailingBlock = scrollDirection > 0 ? first - 1 : last + 1;
  if (trailingBlock >= prefetchStart && trailingBlock <= prefetchEnd) requestBlock(trailingBlock);
}

function paintRows(first, end) {
  for (const [index, node] of rowNodes) {
    if (index < first || index >= end) {
      node.remove();
      rowNodes.delete(index);
    }
  }

  let next = rows.firstChild;
  for (let index = first; index < end; index++) {
    const start = index * layout.digitsPerRow;
    let node = rowNodes.get(index);
    if (!node) {
      node = document.createElement('div');
      node.className = 'digit-row';
      rows.insertBefore(node, next);
      rowNodes.set(index, node);
    }
    next = node.nextSibling;

    const offset = start % digitsPerBlock;
    const digits = cache.get(Math.floor(start / digitsPerBlock))?.slice(offset, offset + layout.digitsPerRow);
    const highlight = selectedDigit >= start && selectedDigit < start + layout.digitsPerRow
      ? selectedDigit - start : -1;
    if (node.digits === digits && node.highlight === highlight) continue;

    if (!digits || highlight === -1) {
      node.textContent = digits ?? '';
    } else {
      const mark = document.createElement('mark');
      mark.textContent = digits[highlight];
      node.replaceChildren(digits.slice(0, highlight), mark, digits.slice(highlight + 1));
    }
    node.digits = digits;
    node.highlight = highlight;
  }
}

function render() {
  frame = undefined;
  const { digitsPerRow, rowHeight, rowCount, viewportHeight, maxLogicalOffset, scrollScale } = layout;
  const listTop = list.getBoundingClientRect().top;
  const physicalOffset = readerHeader.getBoundingClientRect().bottom - listTop;
  // Compress the scrollbar on narrow screens to stay within browser layout limits.
  // Keep the mounted rows at full size so the digits remain legible.
  const logicalOffset = Math.min(maxLogicalOffset, Math.max(0, physicalOffset) / scrollScale);
  const firstVisible = Math.floor(logicalOffset / rowHeight);
  const visibleHeight = Math.max(0, viewportHeight - listTop - Math.max(0, physicalOffset));
  const endVisible = Math.min(rowCount, Math.max(firstVisible + 1, Math.ceil((logicalOffset + visibleHeight) / rowHeight)));
  const first = Math.max(0, firstVisible - overscan);
  const end = Math.min(rowCount, endVisible + overscan);
  const nextDigit = firstVisible * digitsPerRow;
  if (nextDigit !== currentDigit) scrollDirection = nextDigit > currentDigit ? 1 : -1;
  currentDigit = nextDigit;

  const firstBlock = Math.floor(first * digitsPerRow / digitsPerBlock);
  const lastBlock = Math.floor((Math.min(digitCount, end * digitsPerRow) - 1) / digitsPerBlock);
  if (!scrubbing || scrubFetchReady) {
    requestBlocks(firstBlock, lastBlock, !scrubbing);
    scrubFetchReady = false;
  }
  if (rowsDirty || first !== mountedStart || end !== mountedEnd) {
    paintRows(first, end);
    mountedStart = first;
    mountedEnd = end;
    rowsDirty = false;
  }
  rows.style.transform = `translateY(${first * rowHeight + Math.max(0, physicalOffset) - logicalOffset}px)`;

  const range = `Digits ${format.format(currentDigit + 1)} – ${format.format(Math.min(digitCount, endVisible * digitsPerRow))}`;
  if (range !== previousPosition) {
    position.textContent = range;
    positionSlider.setAttribute('aria-valuetext', range);
    previousPosition = range;
  }
  if (!scrubbing) {
    positionSlider.valueAsNumber = Math.round(logicalOffset / maxLogicalOffset * Number(positionSlider.max));
  }
  const firstVisibleBlock = Math.floor(currentDigit / digitsPerBlock);
  const lastVisibleBlock = Math.floor((Math.min(digitCount, endVisible * digitsPerRow) - 1) / digitsPerBlock);
  const visibleFailure = [...failed].some((block) => block >= firstVisibleBlock && block <= lastVisibleBlock);
  const status = visibleFailure ? 'Could not load digits.' : '';
  if (loadStatus.textContent !== status) loadStatus.textContent = status;
  retry.hidden = !visibleFailure;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = input.value.trim();
  const digit = Number(value.replaceAll(',', ''));
  const valid = /^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(value) && digit >= 1 && digit <= digitCount;
  jumpError.hidden = valid;
  input.setAttribute('aria-invalid', String(!valid));
  if (!valid) {
    jumpError.textContent = 'Enter a digit position from 1 to 41,024,320.';
    return;
  }

  selectedDigit = digit - 1;
  rowsDirty = true;
  requestBlock(Math.floor(selectedDigit / digitsPerBlock));
  scrollToDigit(selectedDigit);
  scheduleRender();
});

input.addEventListener('input', () => {
  jumpError.hidden = true;
  input.removeAttribute('aria-invalid');
});

retry.addEventListener('click', () => {
  failed.clear();
  scheduleRender();
});

function blockAtOffset(offset) {
  const { rowHeight, digitsPerRow } = layout;
  return Math.floor(Math.floor(offset / rowHeight) * digitsPerRow / digitsPerBlock);
}

function clearHover() {
  clearTimeout(hoverTimer);
  hoverBlock = undefined;
}

positionSlider.addEventListener('pointermove', (event) => {
  if (scrubbing || event.pointerType !== 'mouse') return;
  const { top, height } = positionSlider.getBoundingClientRect();
  const { thumbHeight, maxLogicalOffset } = layout;
  if (height <= thumbHeight) return;

  const max = Number(positionSlider.max);
  const travel = height - thumbHeight;
  const pointer = event.clientY - top - thumbHeight / 2;
  const thumb = positionSlider.valueAsNumber / max * travel;
  if (Math.abs(pointer - thumb) <= thumbHeight / 2) {
    clearHover();
    return;
  }

  const step = Math.min(max, Math.max(0, Math.round(pointer / travel * max)));
  const block = blockAtOffset(step / max * maxLogicalOffset);
  if (block === hoverBlock) return;
  clearHover();
  if (cache.has(block) || pending.has(block) || failed.has(block)) return;
  hoverBlock = block;
  hoverTimer = setTimeout(() => requestBlock(block), hoverDelay);
});

positionSlider.addEventListener('pointerleave', clearHover);
positionSlider.addEventListener('pointerdown', (event) => {
  if (event.isPrimary && event.button === 0) {
    clearHover();
    scrubbing = true;
  }
});

function finishScrubbing() {
  if (!scrubbing) return;
  scrubbing = false;
  clearTimeout(scrubTimer);
  scrubTimer = undefined;
  scheduleRender();
}

window.addEventListener('pointerup', finishScrubbing);
window.addEventListener('pointercancel', finishScrubbing);
window.addEventListener('blur', finishScrubbing);

function scrollFromSlider() {
  const progress = positionSlider.valueAsNumber / Number(positionSlider.max);
  const offset = progress * layout.maxLogicalOffset;
  if (!scrubbing || scrubTimer === undefined) requestBlock(blockAtOffset(offset));

  if (scrubbing) {
    if (scrubTimer === undefined) scrubFetchReady = true;
    clearTimeout(scrubTimer);
    scrubTimer = setTimeout(() => {
      scrubFetchReady = true;
      scheduleRender();
    }, scrubIdleDelay);
  }
  if (progress === 0 || progress === 1) {
    window.scrollTo(0, progress * document.documentElement.scrollHeight);
  } else {
    scrollToOffset(offset);
  }
  scheduleRender();
}

positionSlider.addEventListener('input', scrollFromSlider);
positionSlider.addEventListener('keydown', (event) => {
  if (event.key !== 'Home' && event.key !== 'End') return;
  event.preventDefault();
  positionSlider.value = event.key === 'Home' ? positionSlider.min : positionSlider.max;
  scrollFromSlider();
});

window.addEventListener('scroll', scheduleRender, { passive: true });
window.addEventListener('resize', measureLayout);
const observer = new ResizeObserver(measureLayout);
observer.observe(readerHeader);
observer.observe(list);
observer.observe(measure);
positionSlider.hidden = false;
measureLayout();
