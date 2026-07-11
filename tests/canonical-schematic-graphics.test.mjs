// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'

import { CircuitJsonModelAdapter } from '../src/core/circuit-json/CircuitJsonModelAdapter.mjs'
import { Parser } from '../src/parser.mjs'
import { SchematicSvgRenderer } from '../src/renderers.mjs'

/**
 * Builds a fake KiCad schematic with root and symbol-owned graphics.
 * @returns {string} KiCad schematic source.
 */
function shapeSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Fixture:Owned"
                (rectangle
                    (start -2 -1)
                    (end 2 1)
                    (stroke (width 0.2) (type solid))
                    (fill (type none))
                )
            )
        )
        (symbol "Fixture:Owned"
            (at 80 40 0)
            (property "Reference" "U1" (at 80 36 0)
                (effects (font (size 1 1)))
            )
            (property "Value" "Owned" (at 80 44 0)
                (effects (font (size 1 1)))
            )
            (uuid "owned-symbol")
        )
        (rectangle
            (start 10 10)
            (end 20 16)
            (stroke
                (width 0.15)
                (type dash)
                (color 10 20 30 0.5)
            )
            (fill (type color) (color 40 50 60 0.25))
            (uuid "root-rectangle")
        )
        (circle
            (center 30 12)
            (radius 2.5)
            (stroke (width 0.1) (type dot))
            (fill (type background))
            (uuid "root-circle")
        )
        (arc
            (start 40 10)
            (mid 42 8)
            (end 44 10)
            (stroke (width 0.12) (type solid))
            (fill (type none))
            (uuid "root-arc")
        )
        (bezier
            (pts (xy 50 10) (xy 52 6) (xy 56 14) (xy 58 10))
            (stroke (width 0.11) (type solid))
            (fill (type none))
            (uuid "root-bezier")
        )
        (polyline
            (pts (xy 60 10) (xy 68 10) (xy 68 16) (xy 60 16))
            (stroke (width 0.13) (type dash_dot))
            (fill (type outline))
            (uuid "root-polygon")
        )
        (polyline
            (pts (xy 70 10) (xy 74 10))
            (stroke (width 0.14) (type solid))
            (fill (type none))
            (uuid "root-line")
        )
    )`
}

/**
 * Builds a fake KiCad schematic with frames, tables, hierarchy, and an image.
 * @returns {string} KiCad schematic source.
 */
function documentGraphicsSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (text_box "Keep traces short"
            (at 10 30 0)
            (size 30 8)
            (margins 1 1 1 1)
            (stroke (width 0.1) (type solid))
            (fill (type none))
            (effects (font (size 1.2 1.2) bold) (justify left top))
            (uuid "text-box")
        )
        (table
            (column_count 2)
            (column_widths 20 30)
            (row_heights 6)
            (cells
                (table_cell "Name"
                    (at 5 50 0)
                    (size 20 6)
                    (effects (font (size 1 1)))
                    (uuid "cell-a")
                )
                (table_cell "Value"
                    (at 25 50 0)
                    (size 30 6)
                    (effects (font (size 1 1)))
                    (uuid "cell-b")
                )
            )
            (uuid "table")
        )
        (sheet
            (at 100 20)
            (size 30 15)
            (property "Sheet name" "Child")
            (property "Sheet file" "child.kicad_sch")
            (pin "IN" input
                (at 100 25 180)
                (effects (font (size 1 1)))
                (uuid "sheet-pin")
            )
            (uuid "child-sheet")
        )
        (sheet
            (at 140 20)
            (size 24 12)
            (property "Sheet name" "Monitor")
            (property "Sheet file" "monitor.kicad_sch")
            (uuid "monitor-sheet")
        )
        (image
            (at 20 20 30)
            (scale 2)
            (uuid "image")
            (data "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=")
        )
    )`
}

test('canonical parser preserves KiCad schematic shape geometry and style', () => {
    const first = Parser.parse({
        fileName: 'fixture-shapes.kicad_sch',
        data: shapeSource()
    })
    const second = Parser.parse({
        fileName: 'fixture-shapes.kicad_sch',
        data: shapeSource()
    })
    const rectangles = first.model.filter(
        (element) => element.type === 'schematic_rect'
    )
    const circle = first.model.find(
        (element) => element.type === 'schematic_circle'
    )
    const arc = first.model.find((element) => element.type === 'schematic_arc')
    const paths = first.model.filter(
        (element) => element.type === 'schematic_path'
    )
    const component = first.model.find(
        (element) => element.type === 'schematic_component'
    )
    const graphicLine = first.model.find(
        (element) =>
            element.type === 'schematic_line' &&
            element.x1 === 70 &&
            element.x2 === 74
    )

    assert.equal(rectangles.length, 2)
    assert.deepEqual(
        rectangles.map((element) => element.schematic_rect_id),
        second.model
            .filter((element) => element.type === 'schematic_rect')
            .map((element) => element.schematic_rect_id)
    )
    const rootRectangle = rectangles.find((element) => element.center.x === 15)
    const ownedRectangle = rectangles.find((element) => element.center.x === 80)
    assert.deepEqual(rootRectangle.center, { x: 15, y: 13 })
    assert.equal(rootRectangle.width, 10)
    assert.equal(rootRectangle.height, 6)
    assert.equal(rootRectangle.stroke_width, 0.15)
    assert.equal(rootRectangle.color, 'rgba(10,20,30,0.5)')
    assert.equal(rootRectangle.fill_color, 'rgba(40,50,60,0.25)')
    assert.equal(rootRectangle.is_dashed, true)
    assert.equal(rootRectangle.is_filled, true)
    assert.equal(
        ownedRectangle.schematic_component_id,
        component.schematic_component_id
    )

    assert.deepEqual(circle.center, { x: 30, y: 12 })
    assert.equal(circle.radius, 2.5)
    assert.equal(circle.stroke_width, 0.1)
    assert.equal(circle.is_dashed, true)
    assert.equal(circle.is_filled, true)

    assert.deepEqual(arc.center, { x: 42, y: 10 })
    assert.equal(arc.radius, 2)
    assert.equal(arc.start_angle_degrees, 180)
    assert.equal(arc.end_angle_degrees, 0)
    assert.equal(arc.direction, 'clockwise')
    assert.equal(arc.stroke_width, 0.12)

    assert.equal(paths.length, 2)
    const bezier = paths.find((element) => element.points.length > 4)
    const polygon = paths.find((element) => element.points.length === 4)
    assert.deepEqual(bezier.points[0], { x: 50, y: 10 })
    assert.deepEqual(bezier.points.at(-1), { x: 58, y: 10 })
    assert.equal(bezier.points.length, 25)
    assert.equal(bezier.stroke_width, 0.11)
    assert.deepEqual(polygon.points, [
        { x: 60, y: 10 },
        { x: 68, y: 10 },
        { x: 68, y: 16 },
        { x: 60, y: 16 }
    ])
    assert.equal(polygon.is_dashed, true)
    assert.equal(polygon.is_filled, true)
    assert.ok(graphicLine)
    assert.equal(graphicLine.stroke_width, 0.14)
    assert.equal(
        first.model.some(
            (element) =>
                element.type === 'source_net' && element.name === 'UnknownNet0'
        ),
        false
    )
})

test('canonical parser preserves KiCad schematic document graphics', () => {
    const input = {
        fileName: 'fixture-document-graphics.kicad_sch',
        data: documentGraphicsSource()
    }
    const document = Parser.parse(input)
    const fullDocument = Parser.parse(input, { decodeAssets: 'full' })
    const textBox = document.model.find(
        (element) =>
            element.type === 'schematic_rect' && element.center.x === 25
    )
    const text = document.model.find(
        (element) =>
            element.type === 'schematic_text' &&
            element.text === 'Keep traces short'
    )
    const table = document.model.find(
        (element) => element.type === 'schematic_table'
    )
    const cells = document.model.filter(
        (element) => element.type === 'schematic_table_cell'
    )
    const sheetSymbols = document.model.filter(
        (element) => element.type === 'schematic_sheet_symbol'
    )
    const sheet = sheetSymbols.find((element) => element.name === 'Child')
    const sheetPort = document.model.find(
        (element) =>
            element.type === 'schematic_port' &&
            element.display_pin_label === 'IN'
    )
    const image = document.model.find(
        (element) => element.type === 'schematic_image'
    )

    assert.ok(textBox)
    assert.ok(text)
    assert.ok(table)
    assert.equal(cells.length, 2)
    assert.ok(sheet)
    assert.equal(sheetSymbols.length, 2)
    assert.ok(sheetPort)
    assert.ok(image)
    assert.deepEqual(textBox.center, { x: 25, y: 34 })
    assert.equal(textBox.width, 30)
    assert.equal(textBox.height, 8)
    assert.equal(textBox.stroke_width, 0.1)
    assert.equal(text.position.x, 11)
    assert.equal(text.position.y, 31)
    assert.equal(text.anchor, 'top_left')
    assert.equal(text.font_size, 1.2)

    assert.deepEqual(table.anchor_position, { x: 5, y: 50 })
    assert.deepEqual(table.column_widths, [20, 30])
    assert.deepEqual(table.row_heights, [6])
    assert.deepEqual(
        cells.map((cell) => ({
            text: cell.text,
            center: cell.center,
            startColumn: cell.start_column_index,
            endColumn: cell.end_column_index
        })),
        [
            {
                text: 'Name',
                center: { x: 15, y: 53 },
                startColumn: 0,
                endColumn: 0
            },
            {
                text: 'Value',
                center: { x: 40, y: 53 },
                startColumn: 1,
                endColumn: 1
            }
        ]
    )
    assert.deepEqual(sheet.center, { x: 115, y: 27.5 })
    assert.equal(sheet.width, 30)
    assert.equal(sheet.height, 15)
    assert.equal(sheet.source_file_name, 'child.kicad_sch')
    assert.equal(
        sheetPort.schematic_sheet_symbol_id,
        sheet.schematic_sheet_symbol_id
    )
    assert.equal(sheetPort.side_of_component, 'left')
    assert.equal(
        document.model.some((element) => element.type === 'schematic_sheet'),
        false
    )

    assert.deepEqual(image.center, { x: 21, y: 21 })
    assert.deepEqual(image.size, { width: 2, height: 2 })
    assert.equal(image.rotation, 30)
    assert.equal(image.opacity, 1)
    assert.equal(image.preserve_aspect_ratio, true)
    assert.equal(image.render_order, 0)
    assert.equal(image.source_name, 'image.png')
    assert.equal(Object.hasOwn(image, 'data'), false)
    const fullAsset = fullDocument.assets.find(
        (asset) => asset.id === image.asset_id
    )
    const metadataAsset = document.assets.find(
        (asset) => asset.id === image.asset_id
    )
    const expectedBytes = Uint8Array.from(
        Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
            'base64'
        )
    )
    assert.equal(fullAsset.kind, 'schematic-image')
    assert.equal(fullAsset.name, 'image.png')
    assert.equal(fullAsset.mediaType, 'image/png')
    assert.deepEqual(fullAsset.data, expectedBytes)
    assert.equal(metadataAsset.byteLength, expectedBytes.byteLength)
    assert.equal(metadataAsset.data, null)
    assert.equal(
        document.diagnostics.some(
            (diagnostic) => diagnostic.code === 'kicad.schematic.image.invalid'
        ),
        false
    )
    const svg = SchematicSvgRenderer.render(fullDocument)
    assert.equal(svg.includes('Child'), true)
    assert.equal(svg.includes('Monitor'), true)
    assert.equal(svg.includes('Keep traces short'), true)
    assert.equal(svg.includes('class="schematic-image"'), true)
    assert.equal(svg.includes('schematic-image-placeholder'), false)
})

test('artwork lines never acquire electrical semantics from net-like metadata', () => {
    const model = CircuitJsonModelAdapter.fromRendererModel({
        fileName: 'artwork-metadata.kicad_sch',
        kind: 'schematic',
        schematic: {
            lines: [
                {
                    sourceType: 'polyline',
                    kind: 'wire',
                    netName: 'ARTWORK_NET',
                    netIndex: 7,
                    x1: 1,
                    y1: 2,
                    x2: 3,
                    y2: 4,
                    width: 0.2
                }
            ],
            ellipses: [
                {
                    x: 10,
                    y: 10,
                    radiusX: 3,
                    radiusY: 2,
                    fill: 'none'
                }
            ]
        }
    })

    assert.equal(
        model.filter((element) => element.type === 'schematic_line').length,
        1
    )
    assert.equal(
        model.some((element) => element.type === 'source_trace'),
        false
    )
    assert.equal(
        model.some((element) => element.type === 'schematic_trace'),
        false
    )
    assert.equal(
        model.some(
            (element) =>
                element.type === 'source_net' &&
                (element.name === 'ARTWORK_NET' ||
                    element.name === 'UnknownNet7')
        ),
        false
    )
    const ellipse = model.find(
        (element) =>
            element.type === 'schematic_path' &&
            element.schematic_path_id.includes('schematic_ellipse')
    )
    assert.equal(ellipse.points.length, 48)
    assert.notDeepEqual(ellipse.points[0], ellipse.points.at(-1))
})
