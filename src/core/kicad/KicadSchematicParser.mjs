// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { Geometry } from './Geometry.mjs'
import { groupSchematicBomRows } from './KicadBomUtils.mjs'
import { KicadSchematicGraphicParser } from './KicadSchematicGraphicParser.mjs'
import { KicadSchematicSymbolParser } from './KicadSchematicSymbolParser.mjs'
import { NormalizedModelSchema } from './NormalizedModelSchema.mjs'
import { SExpressionParser } from './SExpressionParser.mjs'

const defaultInkColor = '#1f2430'
const defaultAccentColor = '#0f6b7a'

/**
 * Parses KiCad schematic S-expressions into ECAD Forge schematic models.
 */
export class KicadSchematicParser {
    /**
     * Parses one KiCad schematic source string.
     * @param {string} source KiCad schematic source.
     * @param {{ fileName?: string }} [options] Parser options.
     * @returns {object}
     */
    static parse(source, options = {}) {
        const root = SExpressionParser.parse(source)
        if (!isNode(root, 'kicad_sch')) {
            throw new Error('Expected kicad_sch root')
        }

        const fileName = String(options.fileName || '')
        const sheet = parseSheetMetadata(root)
        const librarySymbols = parseLibrarySymbols(child(root, 'lib_symbols'))
        const graphicItems = KicadSchematicGraphicParser.parse(root)
        const wires = parseLineNodes(root, 'wire', false)
        const buses = parseLineNodes(root, 'bus', true)
        const labels = [
            ...parseLabels(root, 'label', 'local'),
            ...parseLabels(root, 'global_label', 'global'),
            ...parseLabels(root, 'hierarchical_label', 'hierarchical')
        ]
        const junctions = children(root, 'junction').map(parseJunction)
        const crosses = children(root, 'no_connect').map(parseNoConnect)
        const sheets = children(root, 'sheet').map((node, index) =>
            parseHierarchicalSheet(node, index)
        )
        const symbols = children(root, 'symbol').map((node, index) =>
            parseSchematicSymbol(node, index, librarySymbols)
        )
        const symbolPrimitives = symbols.map((symbol) => symbol.primitives)
        const components = symbols.flatMap((symbol) => symbol.component)
        const pins = symbols.flatMap((symbol) => symbol.pins)
        const propertyTexts = symbols.flatMap((symbol) => symbol.texts)
        const lines = [
            ...wires,
            ...buses,
            ...graphicItems.lines,
            ...symbolPrimitives.flatMap((primitive) => primitive.lines)
        ]
        const texts = [
            ...labels.map((label) => label.text),
            ...graphicItems.graphicalTexts,
            ...propertyTexts
        ]
        const rectangles = [
            ...graphicItems.rectangles,
            ...symbolPrimitives.flatMap((primitive) => primitive.rectangles)
        ]
        const ellipses = [
            ...graphicItems.ellipses,
            ...symbolPrimitives.flatMap((primitive) => primitive.ellipses)
        ]
        const arcs = [
            ...graphicItems.arcs,
            ...symbolPrimitives.flatMap((primitive) => primitive.arcs)
        ]
        const polygons = [
            ...graphicItems.polygons,
            ...symbolPrimitives.flatMap((primitive) => primitive.polygons)
        ]
        const beziers = [
            ...graphicItems.beziers,
            ...symbolPrimitives.flatMap((primitive) => primitive.beziers)
        ]
        const sheetSymbols = sheets.map((entry) => entry.symbol)
        const sheetEntries = sheets.flatMap((entry) => entry.entries)
        const { nets, diagnostics: netDiagnostics } = buildSingleSheetNets({
            lines,
            texts,
            pins,
            junctions,
            sheetEntries
        })
        const bom = groupSchematicBomRows(components)
        const diagnostics = [
            {
                severity: 'info',
                message:
                    'Recovered ' +
                    components.length +
                    ' KiCad schematic symbols.'
            },
            ...symbols.flatMap((symbol) => symbol.diagnostics),
            ...netDiagnostics
        ]

        return NormalizedModelSchema.attach({
            sourceFormat: 'kicad',
            kind: 'schematic',
            fileType: 'kicad_sch',
            fileName,
            summary: {
                title: sheet.title || stripExtension(fileName),
                componentCount: components.length,
                lineCount: lines.filter((line) => !line.ownerIndex).length,
                textCount: texts.length,
                bomRowCount: bom.length
            },
            diagnostics,
            schematic: {
                sheet,
                lines,
                polygons,
                rectangles,
                regions: graphicItems.regions,
                ellipses,
                arcs,
                beziers,
                directives: graphicItems.directives,
                texts,
                components,
                pins,
                ports: [],
                crosses,
                sheetSymbols,
                sheetEntries,
                junctions,
                busEntries: graphicItems.busEntries,
                busAliases: graphicItems.busAliases,
                textBoxes: graphicItems.textBoxes,
                tables: graphicItems.tables,
                images: graphicItems.images,
                sheetInstances: graphicItems.sheetInstances,
                symbolInstances: graphicItems.symbolInstances,
                embeddedFonts: graphicItems.embeddedFonts,
                embeddedFiles: graphicItems.embeddedFiles,
                nets,
                kicadAst: root
            },
            bom
        })
    }
}

/**
 * Parses page and title metadata.
 * @param {Array} root Schematic root.
 * @returns {object}
 */
function parseSheetMetadata(root) {
    const paper = textValue(child(root, 'paper')) || 'A4'
    const titleBlock = child(root, 'title_block')
    const size = pageSizeForPaper(paper)
    const comments = parseTitleBlockComments(titleBlock)
    return {
        width: size.width,
        height: size.height,
        sourceWidth: size.width,
        sourceHeight: size.height,
        paperSize: paper,
        visibleGrid: 2.54,
        snapGrid: 1.27,
        borderOn: true,
        titleBlockOn: true,
        marginWidth: 5,
        xZones: 6,
        yZones: 4,
        fonts: {},
        title: textValue(child(titleBlock, 'title')) || '',
        titleBlock: {
            title: textValue(child(titleBlock, 'title')) || '',
            revision: textValue(child(titleBlock, 'rev')) || '',
            documentNumber: textValue(child(titleBlock, 'company')) || '',
            sheetNumber: '',
            sheetTotal: '',
            date: textValue(child(titleBlock, 'date')) || '',
            drawnBy: comments.get('1') || '',
            comments: Object.fromEntries(comments)
        }
    }
}

/**
 * Parses KiCad title-block comments by index.
 * @param {Array | undefined} titleBlock Title block node.
 * @returns {Map<string, string>}
 */
function parseTitleBlockComments(titleBlock) {
    const comments = new Map()
    for (const entry of children(titleBlock, 'comment')) {
        comments.set(String(entry[1] || ''), String(entry[2] || ''))
    }
    return comments
}

/**
 * Resolves a KiCad paper name to millimeter dimensions.
 * @param {string} paper Paper token.
 * @returns {{ width: number, height: number }}
 */
function pageSizeForPaper(paper) {
    const normalized = String(paper || '').toUpperCase()
    const sizes = {
        A5: { width: 210, height: 148 },
        A4: { width: 297, height: 210 },
        A3: { width: 420, height: 297 },
        A2: { width: 594, height: 420 },
        A1: { width: 841, height: 594 },
        A0: { width: 1189, height: 841 },
        LETTER: { width: 279.4, height: 215.9 },
        LEGAL: { width: 355.6, height: 215.9 }
    }
    return sizes[normalized] || sizes.A4
}

/**
 * Parses embedded schematic library symbols by library id.
 * @param {Array | undefined} node lib_symbols node.
 * @returns {Map<string, Array>}
 */
function parseLibrarySymbols(node) {
    const symbols = new Map()
    for (const symbol of children(node, 'symbol')) {
        symbols.set(String(symbol[1] || ''), symbol)
    }
    return symbols
}

/**
 * Parses wire or bus nodes into line segments.
 * @param {Array} root Schematic root.
 * @param {string} name Node name.
 * @param {boolean} isBus Whether parsed lines are buses.
 * @returns {object[]}
 */
function parseLineNodes(root, name, isBus) {
    return children(root, name).flatMap((node, nodeIndex) => {
        const points = parsePoints(child(node, 'pts'))
        const width = numberValue(
            child(child(node, 'stroke'), 'width')?.[1],
            0.15
        )
        const lines = []
        for (let index = 0; index < points.length - 1; index += 1) {
            lines.push({
                x1: points[index].x,
                y1: points[index].y,
                x2: points[index + 1].x,
                y2: points[index + 1].y,
                color: isBus ? defaultAccentColor : defaultInkColor,
                width,
                isBus,
                sourceType: name,
                renderOrder: nodeIndex * 100 + index
            })
        }
        return lines
    })
}

/**
 * Parses label-like schematic nodes.
 * @param {Array} root Schematic root.
 * @param {string} nodeName Label node name.
 * @param {string} labelKind Logical label kind.
 * @returns {{ text: object, kind: string }[]}
 */
function parseLabels(root, nodeName, labelKind) {
    return children(root, nodeName).map((node, index) => {
        const at = parseAt(child(node, 'at'))
        const font = parseTextFont(node)
        const text = {
            x: at.x,
            y: at.y,
            text: String(node[1] || ''),
            value: String(node[1] || ''),
            color: defaultInkColor,
            recordType: '25',
            labelKind,
            shape: textValue(child(node, 'shape')) || '',
            fontSize: font.size,
            font,
            rotation: at.rotation,
            anchor:
                font.hAlign === 'right'
                    ? 'end'
                    : font.hAlign === 'center'
                      ? 'middle'
                      : 'start',
            vAlign: font.vAlign,
            renderOrder: index
        }
        return { text, kind: labelKind }
    })
}

/**
 * Parses one junction node.
 * @param {Array} node Junction node.
 * @returns {object}
 */
function parseJunction(node) {
    const at = parseAt(child(node, 'at'))
    return {
        x: at.x,
        y: at.y,
        diameter: numberValue(child(node, 'diameter')?.[1], 0.9),
        color: defaultInkColor
    }
}

/**
 * Parses one no-connect marker.
 * @param {Array} node No-connect node.
 * @returns {object}
 */
function parseNoConnect(node) {
    const at = parseAt(child(node, 'at'))
    return {
        x: at.x,
        y: at.y,
        size: 1.5,
        color: defaultAccentColor
    }
}

/**
 * Parses a hierarchical sheet node.
 * @param {Array} node Sheet node.
 * @param {number} index Sheet index.
 * @returns {{ symbol: object, entries: object[] }}
 */
function parseHierarchicalSheet(node, index) {
    const at = parseAt(child(node, 'at'))
    const size = child(node, 'size') || ['size', 20, 12]
    const properties = parseProperties(node)
    const sheetFile = properties.get('Sheet file')?.value || ''
    const sheetName =
        properties.get('Sheet name')?.value || `Sheet ${index + 1}`
    const ownerIndex = textValue(child(node, 'uuid')) || `sheet:${index}`
    const symbol = {
        x: at.x,
        y: at.y,
        width: numberValue(size[1], 20),
        height: numberValue(size[2], 12),
        name: sheetName,
        fileName: sheetFile,
        ownerIndex,
        color: defaultInkColor,
        fill: '#f8fafc'
    }
    const entries = children(node, 'pin').map((pinNode, pinIndex) => {
        const pinAt = parseAt(child(pinNode, 'at'))
        return {
            x: pinAt.x,
            y: pinAt.y,
            name: String(pinNode[1] || ''),
            side: sheetEntrySide(pinAt, symbol),
            sheetFile,
            sheetName,
            ownerIndex,
            kind: String(pinNode[2] || ''),
            id:
                textValue(child(pinNode, 'uuid')) ||
                `${ownerIndex}:pin:${pinIndex}`
        }
    })
    return { symbol, entries }
}

/**
 * Resolves a sheet pin side from placement.
 * @param {{ x: number, y: number }} pinAt Pin position.
 * @param {{ x: number, y: number, width: number, height: number }} sheet Sheet.
 * @returns {string}
 */
function sheetEntrySide(pinAt, sheet) {
    const leftDistance = Math.abs(pinAt.x - sheet.x)
    const rightDistance = Math.abs(pinAt.x - (sheet.x + sheet.width))
    const topDistance = Math.abs(pinAt.y - sheet.y)
    const bottomDistance = Math.abs(pinAt.y - (sheet.y + sheet.height))
    const min = Math.min(
        leftDistance,
        rightDistance,
        topDistance,
        bottomDistance
    )
    if (min === leftDistance) return 'left'
    if (min === rightDistance) return 'right'
    if (min === topDistance) return 'top'
    return 'bottom'
}

/**
 * Parses one placed schematic symbol.
 * @param {Array} node Symbol instance node.
 * @param {number} index Symbol index.
 * @param {Map<string, Array>} librarySymbols Embedded symbols.
 * @returns {object}
 */
function parseSchematicSymbol(node, index, librarySymbols) {
    const libId = symbolLibId(node)
    const at = parseAt(child(node, 'at'))
    const uuid = textValue(child(node, 'uuid')) || `symbol:${index}`
    const properties = parseProperties(node)
    const designator = properties.get('Reference')?.value || `U${index + 1}`
    const value = properties.get('Value')?.value || ''
    const footprint = properties.get('Footprint')?.value || ''
    const librarySymbol = librarySymbols.get(libId)
    const unit = numberValue(child(node, 'unit')?.[1], 1)
    const convert = numberValue(
        child(node, 'convert')?.[1] || child(node, 'body_style')?.[1],
        1
    )
    const mirror = textValue(child(node, 'mirror'))
    const diagnostics = []
    if (!librarySymbol) {
        diagnostics.push({
            severity: 'warning',
            message: 'Embedded library symbol was not found for ' + libId + '.'
        })
    }

    const transform = {
        x: at.x,
        y: at.y,
        rotation: at.rotation,
        mirror
    }
    const selection = { unit, convert }
    const primitives = KicadSchematicSymbolParser.parsePrimitives(
        librarySymbol,
        uuid,
        transform,
        selection
    )
    const pins = KicadSchematicSymbolParser.parsePins(
        librarySymbol,
        uuid,
        {
            ...transform,
            endpointVisible: hasConnectorPinEndpointMarkers(libId)
        },
        selection
    )
    const texts = parseSymbolPropertyTexts(properties, uuid, {
        mirror,
        rotation: at.rotation,
        powerSymbol: isPowerSymbol(librarySymbol, libId)
    })
    const component = {
        ownerIndex: uuid,
        designator,
        value,
        x: at.x,
        y: at.y,
        source: libId,
        pattern: footprint || libId,
        description: value,
        footprint,
        unit,
        convert,
        mirror,
        excludeFromBom: hasChild(node, 'exclude_from_bom')
    }

    return {
        component: component.excludeFromBom ? [] : [component],
        diagnostics,
        pins,
        primitives,
        texts
    }
}

/**
 * Resolves a symbol library id from current and legacy schematic syntax.
 * @param {Array} node Symbol node.
 * @returns {string}
 */
function symbolLibId(node) {
    const libId = textValue(child(node, 'lib_id'))
    if (libId) return libId

    return Array.isArray(node[1]) ? '' : String(node[1] || '')
}

/**
 * Checks whether a placed symbol is a KiCad power symbol.
 * @param {Array | undefined} librarySymbol Library symbol node.
 * @param {string} libId Library id.
 * @returns {boolean}
 */
function isPowerSymbol(librarySymbol, libId) {
    return (
        String(libId || '').startsWith('power:') ||
        hasChild(librarySymbol, 'power')
    )
}

/**
 * Checks whether a symbol family displays circular connector pin endpoints.
 * @param {string} libId Symbol library id.
 * @returns {boolean}
 */
function hasConnectorPinEndpointMarkers(libId) {
    return /^Connector_Generic:Conn_/u.test(String(libId || ''))
}

/**
 * Parses visible symbol property text.
 * @param {Map<string, object>} properties Symbol properties.
 * @param {string} ownerIndex Symbol owner id.
 * @param {{ mirror?: string, rotation?: number, powerSymbol?: boolean }} transform Symbol placement transform.
 * @returns {object[]}
 */
function parseSymbolPropertyTexts(properties, ownerIndex, transform = {}) {
    return [...properties.entries()]
        .filter(([, property]) => property.visible)
        .map(([name, property]) => ({
            x: property.x,
            y: property.y,
            text: property.value,
            value: property.value,
            ownerIndex,
            propertyName: name,
            color: defaultInkColor,
            fontSize: property.fontSize,
            font: property.font,
            rotation: symbolPropertyTextRotation(property, transform),
            anchor: mirrorTextAnchor(property.anchor, transform.mirror),
            vAlign: mirrorTextVAlign(property.vAlign, transform.mirror),
            symbolKind: transform.powerSymbol ? 'power' : ''
        }))
}

/**
 * Resolves visible field rotation for placed symbol properties.
 * @param {object} property Symbol property.
 * @param {{ rotation?: number }} transform Symbol placement transform.
 * @returns {number}
 */
function symbolPropertyTextRotation(property, transform) {
    const propertyRotation = numberValue(property?.rotation, 0)
    if (Math.abs(propertyRotation) > 0.001) return propertyRotation

    const symbolRotation = numberValue(transform?.rotation, 0)
    const normalized = ((symbolRotation % 360) + 360) % 360
    if (Math.abs(normalized - 90) < 0.001) return 90
    if (Math.abs(normalized - 270) < 0.001) return 270
    return propertyRotation
}

/**
 * Mirrors horizontal text justification for mirrored symbols.
 * @param {string} anchor SVG anchor.
 * @param {string | undefined} mirror KiCad mirror axis.
 * @returns {string}
 */
function mirrorTextAnchor(anchor, mirror) {
    if (mirror !== 'y') return anchor
    if (anchor === 'start') return 'end'
    if (anchor === 'end') return 'start'
    return anchor
}

/**
 * Mirrors vertical text justification for mirrored symbols.
 * @param {string} vAlign Vertical alignment.
 * @param {string | undefined} mirror KiCad mirror axis.
 * @returns {string}
 */
function mirrorTextVAlign(vAlign, mirror) {
    if (mirror !== 'x') return vAlign
    if (vAlign === 'top') return 'bottom'
    if (vAlign === 'bottom') return 'top'
    return vAlign
}

/**
 * Builds schematic nets for one sheet.
 * @param {object} schematic Schematic primitive collection.
 * @returns {{ nets: object[], diagnostics: object[] }}
 */
function buildSingleSheetNets(schematic) {
    const diagnostics = []
    const wireLines = (schematic.lines || []).filter(
        (line) => !line.ownerIndex && line.isBus !== true
    )
    const groups = groupConnectedSegments(wireLines, schematic.junctions || [])
    const namedPointNets = (schematic.texts || [])
        .filter((text) => text.recordType === '25' && text.text)
        .map((text) => ({
            name: text.text,
            segments: [],
            labels: [text],
            pins: [],
            junctions: [],
            sheetEntries: []
        }))

    const wireNets = groups.map((group, index) => {
        const labels = (schematic.texts || []).filter(
            (text) =>
                text.recordType === '25' &&
                group.some((line) => lineContainsPoint(line, text))
        )
        const pins = (schematic.pins || []).filter((pin) =>
            group.some((line) =>
                lineContainsPoint(line, pinConnectionPoint(pin))
            )
        )
        const junctions = (schematic.junctions || []).filter((junction) =>
            group.some((line) => lineContainsPoint(line, junction))
        )
        const sheetEntries = (schematic.sheetEntries || []).filter((entry) =>
            group.some((line) => lineContainsPoint(line, entry))
        )
        return {
            name: labels[0]?.text || `UnknownNet${index}`,
            segments: group,
            labels,
            powerPorts: [],
            pins,
            ports: [],
            junctions,
            busEntries: [],
            sheetEntries
        }
    })

    return {
        nets: dedupeNetsByName([...wireNets, ...namedPointNets]),
        diagnostics
    }
}

/**
 * Deduplicates nets with the same explicit name.
 * @param {object[]} nets Nets.
 * @returns {object[]}
 */
function dedupeNetsByName(nets) {
    const byName = new Map()
    for (const net of nets) {
        if (!byName.has(net.name)) {
            byName.set(net.name, net)
            continue
        }
        const existing = byName.get(net.name)
        existing.segments.push(...(net.segments || []))
        existing.labels.push(...(net.labels || []))
        existing.pins.push(...(net.pins || []))
        existing.junctions.push(...(net.junctions || []))
        existing.sheetEntries.push(...(net.sheetEntries || []))
    }
    return [...byName.values()]
}

/**
 * Groups connected wire segments.
 * @param {object[]} segments Wire segments.
 * @param {object[]} junctions Junctions.
 * @returns {object[][]}
 */
function groupConnectedSegments(segments, junctions) {
    const groups = []
    for (const segment of segments) {
        const connectedGroups = groups.filter((group) =>
            group.some((other) => segmentsTouch(segment, other, junctions))
        )
        if (!connectedGroups.length) {
            groups.push([segment])
            continue
        }
        connectedGroups[0].push(segment)
        for (const extra of connectedGroups.slice(1)) {
            connectedGroups[0].push(...extra)
            groups.splice(groups.indexOf(extra), 1)
        }
    }
    return groups
}

/**
 * Checks if two wire segments are connected.
 * @param {object} left First segment.
 * @param {object} right Second segment.
 * @param {object[]} junctions Junctions.
 * @returns {boolean}
 */
function segmentsTouch(left, right, junctions) {
    const endpoints = [
        { x: left.x1, y: left.y1 },
        { x: left.x2, y: left.y2 }
    ]
    const rightEndpoints = [
        { x: right.x1, y: right.y1 },
        { x: right.x2, y: right.y2 }
    ]
    if (
        endpoints.some((point) =>
            rightEndpoints.some((other) => pointsEqual(point, other))
        )
    ) {
        return true
    }
    return junctions.some(
        (junction) =>
            lineContainsPoint(left, junction) &&
            lineContainsPoint(right, junction)
    )
}

/**
 * Resolves a pin connection point.
 * @param {object} pin Pin.
 * @returns {{ x: number, y: number }}
 */
function pinConnectionPoint(pin) {
    if (pin.orientation === 'left') return { x: pin.x - pin.length, y: pin.y }
    if (pin.orientation === 'right') return { x: pin.x + pin.length, y: pin.y }
    if (pin.orientation === 'top') return { x: pin.x, y: pin.y - pin.length }
    return { x: pin.x, y: pin.y + pin.length }
}

/**
 * Checks if a point lies on a segment.
 * @param {object} line Line segment.
 * @param {{ x: number, y: number }} point Point.
 * @returns {boolean}
 */
function lineContainsPoint(line, point) {
    const distance =
        Geometry.distance({ x: line.x1, y: line.y1 }, point) +
        Geometry.distance(point, { x: line.x2, y: line.y2 })
    const length = Geometry.distance(
        { x: line.x1, y: line.y1 },
        { x: line.x2, y: line.y2 }
    )
    return Math.abs(distance - length) < 0.01
}

/**
 * Checks point equality with KiCad coordinate tolerance.
 * @param {{ x: number, y: number }} left First point.
 * @param {{ x: number, y: number }} right Second point.
 * @returns {boolean}
 */
function pointsEqual(left, right) {
    return (
        Math.abs(left.x - right.x) < 0.01 && Math.abs(left.y - right.y) < 0.01
    )
}

/**
 * Parses property nodes by name.
 * @param {Array} node Parent node.
 * @returns {Map<string, object>}
 */
function parseProperties(node) {
    const properties = new Map()
    for (const property of children(node, 'property')) {
        const at = parseAt(child(property, 'at'))
        const font = parseTextFont(property)
        properties.set(String(property[1] || ''), {
            value: String(property[2] || ''),
            x: at.x,
            y: at.y,
            rotation: at.rotation,
            fontSize: font.size,
            font,
            anchor:
                font.hAlign === 'right'
                    ? 'end'
                    : font.hAlign === 'center'
                      ? 'middle'
                      : 'start',
            vAlign: font.vAlign,
            visible: !hasHiddenEffect(property)
        })
    }
    return properties
}

/**
 * Parses text font information.
 * @param {Array} node Text node.
 * @returns {{ size: number, width: number, height: number, hAlign: string, vAlign: string }}
 */
function parseTextFont(node) {
    const effects = child(node, 'effects')
    const font = child(effects, 'font')
    const size = child(font, 'size') || ['size', 1.27, 1.27]
    const justify = child(effects, 'justify') || []
    const width = numberValue(size[1], 1.27)
    const height = numberValue(size[2], width)
    return {
        size: height,
        width,
        height,
        hAlign: firstJustify(justify, ['left', 'center', 'right']) || 'left',
        vAlign: firstJustify(justify, ['top', 'center', 'bottom']) || 'bottom'
    }
}

/**
 * Finds a justify token.
 * @param {Array} justify Justify node.
 * @param {string[]} options Accepted values.
 * @returns {string}
 */
function firstJustify(justify, options) {
    return (
        justify.slice(1).find((token) => options.includes(String(token))) || ''
    )
}

/**
 * Checks hidden text effects.
 * @param {Array} node Node.
 * @returns {boolean}
 */
function hasHiddenEffect(node) {
    return (
        children(node).some(
            (entry) => entry[0] === 'effects' && hasChild(entry, 'hide')
        ) || hasChild(node, 'hide')
    )
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
 * Checks for a named child.
 * @param {Array | undefined} node Parent node.
 * @param {string} name Child name.
 * @returns {boolean}
 */
function hasChild(node, name) {
    return Boolean(child(node, name))
}

/**
 * Checks node type.
 * @param {unknown} node Node.
 * @param {string} name Expected name.
 * @returns {boolean}
 */
function isNode(node, name) {
    return Array.isArray(node) && node[0] === name
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
 * Strips a file extension.
 * @param {string} fileName File name.
 * @returns {string}
 */
function stripExtension(fileName) {
    return String(fileName || '').replace(/\.[^.]+$/, '')
}
