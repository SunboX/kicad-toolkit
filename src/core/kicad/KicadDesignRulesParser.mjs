// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { NormalizedModelSchema } from './NormalizedModelSchema.mjs'
import { SExpressionParser } from './SExpressionParser.mjs'
import { SExpressionTree } from './SExpressionTree.mjs'

/**
 * Parses KiCad custom design rule files.
 */
export class KicadDesignRulesParser {
    /**
     * Parses .kicad_dru source.
     * @param {string} source Design rules source.
     * @param {{ fileName?: string }} [options] Parser options.
     * @returns {object}
     */
    static parse(source, options = {}) {
        const parsed = SExpressionParser.parseWithMetadata(
            `(kicad_dru ${source})`
        )
        const fileName = String(options.fileName || '')
        const rules = SExpressionTree.children(parsed.root, 'rule').map(
            parseRule
        )
        const componentClassAssignments = SExpressionTree.children(
            parsed.root,
            'assign_component_class'
        ).map(parseComponentClassAssignment)
        const constraintCount = rules.reduce((total, rule) => {
            return total + rule.constraints.length
        }, 0)

        return NormalizedModelSchema.attach({
            sourceFormat: 'kicad',
            kind: 'design-rules',
            fileType: 'kicad_dru',
            fileName,
            summary: {
                title: stripExtension(baseName(fileName)) || 'KiCad rules',
                ruleCount: rules.length,
                constraintCount,
                componentClassAssignmentCount: componentClassAssignments.length
            },
            diagnostics: [],
            version: SExpressionTree.numberValue(
                SExpressionTree.child(parsed.root, 'version')?.[1],
                0
            ),
            rules,
            componentClassAssignments,
            rawRules: parsed.root,
            sexpr: parsed.metadata,
            bom: []
        })
    }
}

/**
 * Parses one DRC rule.
 * @param {Array} node Rule node.
 * @returns {object}
 */
function parseRule(node) {
    const disallow = SExpressionTree.children(node, 'disallow').map(
        parseDisallow
    )

    return {
        name: SExpressionTree.textValue(node),
        condition: SExpressionTree.textValue(
            SExpressionTree.child(node, 'condition')
        ),
        layer: SExpressionTree.textValue(SExpressionTree.child(node, 'layer')),
        severity: SExpressionTree.textValue(
            SExpressionTree.child(node, 'severity')
        ),
        constraints: SExpressionTree.children(node, 'constraint').map(
            parseConstraint
        ),
        disallow,
        rawRule: node
    }
}

/**
 * Parses one constraint.
 * @param {Array} node Constraint node.
 * @returns {object}
 */
function parseConstraint(node) {
    return {
        name: String(node?.[1] || ''),
        values: Object.fromEntries(
            SExpressionTree.children(node).map((child) => [
                SExpressionTree.nodeName(child),
                child.length === 2 ? child[1] : child.slice(1)
            ])
        ),
        raw: node
    }
}

/**
 * Parses one disallow entry.
 * @param {Array} node Disallow node.
 * @returns {object}
 */
function parseDisallow(node) {
    return {
        value: String(node?.[1] || ''),
        raw: node
    }
}

/**
 * Parses one component class assignment rule.
 * @param {Array} node Assignment node.
 * @returns {object}
 */
function parseComponentClassAssignment(node) {
    return {
        name: SExpressionTree.textValue(node),
        condition: SExpressionTree.textValue(
            SExpressionTree.child(node, 'condition')
        ),
        rawAssignment: node
    }
}

/**
 * Returns a slash-normalized basename.
 * @param {string} path Source path.
 * @returns {string}
 */
function baseName(path) {
    return (
        String(path || '')
            .replace(/\\/g, '/')
            .split('/')
            .pop() || ''
    )
}

/**
 * Removes the last extension from a file name.
 * @param {string} fileName Source file name.
 * @returns {string}
 */
function stripExtension(fileName) {
    return String(fileName || '').replace(/\.[^.]+$/, '')
}
