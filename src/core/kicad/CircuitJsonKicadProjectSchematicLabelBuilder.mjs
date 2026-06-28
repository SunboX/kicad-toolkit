// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'
import { CircuitJsonKicadProjectSchematicTransform as SchematicTransform } from './CircuitJsonKicadProjectSchematicTransform.mjs'

/**
 * Builds KiCad schematic net-label nodes from CircuitJSON label rows.
 */
export class CircuitJsonKicadProjectSchematicLabelBuilder {
    /**
     * Builds schematic net label and power-symbol nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static labels(context) {
        return context.elements
            .filter((element) => element?.type === 'schematic_net_label')
            .map((element, index) =>
                CircuitJsonKicadProjectSchematicLabelBuilder.labelNode(
                    context,
                    element,
                    index
                )
            )
            .filter(Boolean)
    }

    /**
     * Builds one label node.
     * @param {object} context Export context.
     * @param {object} element Label element.
     * @param {number} index Label index.
     * @returns {Array | null}
     */
    static labelNode(context, element, index) {
        const transform = SchematicTransform.forContext(context)
        const point = Utils.point(
            element.anchor_position || element.position || element
        )
        if (!point) return null
        const output = transform.point(point)
        if (CircuitJsonKicadProjectSchematicLabelBuilder.#symbolName(element)) {
            return CircuitJsonKicadProjectSchematicLabelBuilder.#powerSymbol(
                context,
                element,
                output,
                index
            )
        }
        const kind =
            CircuitJsonKicadProjectSchematicLabelBuilder.#labelKind(element)
        if (kind === 'local') {
            return CircuitJsonKicadProjectSchematicLabelBuilder.#label(
                'label',
                element,
                output,
                index
            )
        }
        if (kind === 'hierarchical') {
            return CircuitJsonKicadProjectSchematicLabelBuilder.#label(
                'hierarchical_label',
                element,
                output,
                index
            )
        }
        return CircuitJsonKicadProjectSchematicLabelBuilder.#globalLabel(
            context,
            element,
            output,
            index
        )
    }

    /**
     * Builds one KiCad global label node.
     * @param {object} context Export context.
     * @param {object} element Label element.
     * @param {{ x: number, y: number }} point Label anchor.
     * @param {number} index Label index.
     * @returns {Array}
     */
    static #globalLabel(context, element, point, index) {
        return CircuitJsonKicadProjectSchematicLabelBuilder.#label(
            'global_label',
            element,
            point,
            index
        )
    }

    /**
     * Builds one KiCad label node.
     * @param {string} nodeName KiCad label node name.
     * @param {object} element Label element.
     * @param {{ x: number, y: number }} point Label anchor.
     * @param {number} index Label index.
     * @returns {Array}
     */
    static #label(nodeName, element, point, index) {
        const side =
            CircuitJsonKicadProjectSchematicLabelBuilder.#anchorSide(element)
        const orientation =
            CircuitJsonKicadProjectSchematicLabelBuilder.#orientation(
                element,
                side
            )
        const node = [
            nodeName,
            Utils.text(element.text || element.name),
            ['at', point.x, -point.y, orientation.rotation],
            CircuitJsonKicadProjectSchematicLabelBuilder.#effectsNode(
                element,
                orientation.justify
            ),
            [
                'uuid',
                Utils.uuid(
                    nodeName + ':' + (element.schematic_net_label_id || index)
                )
            ]
        ]
        if (nodeName !== 'label') {
            node.splice(2, 0, [
                'shape',
                Utils.text(element.shape || element.label_shape, 'input')
            ])
        }
        return node
    }

    /**
     * Builds one power-symbol placement node.
     * @param {object} context Export context.
     * @param {object} element Label element.
     * @param {{ x: number, y: number }} point Label anchor.
     * @param {number} index Label index.
     * @returns {Array}
     */
    static #powerSymbol(context, element, point, index) {
        const transform = SchematicTransform.forContext(context)
        const symbolName =
            CircuitJsonKicadProjectSchematicLabelBuilder.#symbolName(element)
        const value = Utils.text(element.text || element.name || symbolName)
        const libId = symbolName.includes(':')
            ? symbolName
            : 'power:' + symbolName
        const rotation =
            CircuitJsonKicadProjectSchematicLabelBuilder.#orientation(
                element,
                CircuitJsonKicadProjectSchematicLabelBuilder.#anchorSide(
                    element
                )
            ).rotation

        return [
            'symbol',
            ['lib_id', libId],
            ['at', point.x, -point.y, rotation],
            ['unit', 1],
            ['exclude_from_sim', 'no'],
            ['in_bom', 'no'],
            ['on_board', 'no'],
            ['dnp', 'no'],
            [
                'uuid',
                Utils.uuid(
                    'power-label:' + (element.schematic_net_label_id || index)
                )
            ],
            [
                'property',
                'Reference',
                '#PWR' + String(index + 1),
                ['at', point.x, -point.y - transform.length(2.54), 0],
                ['effects', ['font', ['size', 1.27, 1.27]], ['hide']]
            ],
            [
                'property',
                'Value',
                value,
                ['at', point.x, -point.y + transform.length(2.54), 0],
                ['effects', ['font', ['size', 1.27, 1.27]]]
            ]
        ]
    }

    /**
     * Resolves the label symbol name.
     * @param {object} element Label element.
     * @returns {string}
     */
    static #symbolName(element) {
        return Utils.text(
            element.symbol_name ||
                element.symbolName ||
                element.metadata?.kicad_symbol?.name ||
                element.metadata?.kicadSymbol?.name
        )
    }

    /**
     * Resolves a label anchor side.
     * @param {object} element Label element.
     * @returns {string}
     */
    static #anchorSide(element) {
        return Utils.text(
            element.anchor_side ||
                element.anchorSide ||
                element.facing_direction ||
                element.facingDirection ||
                ''
        ).toLowerCase()
    }

    /**
     * Resolves the KiCad label family.
     * @param {object} element Label element.
     * @returns {'global' | 'hierarchical' | 'local'}
     */
    static #labelKind(element) {
        if (element.is_global === false || element.isGlobal === false) {
            return 'local'
        }
        if (
            element.is_hierarchical === true ||
            element.isHierarchical === true
        ) {
            return 'hierarchical'
        }
        const kind = Utils.text(
            element.label_type ||
                element.labelType ||
                element.label_kind ||
                element.labelKind ||
                element.net_label_type ||
                element.netLabelType ||
                element.scope
        ).toLowerCase()
        if (['local', 'label'].includes(kind)) return 'local'
        if (['hierarchical', 'hierarchy', 'sheet'].includes(kind)) {
            return 'hierarchical'
        }
        return 'global'
    }

    /**
     * Resolves orientation and text justification from an anchor side.
     * @param {object} element Label element.
     * @param {string} side Anchor side.
     * @returns {{ rotation: number, justify: string }}
     */
    static #orientation(element, side) {
        const fallback =
            CircuitJsonKicadProjectSchematicLabelBuilder.#sideOrientation(side)
        return {
            rotation:
                CircuitJsonKicadProjectSchematicLabelBuilder.#explicitRotation(
                    element,
                    fallback.rotation
                ),
            justify:
                CircuitJsonKicadProjectSchematicLabelBuilder.#explicitJustify(
                    element,
                    fallback.justify
                )
        }
    }

    /**
     * Resolves orientation and justification from the facing side.
     * @param {string} side Anchor side.
     * @returns {{ rotation: number, justify: string }}
     */
    static #sideOrientation(side) {
        if (side === 'left') return { rotation: 180, justify: 'right' }
        if (side === 'top') return { rotation: 90, justify: 'left' }
        if (side === 'bottom') return { rotation: 270, justify: 'left' }
        return { rotation: 0, justify: 'left' }
    }

    /**
     * Resolves an explicit label rotation.
     * @param {object} element Label element.
     * @param {number} fallback Fallback rotation.
     * @returns {number}
     */
    static #explicitRotation(element, fallback) {
        const candidates = [
            element.rotation,
            element.schRotation,
            element.sch_rotation,
            element.labelRotation,
            element.label_rotation
        ]
        for (const candidate of candidates) {
            const rotation = Number(candidate)
            if (Number.isFinite(rotation)) return Utils.round(rotation)
        }
        return fallback
    }

    /**
     * Resolves an explicit text justification.
     * @param {object} element Label element.
     * @param {string} fallback Fallback justification.
     * @returns {string}
     */
    static #explicitJustify(element, fallback) {
        const justify = Utils.text(
            element.justify ||
                element.horizontal_justify ||
                element.horizontalJustify ||
                element.h_align ||
                element.hAlign
        ).toLowerCase()
        if (['left', 'right', 'center'].includes(justify)) return justify
        return fallback
    }

    /**
     * Builds a KiCad text effects node.
     * @param {object} element Label element.
     * @param {string} justify Horizontal justification.
     * @returns {Array}
     */
    static #effectsNode(element, justify) {
        const size = Utils.number(element.font_size ?? element.size, 1.27)
        return [
            'effects',
            ['font', ['size', size, size], ['thickness', 0.15]],
            ['justify', justify]
        ]
    }
}
