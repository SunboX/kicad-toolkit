// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const defaultInkColor = '#1f2430'
const defaultAccentColor = '#0f6b7a'
const defaultFillColor = 'none'

/**
 * Parses KiCad schematic graphical, metadata, and non-symbol item families.
 */
export class KicadSchematicGraphicParser {
    /**
     * Parses graphical and metadata item families from a schematic root.
     * @param {Array} root Schematic root.
     * @returns {object}
     */
    static parse(root) {
        const shapes = parseRootShapes(root)
        return {
            busEntries: children(root, 'bus_entry').map(parseBusEntry),
            busAliases: children(root, 'bus_alias').map(parseBusAlias),
            images: children(root, 'image').map(parseImage),
            directives: children(root, 'directive_label').map((node, index) =>
                parseDirective(node, index)
            ),
            graphicalTexts: children(root, 'text').map((node, index) =>
                parseGraphicalText(node, index)
            ),
            textBoxes: children(root, 'text_box').map((node, index) =>
                parseTextBox(node, index)
            ),
            tables: children(root, 'table').map(parseTable),
            sheetInstances: parseInstances(child(root, 'sheet_instances')),
            symbolInstances: parseInstances(child(root, 'symbol_instances')),
            embeddedFonts: parseEmbeddedFonts(child(root, 'embedded_fonts')),
            embeddedFiles: parseEmbeddedFiles(child(root, 'embedded_files')),
            ...shapes
        }
    }
}

/**
 * Parses root-level schematic shapes.
 * @param {Array} root Schematic root.
 * @returns {object}
 */
function parseRootShapes(root) {
    const polylineShapes = children(root, 'polyline').map((node, index) =>
        parsePolylineShape(node, index)
    )
    return {
        lines: polylineShapes.flatMap((shape) => shape.lines),
        polygons: polylineShapes.flatMap((shape) => shape.polygons),
        arcs: children(root, 'arc').map((node, index) => parseArc(node, index)),
        ellipses: children(root, 'circle').map((node, index) =>
            parseCircle(node, index)
        ),
        rectangles: children(root, 'rectangle').map((node, index) =>
            parseRectangle(node, index)
        ),
        beziers: children(root, 'bezier').map((node, index) =>
            parseBezier(node, index)
        ),
        regions: children(root, 'rule_area').map((node, index) =>
            parseRuleArea(node, index)
        )
    }
}

/**
 * Parses a schematic bus entry.
 * @param {Array} node Bus entry node.
 * @returns {object}
 */
function parseBusEntry(node) {
    const at = parseAt(child(node, 'at'))
    const size = parseSize(child(node, 'size'), { width: 2.54, height: -2.54 })
    return {
        x: at.x,
        y: at.y,
        x1: at.x,
        y1: at.y,
        x2: at.x + size.width,
        y2: at.y + size.height,
        width: strokeWidth(node),
        color: defaultAccentColor,
        uuid: textValue(child(node, 'uuid'))
    }
}

/**
 * Parses a KiCad bus alias.
 * @param {Array} node Bus alias node.
 * @returns {{ name: string, members: string[] }}
 */
function parseBusAlias(node) {
    return {
        name: String(node[1] || ''),
        members: (child(node, 'members') || []).slice(1).map(String)
    }
}

/**
 * Parses a schematic image.
 * @param {Array} node Image node.
 * @returns {object}
 */
function parseImage(node) {
    const at = parseAt(child(node, 'at'))
    return {
        x: at.x,
        y: at.y,
        scale: numberValue(child(node, 'scale')?.[1], 1),
        data: String(child(node, 'data')?.[1] || ''),
        uuid: textValue(child(node, 'uuid')),
        sourceType: 'image'
    }
}

/**
 * Parses a directive label.
 * @param {Array} node Directive node.
 * @param {number} index Render index.
 * @returns {object}
 */
function parseDirective(node, index) {
    const text = parseTextLike(node, index, 'directive')
    return {
        ...text,
        length: numberValue(child(node, 'length')?.[1], 0),
        shape: textValue(child(node, 'shape')) || '',
        sourceType: 'directive_label'
    }
}

/**
 * Parses graphical schematic text.
 * @param {Array} node Text node.
 * @param {number} index Render index.
 * @returns {object}
 */
function parseGraphicalText(node, index) {
    return {
        ...parseTextLike(node, index, 'text'),
        sourceType: 'text'
    }
}

/**
 * Parses a text-like node.
 * @param {Array} node Text-like node.
 * @param {number} index Render index.
 * @param {string} kind Text kind.
 * @returns {object}
 */
function parseTextLike(node, index, kind) {
    const at = parseAt(child(node, 'at'))
    const font = parseTextFont(node)
    return {
        x: at.x,
        y: at.y,
        text: String(node[1] || ''),
        value: String(node[1] || ''),
        color: defaultInkColor,
        recordType: kind === 'directive' ? 'directive' : 'text',
        labelKind: kind,
        fontSize: font.size,
        font,
        rotation: at.rotation,
        renderOrder: index,
        uuid: textValue(child(node, 'uuid'))
    }
}

/**
 * Parses a schematic text box.
 * @param {Array} node Text box node.
 * @param {number} index Render index.
 * @returns {object}
 */
function parseTextBox(node, index) {
    const box = parseTextBoxContent(node)
    return {
        ...box,
        sourceType: 'text_box',
        renderOrder: index
    }
}

/**
 * Parses shared text box or table cell content.
 * @param {Array} node Text box node.
 * @returns {object}
 */
function parseTextBoxContent(node) {
    const at = parseAt(child(node, 'at') || child(node, 'start'))
    const size = parseSize(
        child(node, 'size'),
        sizeFromEnd(at, child(node, 'end'))
    )
    return {
        x: at.x,
        y: at.y,
        width: size.width,
        height: size.height,
        rotation: at.rotation,
        text: String(node[1] || ''),
        value: String(node[1] || ''),
        fontSize: parseTextFont(node).size,
        font: parseTextFont(node),
        margins: parseMargins(child(node, 'margins')),
        lineWidth: strokeWidth(node),
        fill: fillType(node),
        uuid: textValue(child(node, 'uuid'))
    }
}

/**
 * Parses a table.
 * @param {Array} node Table node.
 * @returns {object}
 */
function parseTable(node) {
    return {
        columnCount: numberValue(child(node, 'column_count')?.[1], 0),
        columnWidths: numberList(child(node, 'column_widths')),
        rowHeights: numberList(child(node, 'row_heights')),
        cells: children(child(node, 'cells'), 'table_cell').map((cell) => ({
            ...parseTextBoxContent(cell),
            colSpan: numberValue(child(cell, 'span')?.[1], 1),
            rowSpan: numberValue(child(cell, 'span')?.[2], 1)
        })),
        uuid: textValue(child(node, 'uuid')),
        sourceType: 'table'
    }
}

/**
 * Parses a root schematic polyline.
 * @param {Array} node Polyline node.
 * @param {number} index Render index.
 * @returns {{ lines: object[], polygons: object[] }}
 */
function parsePolylineShape(node, index) {
    const points = parsePoints(child(node, 'pts'))
    if (points.length <= 2) {
        return {
            lines: points.slice(0, -1).map((point, pointIndex) => ({
                x1: point.x,
                y1: point.y,
                x2: points[pointIndex + 1].x,
                y2: points[pointIndex + 1].y,
                color: defaultInkColor,
                width: strokeWidth(node),
                sourceType: 'polyline',
                renderOrder: index * 100 + pointIndex
            })),
            polygons: []
        }
    }
    return {
        lines: [],
        polygons: [
            {
                points,
                color: defaultInkColor,
                fill: fillType(node),
                isSolid: fillType(node) !== 'none',
                transparent: fillType(node) === 'none',
                lineWidth: strokeWidth(node),
                sourceType: 'polyline',
                renderOrder: index
            }
        ]
    }
}

/**
 * Parses a schematic arc.
 * @param {Array} node Arc node.
 * @param {number} index Render index.
 * @returns {object}
 */
function parseArc(node, index) {
    return {
        type: 'arc',
        sourceType: 'arc',
        start: localPoint(child(node, 'start')),
        mid: localPoint(child(node, 'mid')),
        end: localPoint(child(node, 'end')),
        color: defaultInkColor,
        width: strokeWidth(node),
        fill: fillType(node),
        uuid: textValue(child(node, 'uuid')),
        renderOrder: index
    }
}

/**
 * Parses a schematic circle.
 * @param {Array} node Circle node.
 * @param {number} index Render index.
 * @returns {object}
 */
function parseCircle(node, index) {
    const center = localPoint(child(node, 'center'))
    const radius = numberValue(child(node, 'radius')?.[1], 1)
    return {
        x: center.x,
        y: center.y,
        radiusX: radius,
        radiusY: radius,
        color: defaultInkColor,
        fill: fillType(node),
        lineWidth: strokeWidth(node),
        sourceType: 'circle',
        uuid: textValue(child(node, 'uuid')),
        renderOrder: index
    }
}

/**
 * Parses a schematic rectangle.
 * @param {Array} node Rectangle node.
 * @param {number} index Render index.
 * @returns {object}
 */
function parseRectangle(node, index) {
    const start = localPoint(child(node, 'start'))
    const end = localPoint(child(node, 'end'))
    return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
        radius: numberValue(child(node, 'radius')?.[1], 0),
        color: defaultInkColor,
        fill: fillType(node),
        lineWidth: strokeWidth(node),
        sourceType: 'rectangle',
        uuid: textValue(child(node, 'uuid')),
        renderOrder: index
    }
}

/**
 * Parses a schematic Bezier.
 * @param {Array} node Bezier node.
 * @param {number} index Render index.
 * @returns {object}
 */
function parseBezier(node, index) {
    return {
        type: 'bezier',
        sourceType: 'bezier',
        points: parsePoints(child(node, 'pts')),
        color: defaultInkColor,
        width: strokeWidth(node),
        fill: fillType(node),
        uuid: textValue(child(node, 'uuid')),
        renderOrder: index
    }
}

/**
 * Parses a schematic rule area.
 * @param {Array} node Rule area node.
 * @param {number} index Render index.
 * @returns {object}
 */
function parseRuleArea(node, index) {
    const polyline = child(node, 'polyline')
    return {
        points: parsePoints(child(polyline, 'pts')),
        color: defaultInkColor,
        fill: fillType(polyline),
        lineWidth: strokeWidth(polyline),
        excludeFromSim: booleanValue(
            child(node, 'exclude_from_sim')?.[1],
            false
        ),
        inBom: booleanValue(child(node, 'in_bom')?.[1], true),
        onBoard: booleanValue(child(node, 'on_board')?.[1], true),
        doNotPopulate: booleanValue(child(node, 'dnp')?.[1], false),
        uuid:
            textValue(child(node, 'uuid')) ||
            textValue(child(polyline, 'uuid')),
        sourceType: 'rule_area',
        renderOrder: index
    }
}

/**
 * Parses sheet or symbol instance paths.
 * @param {Array | undefined} node Instance parent node.
 * @returns {object[]}
 */
function parseInstances(node) {
    return children(node, 'path').map((pathNode) => {
        const result = { path: String(pathNode[1] || '') }
        for (const entry of children(pathNode)) {
            result[camelCase(String(entry[0] || ''))] =
                entry[1] === undefined ? '' : entry[1]
        }
        return result
    })
}

/**
 * Parses embedded font flag.
 * @param {Array | undefined} node Embedded fonts node.
 * @returns {boolean}
 */
function parseEmbeddedFonts(node) {
    return booleanValue(node?.[1], false)
}

/**
 * Parses embedded files.
 * @param {Array | undefined} node Embedded files node.
 * @returns {object[]}
 */
function parseEmbeddedFiles(node) {
    return children(node, 'file').map((fileNode) => ({
        name: String(fileNode[1] || ''),
        data: String(child(fileNode, 'data')?.[1] || '')
    }))
}

/**
 * Parses a text font.
 * @param {Array} node Text node.
 * @returns {object}
 */
function parseTextFont(node) {
    const effects = child(node, 'effects')
    const font = child(effects, 'font')
    const size = child(font, 'size') || ['size', 1.27, 1.27]
    const justify = child(effects, 'justify') || []
    return {
        size: numberValue(size[2], numberValue(size[1], 1.27)),
        width: numberValue(size[1], 1.27),
        height: numberValue(size[2], numberValue(size[1], 1.27)),
        face: textValue(child(font, 'face')),
        bold: hasScalar(font, 'bold'),
        italic: hasScalar(font, 'italic'),
        hAlign: firstJustify(justify, ['left', 'center', 'right']) || 'left',
        vAlign: firstJustify(justify, ['top', 'center', 'bottom']) || 'bottom'
    }
}

/**
 * Parses a size node.
 * @param {Array | undefined} node Size node.
 * @param {{ width: number, height: number }} fallback Fallback size.
 * @returns {{ width: number, height: number }}
 */
function parseSize(node, fallback) {
    return {
        width: numberValue(node?.[1], fallback.width),
        height: numberValue(node?.[2], fallback.height)
    }
}

/**
 * Resolves a size from legacy end coordinate.
 * @param {{ x: number, y: number }} at Start point.
 * @param {Array | undefined} end End node.
 * @returns {{ width: number, height: number }}
 */
function sizeFromEnd(at, end) {
    if (!end) return { width: 1, height: 1 }
    return {
        width: Math.abs(numberValue(end[1], at.x) - at.x),
        height: Math.abs(numberValue(end[2], at.y) - at.y)
    }
}

/**
 * Parses an at node.
 * @param {Array | undefined} node At node.
 * @returns {{ x: number, y: number, rotation: number }}
 */
function parseAt(node) {
    return {
        x: numberValue(node?.[1], 0),
        y: numberValue(node?.[2], 0),
        rotation: numberValue(node?.[3], 0)
    }
}

/**
 * Parses point list.
 * @param {Array | undefined} node Points node.
 * @returns {{ x: number, y: number }[]}
 */
function parsePoints(node) {
    return children(node, 'xy').map((entry) => ({
        x: numberValue(entry[1], 0),
        y: numberValue(entry[2], 0)
    }))
}

/**
 * Parses local point node.
 * @param {Array | undefined} node Point node.
 * @returns {{ x: number, y: number }}
 */
function localPoint(node) {
    return {
        x: numberValue(node?.[1], 0),
        y: numberValue(node?.[2], 0)
    }
}

/**
 * Parses primitive stroke width.
 * @param {Array | undefined} node Node.
 * @returns {number}
 */
function strokeWidth(node) {
    return numberValue(child(child(node, 'stroke'), 'width')?.[1], 0.15)
}

/**
 * Parses fill type.
 * @param {Array | undefined} node Node.
 * @returns {string}
 */
function fillType(node) {
    return textValue(child(child(node, 'fill'), 'type')) || defaultFillColor
}

/**
 * Parses margins.
 * @param {Array | undefined} node Margins node.
 * @returns {{ left: number, top: number, right: number, bottom: number }}
 */
function parseMargins(node) {
    return {
        left: numberValue(node?.[1], 0),
        top: numberValue(node?.[2], 0),
        right: numberValue(node?.[3], 0),
        bottom: numberValue(node?.[4], 0)
    }
}

/**
 * Parses scalar numeric values.
 * @param {Array | undefined} node Node.
 * @returns {number[]}
 */
function numberList(node) {
    return (node || [])
        .slice(1)
        .filter((value) => !Array.isArray(value))
        .map((value) => numberValue(value, 0))
}

/**
 * Finds a justify token.
 * @param {Array} node Justify node.
 * @param {string[]} values Candidate values.
 * @returns {string}
 */
function firstJustify(node, values) {
    return (node || [])
        .slice(1)
        .map(String)
        .find((value) => values.includes(value))
}

/**
 * Checks whether a node contains a scalar token.
 * @param {Array | undefined} node Node.
 * @param {string} name Token name.
 * @returns {boolean}
 */
function hasScalar(node, name) {
    return (node || []).slice(1).some((value) => String(value) === name)
}

/**
 * Converts snake_case to camelCase.
 * @param {string} value Value.
 * @returns {string}
 */
function camelCase(value) {
    return value.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * Finds direct child nodes.
 * @param {Array | undefined} node Parent node.
 * @param {string} [name] Optional child name.
 * @returns {Array[]}
 */
function children(node, name) {
    if (!Array.isArray(node)) return []
    return node.filter((entry) => {
        return Array.isArray(entry) && (!name || entry[0] === name)
    })
}

/**
 * Finds the first named direct child.
 * @param {Array | undefined} node Parent node.
 * @param {string} name Child name.
 * @returns {Array | undefined}
 */
function child(node, name) {
    return children(node, name)[0]
}

/**
 * Reads text value from a simple node.
 * @param {Array | undefined} node Node.
 * @returns {string}
 */
function textValue(node) {
    return String(node?.[1] || '')
}

/**
 * Reads a number with fallback.
 * @param {unknown} value Value.
 * @param {number} fallback Fallback.
 * @returns {number}
 */
function numberValue(value, fallback) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Reads a KiCad boolean with fallback.
 * @param {unknown} value Value.
 * @param {boolean} fallback Fallback.
 * @returns {boolean}
 */
function booleanValue(value, fallback) {
    if (value === true || value === 'yes' || value === 1 || value === '1') {
        return true
    }
    if (value === false || value === 'no' || value === 0 || value === '0') {
        return false
    }
    return fallback
}
