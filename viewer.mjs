import { digitCount, digitsPerBlock, fetchDigitBlock } from './digits.mjs';

const list = document.querySelector('#digit-list');
const rows = document.querySelector('#rows');
const measure = document.querySelector('#digit-measure');
const toolbar = document.querySelector('.toolbar');
const position = document.querySelector('#position');
const loadStatus = document.querySelector('#load-status');
const form = document.querySelector('#jump-form');
const input = document.querySelector('#digit');
const jumpError = document.querySelector('#jump-error');
const retry = document.querySelector('#retry');

const format = new Intl.NumberFormat('en-US');
const overscan = 12;
const maxScrollHeight = 8_000_000;
const cache = new Map();
const pending = new Map();
const failed = new Set();
const rowNodes = new Map();

let layout;
let frame;
let currentDigit = 0;
let selectedDigit = -1;
let insideList = false;
let previousPosition = '';

function scheduleRender() {
  if (frame === undefined) frame = requestAnimationFrame(render);
}

function scrollToDigit(digit) {
  const row = Math.floor(digit / layout.digitsPerRow);
  const listTop = list.getBoundingClientRect().top + window.scrollY;
  const offset = Math.min(layout.maxLogicalOffset, row * layout.rowHeight);
  window.scrollTo(0, Math.floor(listTop - toolbar.offsetHeight + offset * layout.scrollScale));
}

function measureLayout() {
  const char = measure.getBoundingClientRect();
  const availableDigits = rows.clientWidth / char.width;
  // Choose a divisor of the block size so each display row fits in one block.
  const digitsPerRow = [100, 80, 50, 40, 25, 20, 16, 10, 5, 1].find((width) => width <= availableDigits) ?? 1;
  const rowHeight = char.height;
  const rowCount = Math.ceil(digitCount / digitsPerRow);
  const logicalHeight = rowCount * rowHeight;
  const physicalHeight = Math.min(logicalHeight, maxScrollHeight);
  const viewportHeight = document.documentElement.clientHeight;
  const readingHeight = Math.max(1, viewportHeight - toolbar.offsetHeight);
  const maxLogicalOffset = logicalHeight - readingHeight;
  const scrollScale = (physicalHeight - readingHeight) / maxLogicalOffset;

  const dimensionsChanged = layout &&
    (layout.digitsPerRow !== digitsPerRow || layout.rowHeight !== rowHeight);
  layout = { digitsPerRow, rowHeight, rowCount, viewportHeight, maxLogicalOffset, scrollScale };
  list.style.height = `${physicalHeight}px`;
  if (dimensionsChanged) {
    rowNodes.clear();
    rows.replaceChildren();
    if (insideList) scrollToDigit(currentDigit);
  }
  scheduleRender();
}

function requestBlocks(first, last) {
  for (const [block, controller] of pending) {
    if (block < first || block > last) {
      pending.delete(block);
      controller.abort();
    }
  }
  for (const block of failed) {
    if (block < first || block > last) failed.delete(block);
  }

  for (let block = first; block <= last; block++) {
    if (cache.has(block)) {
      const digits = cache.get(block);
      cache.delete(block);
      cache.set(block, digits);
      continue;
    }
    if (pending.has(block) || failed.has(block)) continue;

    const controller = new AbortController();
    pending.set(block, controller);
    fetchDigitBlock(block, controller.signal).then((digits) => {
      if (controller.signal.aborted) return;
      cache.set(block, digits);
      if (cache.size > 12) cache.delete(cache.keys().next().value);
    }).catch(() => {
      if (!controller.signal.aborted) failed.add(block);
    }).finally(() => {
      if (pending.get(block) === controller) {
        pending.delete(block);
        scheduleRender();
      }
    });
  }
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
  const physicalOffset = toolbar.getBoundingClientRect().bottom - listTop;
  insideList = listTop <= toolbar.offsetHeight;
  // Compress the scrollbar on narrow screens to stay within browser layout limits.
  // Keep the mounted rows at full size so the digits remain legible.
  const logicalOffset = Math.min(maxLogicalOffset, Math.max(0, physicalOffset) / scrollScale);
  const firstVisible = Math.floor(logicalOffset / rowHeight);
  const visibleHeight = Math.max(0, viewportHeight - listTop - Math.max(0, physicalOffset));
  const endVisible = Math.min(rowCount, Math.max(firstVisible + 1, Math.ceil((logicalOffset + visibleHeight) / rowHeight)));
  const first = Math.max(0, firstVisible - overscan);
  const end = Math.min(rowCount, endVisible + overscan);
  currentDigit = firstVisible * digitsPerRow;

  const firstBlock = Math.floor(first * digitsPerRow / digitsPerBlock);
  const lastBlock = Math.floor((Math.min(digitCount, end * digitsPerRow) - 1) / digitsPerBlock);
  requestBlocks(firstBlock, lastBlock);
  paintRows(first, end);
  rows.style.top = `${first * rowHeight + Math.max(0, physicalOffset) - logicalOffset}px`;

  const range = `Digits ${format.format(currentDigit + 1)} – ${format.format(Math.min(digitCount, endVisible * digitsPerRow))}`;
  if (range !== previousPosition) {
    position.textContent = range;
    previousPosition = range;
  }
  const status = failed.size ? 'Could not load digits.' : pending.size ? 'Loading digits…' : '';
  if (loadStatus.textContent !== status) loadStatus.textContent = status;
  retry.hidden = !failed.size;
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

window.addEventListener('scroll', scheduleRender, { passive: true });
window.addEventListener('resize', measureLayout);
const observer = new ResizeObserver(measureLayout);
observer.observe(toolbar);
observer.observe(list);
observer.observe(measure);
measureLayout();
