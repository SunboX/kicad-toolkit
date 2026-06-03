// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { SExpressionTree } from './SExpressionTree.mjs'

/**
 * Declarative helpers for mapping S-expression nodes to plain objects.
 */
export class SExpressionSchema {
    /**
     * Parses one node with a declarative schema.
     * @param {Array} node Source node.
     * @param {object} schema Node schema.
     * @returns {{ value: object, diagnostics: object[] }}
     */
    static parse(node, schema) {
        const value = {}
        const diagnostics = []
        const acceptedChildren = acceptedChildNames(schema)

        if (schema.name && SExpressionTree.nodeName(node) !== schema.name) {
            diagnostics.push(
                schemaDiagnostic('error', 'node_name_mismatch', {
                    path: schema.name,
                    message: `Expected ${schema.name} node.`
                })
            )
        }

        let scalarIndex = 0
        const scalars = positionalScalars(node)
        for (const field of schema.fields || []) {
            if (field.kind === 'positional') {
                value[field.outputName] = readValue(
                    field.reader,
                    scalars[scalarIndex]
                )
                scalarIndex += 1
                continue
            }
            if (field.kind === 'child') {
                const child = SExpressionTree.child(node, field.childName)
                if (child)
                    value[field.outputName] = readValue(field.reader, child)
                continue
            }
            if (field.kind === 'flag') {
                value[field.outputName] = SExpressionTree.hasChild(
                    node,
                    field.childName
                )
                continue
            }
            if (field.kind === 'properties') {
                value[field.outputName] = SExpressionTree.propertyObject(node)
            }
        }

        diagnostics.push(
            ...unknownChildDiagnostics(node, schema, acceptedChildren)
        )
        return { value, diagnostics }
    }

    /**
     * Builds a node schema.
     * @param {string} name Expected node name.
     * @param {object[]} fields Field schemas.
     * @param {{ warnUnknownChildren?: boolean }} [options] Schema options.
     * @returns {object}
     */
    static node(name, fields = [], options = {}) {
        return {
            kind: 'node',
            name,
            fields,
            warnUnknownChildren: options.warnUnknownChildren !== false
        }
    }

    /**
     * Builds a positional scalar field schema.
     * @param {string} outputName Output property name.
     * @param {object} reader Value reader.
     * @returns {object}
     */
    static positional(outputName, reader) {
        return { kind: 'positional', outputName, reader }
    }

    /**
     * Builds a named child field schema.
     * @param {string} childName Child node name.
     * @param {string} outputName Output property name.
     * @param {object} reader Value reader.
     * @returns {object}
     */
    static child(childName, outputName, reader) {
        return { kind: 'child', childName, outputName, reader }
    }

    /**
     * Builds a child-presence flag field schema.
     * @param {string} childName Child node name.
     * @param {string} [outputName] Output property name.
     * @returns {object}
     */
    static flag(childName, outputName = childName) {
        return { kind: 'flag', childName, outputName }
    }

    /**
     * Builds a property-map field schema.
     * @param {string} [outputName] Output property name.
     * @returns {object}
     */
    static properties(outputName = 'properties') {
        return { kind: 'properties', childName: 'property', outputName }
    }

    /**
     * Builds a text reader.
     * @param {string} [fallback] Fallback value.
     * @returns {object}
     */
    static string(fallback = '') {
        return {
            read(value) {
                return SExpressionTree.textValue(value, fallback)
            }
        }
    }

    /**
     * Builds a number reader.
     * @param {number} [fallback] Fallback value.
     * @returns {object}
     */
    static number(fallback = 0) {
        return {
            read(value) {
                return SExpressionTree.numberValue(value, fallback)
            }
        }
    }

    /**
     * Builds a boolean reader.
     * @param {boolean} [fallback] Fallback value.
     * @returns {object}
     */
    static boolean(fallback = false) {
        return {
            read(value) {
                return SExpressionTree.booleanValue(value, fallback)
            }
        }
    }

    /**
     * Builds a two-coordinate reader.
     * @param {{ x: number, y: number }} [fallback] Fallback point.
     * @returns {object}
     */
    static vec2(fallback = { x: 0, y: 0 }) {
        return {
            read(value) {
                return SExpressionTree.vec2(value, fallback)
            }
        }
    }
}

/**
 * Reads a schema value with a reader.
 * @param {object} reader Reader.
 * @param {unknown} value Source value.
 * @returns {unknown}
 */
function readValue(reader, value) {
    return typeof reader?.read === 'function' ? reader.read(value) : value
}

/**
 * Lists direct scalar values after the node name.
 * @param {Array | undefined} node Source node.
 * @returns {unknown[]}
 */
function positionalScalars(node) {
    return Array.isArray(node)
        ? node.slice(1).filter((entry) => !Array.isArray(entry))
        : []
}

/**
 * Lists accepted child names for a schema.
 * @param {object} schema Node schema.
 * @returns {Set<string>}
 */
function acceptedChildNames(schema) {
    return new Set(
        (schema.fields || [])
            .map((field) => field.childName)
            .filter((name) => typeof name === 'string' && name.length > 0)
    )
}

/**
 * Builds unknown-child diagnostics.
 * @param {Array | undefined} node Source node.
 * @param {object} schema Node schema.
 * @param {Set<string>} acceptedChildren Accepted child names.
 * @returns {object[]}
 */
function unknownChildDiagnostics(node, schema, acceptedChildren) {
    if (!schema.warnUnknownChildren) return []

    return SExpressionTree.children(node)
        .filter(
            (child) => !acceptedChildren.has(SExpressionTree.nodeName(child))
        )
        .map((child) => {
            const childName = SExpressionTree.nodeName(child)
            return schemaDiagnostic('warning', 'unknown_child', {
                path: `${schema.name}.${childName}`,
                message: `Unknown child ${childName} in ${schema.name}.`
            })
        })
}

/**
 * Builds one schema diagnostic.
 * @param {string} severity Diagnostic severity.
 * @param {string} code Diagnostic code.
 * @param {{ path: string, message: string }} fields Diagnostic fields.
 * @returns {object}
 */
function schemaDiagnostic(severity, code, fields) {
    return {
        severity,
        code,
        path: fields.path,
        message: fields.message
    }
}
