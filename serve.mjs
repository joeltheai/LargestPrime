import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import './build.mjs';

const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/index.html', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/viewer.mjs', ['viewer.mjs', 'text/javascript']],
  ['/digits.mjs', ['digits.mjs', 'text/javascript']],
]);

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  const path = request.url.split('?')[0];
  const asset = /^\/digits\/\d+\.txt$/.test(path)
    ? [path.slice(1), 'text/plain']
    : files.get(path);
  if (!asset) {
    response.writeHead(404).end();
    return;
  }

  const [name, type] = asset;
  const file = new URL(`./dist/${name}`, import.meta.url);
  const info = await stat(file).catch(() => null);
  if (!info) {
    response.writeHead(404).end();
    return;
  }

  const { size } = info;
  const headers = { 'Content-Type': `${type}; charset=utf-8`, 'Content-Length': size };
  response.writeHead(200, headers);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  const stream = createReadStream(file);
  response.on('close', () => stream.destroy());
  stream.on('error', (error) => response.destroy(error));
  stream.pipe(response);
});

server.listen(process.env.PORT ?? 3000, '127.0.0.1', () => {
  console.log(`Largest Prime is running at http://127.0.0.1:${server.address().port}`);
});
