// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { SExpressionTree } from './SExpressionTree.mjs'

/**
 * Parses KiCad PCB class, rule, and statistics metadata.
 */
export class KicadPcbBoardMetadataParser {
    /**
     * Parses legacy board net class declarations.
     * @param {Array} root KiCad PCB root node.
     * @returns {object[]}
     */
    static parseNetClasses(root) {
        return children(root, 'net_class').map(parseNetClass)
    }

    /**
     * Parses setup rule declarations.
     * @param {Array | undefined} setupNode Setup node.
     * @returns {object[]}
     */
    static parseSetupRules(setupNode) {
        return children(child(setupNode, 'rules'))
            .map((node) => ({
                name: String(node[0] || ''),
                value: parseScalarValue(node[1])
            }))
            .filter((rule) => rule.name)
            .sort((left, right) => left.name.localeCompare(right.name))
    }

    /**
     * Builds compact board statistics.
     * @param {object} context Board primitive context.
     * @returns {object}
     */
    static buildStatistics(context) {
        const drawings = context.drawings || []
        return {
            footprintCount: (context.footprints || []).length,
            padCount: (context.pads || []).length,
            netCount: (context.nets || []).length,
            classCount: (context.classes || []).length,
            ruleCount: (context.rules || []).length,
            outlineCount: (context.outlines || []).length,
            drawingCount: drawings.length,
            trackCount: drawings.filter((drawing) => drawing.type === 'segment')
                .length,
            arcCount: drawings.filter(
                (drawing) =>
                    drawing.type === 'arc' && drawing.sourceType === 'arc'
            ).length,
            viaCount: drawings.filter((drawing) => drawing.type === 'via')
                .length,
            zoneCount: drawings.filter((drawing) => drawing.type === 'zone')
                .length,
            textCount: (context.texts || []).filter(
                (text) => text.visible !== false
            ).length
        }
    }
}

/**
 * Parses one legacy net_class node.
 * @param {Array} node Net class node.
 * @returns {object}
 */
function parseNetClass(node) {
    return removeUndefinedValues({
        name: String(node?.[1] || ''),
        description: String(node?.[2] || ''),
        clearance: optionalNumber(child(node, 'clearance')),
        traceWidth:
            optionalNumber(child(node, 'trace_width')) ??
            optionalNumber(child(node, 'track_width')),
        viaDiameter:
            optionalNumber(child(node, 'via_dia')) ??
            optionalNumber(child(node, 'via_diameter')),
        viaDrill: optionalNumber(child(node, 'via_drill')),
        nets: children(node, 'add_net').map((entry) => String(entry[1] || ''))
    })
}

/**
 * Parses a scalar node value.
 * @param {unknown} value Scalar value.
 * @returns {string | number | boolean}
 */
function parseScalarValue(value) {
    if (value === 'yes' || value === 'true') return true
    if (value === 'no' || value === 'false') return false
    return typeof value === 'number' ? value : String(value ?? '')
}

/**
 * Reads optional number from a node.
 * @param {Array | undefined} node Value node.
 * @returns {number | undefined}
 */
function optionalNumber(node) {
    return node ? SExpressionTree.numberValue(node[1], 0) : undefined
}

/**
 * Removes undefined fields from an object.
 * @param {Record<string, unknown>} value Source object.
 * @returns {object}
 */
function removeUndefinedValues(value) {
    return Object.fromEntries(
        Object.entries(value).filter((entry) => entry[1] !== undefined)
    )
}

/**
 * Finds direct child nodes, optionally by name.
 * @param {Array | undefined} node Parent node.
 * @param {string | string[]} [name] Child name.
 * @returns {Array[]}
 */
function children(node, name) {
    return SExpressionTree.children(node, name)
}

/**
 * Finds the first direct child by name.
 * @param {Array | undefined} node Parent node.
 * @param {string | string[]} name Child name.
 * @returns {Array | undefined}
 */
function child(node, name) {
    return SExpressionTree.child(node, name)
}
