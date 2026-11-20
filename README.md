# Largest Prime

Scroll through the 41,024,320 decimal digits of the largest known prime, 2¹³⁶²⁷⁹⁸⁴¹ − 1. Click or drag the scrollbar to move through the number, or use **Jump to digit** to highlight an exact position, counted from 1.

## Run locally

With Node.js installed, run:

```sh
node serve.mjs
```

Open http://127.0.0.1:3000. The server builds and serves `dist/` on startup. It binds to localhost and accepts an optional `PORT` environment variable. There are no dependencies to install.

## Deploy to Cloudflare Pages

Push `main` to GitHub or GitLab. In **Workers & Pages**, create a Pages project by importing the repository, then enter these build settings.

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | None |
| Root directory | Leave blank (repository root) |
| Build command | `node build.mjs` |
| Build output directory | `dist` |

Select **Save and Deploy**. Cloudflare builds `dist/` from the tracked source and deploys it on pushes to `main`.

## How it works

The page uses native document scrolling. The viewer keeps the visible rows and 12 extra rows on either side in the DOM. Display rows adapt to the available width, and the scroll height is capped for browsers with limited layout dimensions.

The build script validates the digits in `m136279841.txt` and writes them to static files of up to 20,000 digits each. The first block also ships in the HTML so the viewer can display digits without a separate request. The viewer prefetches in the direction you scroll and keeps up to 12 completed blocks in memory. When you drag the scrollbar, it waits until you release it before requesting digits at the new position.
