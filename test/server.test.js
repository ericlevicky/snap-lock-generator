'use strict';

/**
 * Tests for the snap-lock case generator server.
 *
 * Uses Node.js built-in test runner (node --test).
 * Run with: npm test
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Import app and generator under test
const app = require('../server');
const { generateCase } = require('../caseGenerator');
const jscad = require('@jscad/modeling');
const { measurements } = jscad;

// ── Helper: start a temporary test server ─────────────────────────────────
let server;
let baseUrl;

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => server.close(resolve));
}

// ── Helper: HTTP POST ─────────────────────────────────────────────────────
function post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(path, baseUrl);
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers })
        );
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── caseGenerator unit tests ──────────────────────────────────────────────

test('generateCase returns two geometry parts', () => {
  const parts = generateCase(88, 63, 20);
  assert.equal(parts.length, 2, 'should return [basePart, lidPart]');
});

test('base tray has expected outer dimensions for a standard poker deck', () => {
  // cardLength=88, cardHeight=63, cardDepth=20
  const [base] = generateCase(88, 63, 20);
  const [[minX, minY, minZ], [maxX, maxY, maxZ]] =
    measurements.measureBoundingBox(base);

  // Base sits flat on Z=0
  assert.ok(minZ >= -0.01, 'base bottom should be at Z=0');

  // Base inner = card + 2*tol; base outer = inner + 2*wall
  // length: 88 + 0.6 + 4.0 = 92.6 mm
  const expectedL = 88 + 2 * 0.3 + 2 * 2.0;
  assert.ok(
    Math.abs(maxX - minX - expectedL) < 0.1,
    `base X width should be ~${expectedL} mm, got ${maxX - minX}`
  );

  // height: 63 + 0.6 + 4.0 = 67.6 mm (ridges add extra in Y)
  const expectedH = 63 + 2 * 0.3 + 2 * 2.0;
  // Y span includes ridges (0.8 mm each side)
  const expectedHWithRidges = expectedH + 2 * 0.8;
  assert.ok(
    Math.abs(maxY - minY - expectedHWithRidges) < 0.1,
    `base Y span (with ridges) should be ~${expectedHWithRidges} mm, got ${maxY - minY}`
  );

  // Z height: depth + tol (0.3) + wall (2.0)
  const expectedZ = 20 + 0.3 + 2.0;
  assert.ok(
    Math.abs(maxZ - minZ - expectedZ) < 0.1,
    `base Z height should be ~${expectedZ} mm, got ${maxZ - minZ}`
  );
});

test('lid is placed beside the base with a gap', () => {
  const [base, lid] = generateCase(88, 63, 20);
  const [[, , baseMinZ], [baseMaxX]] = measurements.measureBoundingBox(base);
  const [[lidMinX, , lidMinZ]] = measurements.measureBoundingBox(lid);

  // Both parts sit on Z=0
  assert.ok(baseMinZ >= -0.01, 'base should start at Z=0');
  assert.ok(lidMinZ >= -0.01, 'lid should start at Z=0');

  // Lid starts after base with a gap of 10 mm
  const gap = lidMinX - baseMaxX;
  assert.ok(
    Math.abs(gap - 10) < 0.5,
    `gap between base and lid should be ~10 mm, got ${gap}`
  );
});

test('lid outer Y span accommodates the base ridges', () => {
  const [base, lid] = generateCase(88, 63, 20);
  const [[, baseMinY], [, baseMaxY]] = measurements.measureBoundingBox(base);
  const [[, lidMinY], [, lidMaxY]] = measurements.measureBoundingBox(lid);

  const baseYSpan = baseMaxY - baseMinY; // includes ridges
  const lidYSpan = lidMaxY - lidMinY;

  // Lid inner > base outer (without ridges); lid can flex to snap over ridges
  assert.ok(lidYSpan > baseYSpan - 2, 'lid Y span should be close to or larger than base outer (sans ridges)');
});

test('generateCase scales proportionally with different dimensions', () => {
  const small = generateCase(44, 32, 10);
  const large = generateCase(88, 63, 20);

  const [smallBase] = small;
  const [largeBase] = large;

  const [[sMinX, , sMinZ], [sMaxX, , sMaxZ]] =
    measurements.measureBoundingBox(smallBase);
  const [[lMinX, , lMinZ], [lMaxX, , lMaxZ]] =
    measurements.measureBoundingBox(largeBase);

  assert.ok(
    lMaxX - lMinX > sMaxX - sMinX,
    'larger card → larger base length'
  );
  assert.ok(
    lMaxZ - lMinZ > sMaxZ - sMinZ,
    'deeper deck → taller base'
  );
});

// ── HTTP endpoint tests ───────────────────────────────────────────────────

test('POST /generate returns a valid binary STL', async () => {
  await startServer();
  try {
    const res = await post('/generate', { length: 88, height: 63, depth: 20 });

    assert.equal(res.status, 200, 'should return HTTP 200');
    assert.ok(
      res.headers['content-type'].includes('application/octet-stream'),
      'content-type should be octet-stream'
    );
    assert.ok(
      res.headers['content-disposition'].includes('.stl'),
      'content-disposition should reference an STL filename'
    );

    // Binary STL: 80-byte header + 4-byte count + N*50 bytes
    const buf = res.body;
    assert.ok(buf.length > 84, 'STL body should be > 84 bytes');
    const triangleCount = buf.readUInt32LE(80);
    assert.equal(
      buf.length,
      80 + 4 + triangleCount * 50,
      'STL byte length should match triangle count'
    );
    assert.ok(triangleCount > 0, 'should have at least one triangle');
  } finally {
    await stopServer();
  }
});

test('POST /generate returns 400 for missing fields', async () => {
  await startServer();
  try {
    const res = await post('/generate', { length: 88 });
    assert.equal(res.status, 400, 'should return HTTP 400 for missing dims');
    const json = JSON.parse(res.body.toString());
    assert.ok(json.error, 'should include an error message');
  } finally {
    await stopServer();
  }
});

test('POST /generate returns 400 for zero dimensions', async () => {
  await startServer();
  try {
    const res = await post('/generate', { length: 0, height: 63, depth: 20 });
    assert.equal(res.status, 400, 'should return HTTP 400 for zero length');
  } finally {
    await stopServer();
  }
});

test('POST /generate returns 400 for negative dimensions', async () => {
  await startServer();
  try {
    const res = await post('/generate', { length: -5, height: 63, depth: 20 });
    assert.equal(res.status, 400, 'should return HTTP 400 for negative length');
  } finally {
    await stopServer();
  }
});

test('POST /generate returns 400 for non-numeric dimensions', async () => {
  await startServer();
  try {
    const res = await post('/generate', {
      length: 'abc',
      height: 63,
      depth: 20,
    });
    assert.equal(res.status, 400, 'should return HTTP 400 for non-numeric value');
  } finally {
    await stopServer();
  }
});

test('GET / serves the HTML page', async () => {
  await startServer();
  try {
    const res = await new Promise((resolve, reject) => {
      http.get(`${baseUrl}/`, (r) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () =>
          resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString() })
        );
      }).on('error', reject);
    });

    assert.equal(res.status, 200, 'homepage should return HTTP 200');
    assert.ok(
      res.body.includes('Snap-Lock Case Generator'),
      'homepage should contain the app title'
    );
  } finally {
    await stopServer();
  }
});
