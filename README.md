# Largest Prime

Scroll through the 41,024,320 decimal digits of the largest known prime, 2¹³⁶²⁷⁹⁸⁴¹ − 1. Use **Jump to digit** to highlight a position, counted from 1.

## Run locally

With Node.js installed, run:

```sh
node serve.mjs
```

Open http://127.0.0.1:3000. There are no dependencies to install or assets to build. The server binds to localhost and accepts an optional `PORT` environment variable.

## How it works

The page uses native document scrolling. The viewer keeps the visible rows and 12 extra rows on either side in the DOM. Display rows adapt to the available width, and the scroll height is capped for browsers with limited layout dimensions.

The original text file contains 100 digits followed by CRLF on each full line. This makes it possible to calculate byte offsets and fetch blocks of 20,000 digits directly. The viewer keeps at most 12 completed blocks in memory.

To deploy the static files, serve `index.html`, `styles.css`, `viewer.mjs`, `digits.mjs`, and `m136279841.txt` from the same directory. The host must support HTTP byte ranges for the text file and preserve its original line endings.
