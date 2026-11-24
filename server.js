import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const ALLOWED_ROOT_DIRS = ['public', 'src', 'samples'];

/**
 * Resolves a URL request path safely inside the project root.
 * @param {string} rootDir
 * @param {string} reqUrl
 * @returns {string|null}
 */
export function resolveSafeFilePath(rootDir, reqUrl) {
  let rawPath = '/';
  try {
    const parsed = new URL(reqUrl || '/', 'http://127.0.0.1');
    rawPath = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }

  let relativeTarget;
  if (rawPath === '/' || rawPath === '/index.html') {
    relativeTarget = 'public/index.html';
  } else if (rawPath === '/styles.css') {
    relativeTarget = 'public/styles.css';
  } else if (rawPath === '/app.js') {
    relativeTarget = 'public/app.js';
  } else {
    relativeTarget = rawPath.replace(/^\/+/, '');
    const topDir = relativeTarget.split('/')[0];
    if (!ALLOWED_ROOT_DIRS.includes(topDir)) {
      return null;
    }
  }

  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(resolvedRoot, relativeTarget);
  if (!resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    return null;
  }
  return resolvedTarget;
}

/**
 * Creates the static HTTP server for RealDrive Telemetry Studio.
 * @param {string} rootDir
 * @returns {http.Server}
 */
export function createAppServer(rootDir = __dirname) {
  return http.createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    const filePath = resolveSafeFilePath(rootDir, req.url);
    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const content = await fs.readFile(filePath);

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store'
      });

      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(content);
      }
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    }
  });
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMainModule) {
  const port = Number(process.env.PORT || 3000);
  const host = '127.0.0.1';
  const server = createAppServer(__dirname);
  server.listen(port, host, () => {
    console.log(`RealDrive Telemetry Studio çalışıyor: http://${host}:${port}`);
  });
}
