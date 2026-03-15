'use strict';

/**
 * Snap-lock case generator for a deck of cards.
 *
 * The case has two 3D-printed parts:
 *   1. Base tray  – open-top box that holds the card deck, with two continuous
 *      outward snap ridges running the full length of both long outer walls.
 *   2. Lid        – inverted tray that slides over the base.  Matching
 *      inward-facing grooves in the long inner walls snap over the base ridges
 *      and lock the lid in place.
 *
 * All dimensions are in millimetres.
 */

const {
  primitives: { cuboid },
  booleans: { subtract, union },
  transforms: { translate, rotateX },
} = require('@jscad/modeling');

// ─── tuneable constants ───────────────────────────────────────────────────────
const WALL = 2.0;         // wall / floor / ceiling thickness
const CARD_TOL = 0.3;     // card-to-interior gap (each side)
const LIP_TOL = 0.2;      // lid-to-base sliding gap (each side)
const SNAP_D = 0.8;       // depth of snap ridge / groove protrusion
const SNAP_H = 1.5;       // height of snap ridge / groove
const GROOVE_D = SNAP_D + 0.2;   // groove slightly deeper than ridge
const GROOVE_H = SNAP_H + 0.2;   // groove slightly taller than ridge
const GROOVE_INSET = 2.0; // distance from lid open end to groove centre

/**
 * Build the base tray geometry (centred at the origin).
 *
 * @param {number} innerL  Interior cavity length  (card length + tolerance)
 * @param {number} innerH  Interior cavity height  (card height + tolerance)
 * @param {number} innerD  Interior cavity depth   (deck thickness + tolerance)
 * @returns {Object} JSCAD geometry
 */
function buildBase(innerL, innerH, innerD) {
  const outerL = innerL + 2 * WALL;
  const outerH = innerH + 2 * WALL;
  const outerD = innerD + WALL; // +WALL for floor; open top

  // Outer solid box
  const outerBox = cuboid({ size: [outerL, outerH, outerD] });

  // Interior void – shifted up by WALL/2 to preserve the floor
  const voidBox = translate(
    [0, 0, WALL / 2],
    cuboid({ size: [innerL, innerH, innerD + 0.02] })
  );

  // Hollow out the tray
  let base = subtract(outerBox, voidBox);

  // Snap ridges – run the full length on both long (Y-facing) outer walls.
  // Ridge centre Z is at the very top of the outer box: outerD/2 − snapH/2
  const ridgeZ = outerD / 2 - SNAP_H / 2;
  const ridgeYPos = outerH / 2 + SNAP_D / 2;

  const ridgeGeom = cuboid({ size: [outerL, SNAP_D, SNAP_H] });

  const ridgeA = translate([0, ridgeYPos, ridgeZ], ridgeGeom);
  const ridgeB = translate([0, -ridgeYPos, ridgeZ], ridgeGeom);

  base = union(base, ridgeA, ridgeB);

  return base;
}

/**
 * Build the lid geometry (centred at the origin, open face at −Z).
 *
 * @param {number} baseOuterL  Outer length of the base tray
 * @param {number} baseOuterH  Outer height (Y dimension) of the base tray
 * @param {number} cardDepth   Original deck depth (used to size the skirt)
 * @returns {Object} JSCAD geometry
 */
function buildLid(baseOuterL, baseOuterH, cardDepth) {
  const innerL = baseOuterL + 2 * LIP_TOL;
  const innerH = baseOuterH + 2 * LIP_TOL;
  const outerL = innerL + 2 * WALL;
  const outerH = innerH + 2 * WALL;

  // Skirt is tall enough to be stable; at least 15 mm
  const skirtH = Math.max(15, Math.round(cardDepth * 0.4) + 6);
  const totalH = skirtH + WALL; // +WALL for ceiling

  // Outer solid box
  const lidOuter = cuboid({ size: [outerL, outerH, totalH] });

  // Interior void – open at −Z (bottom of centred box)
  // Void centre Z = −WALL/2 so the ceiling at +totalH/2 is intact
  const lidVoid = translate(
    [0, 0, -WALL / 2],
    cuboid({ size: [innerL, innerH, skirtH + 0.02] })
  );

  let lid = subtract(lidOuter, lidVoid);

  // Snap grooves – cut into both long inner walls.
  // When the lid is seated, the groove must align with the base ridge.
  // Position the groove GROOVE_INSET mm from the lid's open end (−Z face).
  // Open end of lid is at Z = −totalH/2.
  // Groove centre Z = −totalH/2 + GROOVE_INSET + GROOVE_H/2
  const grooveZ = -totalH / 2 + GROOVE_INSET + GROOVE_H / 2;

  // Groove is cut from the inner face into the wall material.
  // Inner face of +Y wall is at Y = +innerH/2.
  // Groove centre Y = +innerH/2 + GROOVE_D/2 (centred inside the wall).
  const grooveYPos = innerH / 2 + GROOVE_D / 2;

  const grooveGeom = cuboid({ size: [innerL, GROOVE_D, GROOVE_H] });

  const grooveA = translate([0, grooveYPos, grooveZ], grooveGeom);
  const grooveB = translate([0, -grooveYPos, grooveZ], grooveGeom);

  lid = subtract(lid, grooveA, grooveB);

  return lid;
}

/**
 * Generate the two-part snap-lock case and return a pair of print-ready
 * JSCAD geometry objects placed side-by-side on the Z = 0 build plate.
 *
 * @param {number} cardLength  Deck length in mm
 * @param {number} cardHeight  Deck height (card short edge) in mm
 * @param {number} cardDepth   Deck thickness in mm
 * @returns {Object[]} [basePart, lidPart]
 */
function generateCase(cardLength, cardHeight, cardDepth) {
  // Interior dimensions include tolerance on every exposed face
  const innerL = cardLength + 2 * CARD_TOL;
  const innerH = cardHeight + 2 * CARD_TOL;
  const innerD = cardDepth + CARD_TOL; // only top tolerance (floor is flush)

  const baseOuterL = innerL + 2 * WALL;
  const baseOuterH = innerH + 2 * WALL;
  const baseOuterD = innerD + WALL;

  // ── Base tray ──────────────────────────────────────────────────────────────
  // In JSCAD the geometry is centred at the origin.
  // Orient for printing: flat floor on Z = 0, walls pointing up.
  // Centre of tray is at Z = baseOuterD / 2.
  const baseCentred = buildBase(innerL, innerH, innerD);
  const basePart = translate([0, 0, baseOuterD / 2], baseCentred);

  // ── Lid ───────────────────────────────────────────────────────────────────
  // Orient for printing: flat ceiling on Z = 0, skirt walls pointing up.
  // The centred lid has ceiling at +totalH/2 and open end at −totalH/2.
  // Flip (rotateX π) so ceiling → −totalH/2, open end → +totalH/2.
  // Then translate +totalH/2 in Z to bring ceiling to Z = 0.
  const lidCentred = buildLid(baseOuterL, baseOuterH, cardDepth);
  const lidSkirt = Math.max(15, Math.round(cardDepth * 0.4) + 6);
  const lidTotal = lidSkirt + WALL;

  const lidOriented = translate(
    [0, 0, lidTotal / 2],
    rotateX(Math.PI, lidCentred)
  );

  // Place lid next to the base with a 10 mm gap
  const lidInnerL = baseOuterL + 2 * LIP_TOL;
  const lidOuterL = lidInnerL + 2 * WALL;
  const gap = 10;
  const lidPart = translate(
    [baseOuterL / 2 + lidOuterL / 2 + gap, 0, 0],
    lidOriented
  );

  return [basePart, lidPart];
}

module.exports = { generateCase };
