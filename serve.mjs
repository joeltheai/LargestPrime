import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';

const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/index.html', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/viewer.mjs', ['viewer.mjs', 'text/javascript']],
  ['/digits.mjs', ['digits.mjs', 'text/javascript']],
  ['/m136279841.txt', ['m136279841.txt', 'text/plain']],
]);

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  const asset = files.get(request.url.split('?')[0]);
  if (!asset) {
    response.writeHead(404).end();
    return;
  }

  const [name, type] = asset;
  const file = new URL(name, import.meta.url);
  const info = await stat(file).catch(() => null);
  if (!info) {
    response.writeHead(404).end();
    return;
  }

  const { size } = info;
  const headers = { 'Content-Type': `${type}; charset=utf-8`, 'Content-Length': size };
  let start = 0;
  let end = size - 1;
  let status = 200;

  if (name === 'm136279841.txt') {
    headers['Accept-Ranges'] = 'bytes';
    const range = request.headers.range;
    if (range && request.method === 'GET') {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      start = Number(match?.[1]);
      end = match?.[2] ? Math.min(Number(match[2]), end) : end;

      if (!Number.isSafeInteger(start) || start >= size || end < start) {
        response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
        return;
      }

      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      headers['Content-Length'] = end - start + 1;
    }
  }

  response.writeHead(status, headers);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  const stream = createReadStream(file, { start, end });
  response.on('close', () => stream.destroy());
  stream.on('error', (error) => response.destroy(error));
  stream.pipe(response);
});

server.listen(process.env.PORT ?? 3000, '127.0.0.1', () => {
  console.log(`Largest Prime is running at http://127.0.0.1:${server.address().port}`);
});
