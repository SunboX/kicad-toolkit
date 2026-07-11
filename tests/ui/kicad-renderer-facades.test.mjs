// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    PcbArcUtils,
    PcbEdgeFacingGlyphNormalizer,
    PcbFootprintPrimitiveSelector,
    SchematicColorResolver,
    SchematicContentLayout,
    SchematicOwnerPinLabelLayout,
    SchematicSvgUtils,
    SchematicTypography
} from '../../src/legacy-renderers.mjs'

test('PcbArcUtils exposes deterministic KiCad arc geometry helpers', () => {
    assert.equal(PcbArcUtils.resolveSweepDelta(350, 10), 20)
    assert.equal(PcbArcUtils.resolveSweepDelta(10, 350), -20)

    const path = PcbArcUtils.buildPath({
        x: 0,
        y: 0,
        radius: 10,
        startAngle: 0,
        endAngle: 90
    })

    assert.equal(path, 'M 10 0 A 10 10 0 0 1 0 10')
    assert.deepEqual(PcbArcUtils.extents({ x: 5, y: 5, radius: 2, width: 1 }), {
        minX: 2.5,
        maxX: 7.5,
        minY: 2.5,
        maxY: 7.5
    })
})

test('PcbFootprintPrimitiveSelector selects KiCad documentation layers by side', () => {
    const board = {
        drawings: [
            { id: 'front', layer: 'F.SilkS' },
            { id: 'back', layer: 'B.SilkS' },
            { id: 'fab', layer: 'F.Fab' }
        ],
        texts: [{ id: 'ref', layer: 'F.SilkS' }]
    }

    assert.deepEqual(
        PcbFootprintPrimitiveSelector.select(board, { side: 'top' }),
        {
            drawings: [{ id: 'front', layer: 'F.SilkS' }],
            texts: [{ id: 'ref', layer: 'F.SilkS' }]
        }
    )
    assert.deepEqual(
        PcbFootprintPrimitiveSelector.select(board, { side: 'bottom' }),
        {
            drawings: [{ id: 'back', layer: 'B.SilkS' }],
            texts: []
        }
    )
})

test('schematic renderer facades expose KiCad color typography and SVG helpers', () => {
    assert.equal(SchematicSvgUtils.escapeHtml('<A&B>'), '&lt;A&amp;B&gt;')
    assert.equal(SchematicSvgUtils.formatNumber(10.5), '10.5')
    assert.equal(SchematicSvgUtils.projectSchematicY(100, 25), 75)
    assert.equal(
        SchematicColorResolver.resolveInkColor({ labelKind: 'global' }),
        'var(--schematic-alert-color)'
    )
    assert.equal(SchematicTypography.resolveViewerFontSize({ sizeY: 1.5 }), 1.5)
    assert.equal(
        SchematicTypography.buildSchematicTextRenderOptions({
            x: 10,
            y: 20,
            sizeX: 1,
            sizeY: 2,
            rotation: 90
        }).rotation,
        -90
    )
})

test('PcbEdgeFacingGlyphNormalizer preserves KiCad primitives as deterministic clones', () => {
    const primitives = {
        fills: [{ x1: 0, y1: 0, x2: 1, y2: 1, layer: 'F.Fab' }],
        tracks: [{ x1: 0, y1: 0, x2: 10, y2: 0, width: 1 }],
        arcs: [{ x: 5, y: 0, radius: 2, startAngle: 0, endAngle: 180 }],
        regions: [{ points: [{ x: 0, y: 0 }] }]
    }

    const normalized = PcbEdgeFacingGlyphNormalizer.normalizeForBoardEdge(
        primitives,
        { minX: 0, minY: 0, widthMil: 100, heightMil: 100 }
    )

    assert.deepEqual(normalized, primitives)
    assert.notEqual(normalized.tracks[0], primitives.tracks[0])
    assert.notEqual(normalized.arcs[0], primitives.arcs[0])
})

test('schematic layout facades expose KiCad content and owner-pin placement helpers', () => {
    const schematic = {
        sheet: { marginWidth: 12 },
        lines: [{ x1: 10, y1: 10, x2: 20, y2: 20 }],
        texts: [],
        components: [],
        pins: [{ x: 10, y: 20, length: 5, orientation: 'left' }],
        regions: []
    }
    const clipId = SchematicContentLayout.buildClipId(120, 80, schematic)

    assert.equal(clipId, 'schematic-content-clip-120-80-12-1-0-0-1-0')
    assert.equal(
        SchematicContentLayout.buildClipMarkup(120, 80, schematic, clipId),
        '<defs><clipPath id="schematic-content-clip-120-80-12-1-0-0-1-0"><rect x="12" y="12" width="96" height="56" /></clipPath></defs>'
    )
    assert.equal(SchematicContentLayout.buildTransform(120, 80, schematic), '')
    assert.deepEqual(
        SchematicOwnerPinLabelLayout.resolveNativePinTextPlacement(
            {
                x: 10,
                y: 20,
                length: 5,
                orientation: 'left',
                nameOffset: 0.75
            },
            'name'
        ),
        { x: 10.75, yOffset: 0, anchor: 'start', rotation: 0 }
    )
    assert.equal(
        SchematicOwnerPinLabelLayout.buildOwnerPinLabelKey('symbol-1', 'IN'),
        'symbol-1::IN'
    )
})
