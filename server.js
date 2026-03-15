'use strict';

const path = require('path');
const express = require('express');
const { generateCase } = require('./caseGenerator');
const stlSerializer = require('@jscad/stl-serializer');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON request bodies
app.use(express.json());

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

/**
 * POST /generate
 *
 * Body (JSON):
 *   { length: number, height: number, depth: number }
 *
 * All values are in millimetres and must be positive numbers.
 * Returns a binary STL file for download.
 */
app.post('/generate', (req, res) => {
  const { length, height, depth } = req.body;

  // Validate
  const dims = { length, height, depth };
  for (const [name, val] of Object.entries(dims)) {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) {
      return res
        .status(400)
        .json({ error: `"${name}" must be a positive number` });
    }
    dims[name] = n;
  }

  try {
    const parts = generateCase(dims.length, dims.height, dims.depth);

    // Serialise to binary STL
    const chunks = stlSerializer.serialize({ binary: true }, ...parts);

    // Concatenate all chunks into one Buffer
    const totalBytes = chunks.reduce((s, c) => s + c.byteLength, 0);
    const stlBuffer = Buffer.alloc(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      Buffer.from(chunk).copy(stlBuffer, offset);
      offset += chunk.byteLength;
    }

    const filename = `snaplock-case-${dims.length}x${dims.height}x${dims.depth}mm.stl`;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );
    res.send(stlBuffer);
  } catch (err) {
    console.error('Case generation error:', err);
    res.status(500).json({ error: 'Failed to generate case geometry' });
  }
});

// Start server (skip when required as a module, e.g. in tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Snap-lock generator running at http://localhost:${PORT}`);
  });
}

module.exports = app;
