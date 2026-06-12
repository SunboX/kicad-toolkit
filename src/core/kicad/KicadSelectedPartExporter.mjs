// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { SExpressionSerializer } from './SExpressionSerializer.mjs'

/**
 * Exports one selected part as KiCad symbol and footprint library files.
 */
export class KicadSelectedPartExporter {
    /**
     * Exports both KiCad symbol and footprint entries for one selected part.
     * @param {{ designator?: string, symbol?: object, footprint?: object }} selectedPart Selected part bundle.
     * @param {{ partName?: string }} [options] Export options.
     * @returns {{ entries: { path: string, bytes: Uint8Array, contentType: string }[], diagnostics: object[] }}
     */
    static export(selectedPart, options = {}) {
        const symbolResult = KicadSelectedPartExporter.exportSymbol(
            selectedPart,
            options
        )
        const footprintResult = KicadSelectedPartExporter.exportFootprint(
            selectedPart,
            options
        )

        return {
            entries: [symbolResult.entry, footprintResult.entry],
            diagnostics: [
                ...symbolResult.diagnostics,
                ...footprintResult.diagnostics
            ]
        }
    }

    /**
     * Exports one selected part symbol as a KiCad `.kicad_sym` library.
     * @param {{ designator?: string, symbol?: object }} selectedPart Selected part bundle.
     * @param {{ partName?: string }} [options] Export options.
     * @returns {{ entry: { path: string, bytes: Uint8Array, contentType: string }, diagnostics: object[] }}
     */
    static exportSymbol(selectedPart, options = {}) {
        const symbol = selectedPart?.symbol || {}
        const rawNode = KicadSelectedPartExporter.#rawNode(symbol, [
            'rawNode',
            'rawSymbol'
        ])
        const diagnostics = []
        const symbolNode =
            rawNode ||
            KicadSelectedPartExporter.#fallbackSymbolNode(
                selectedPart,
                diagnostics
            )
        const libraryNode = [
            'kicad_symbol_lib',
            ['version', 20240108],
            ['generator', 'ecad_forge'],
            symbolNode
        ]
        const partName = KicadSelectedPartExporter.#partFileName(
            selectedPart,
            options,
            'part'
        )

        return {
            entry: KicadSelectedPartExporter.#textEntry(
                'kicad/' + partName + '.kicad_sym',
                SExpressionSerializer.serializeDocument(libraryNode),
                'application/x-kicad-symbol-library'
            ),
            diagnostics
        }
    }

    /**
     * Exports one selected part footprint as a KiCad `.kicad_mod` file.
     * @param {{ designator?: string, footprint?: object }} selectedPart Selected part bundle.
     * @param {{ partName?: string }} [options] Export options.
     * @returns {{ entry: { path: string, bytes: Uint8Array, contentType: string }, diagnostics: object[] }}
     */
    static exportFootprint(selectedPart, options = {}) {
        const footprint = selectedPart?.footprint || {}
        const rawNode = KicadSelectedPartExporter.#rawNode(footprint, [
            'rawNode',
            'rawFootprint'
        ])
        const diagnostics = []
        const footprintNode =
            rawNode ||
            KicadSelectedPartExporter.#fallbackFootprintNode(
                selectedPart,
                diagnostics
            )
        const partName = KicadSelectedPartExporter.#partFileName(
            selectedPart,
            options,
            'part'
        )

        return {
            entry: KicadSelectedPartExporter.#textEntry(
                'kicad/' + partName + '.kicad_mod',
                SExpressionSerializer.serializeDocument(footprintNode),
                'application/x-kicad-footprint'
            ),
            diagnostics
        }
    }

    /**
     * Returns a raw AST node from any accepted property.
     * @param {object} source Source object.
     * @param {string[]} keys Candidate property names.
     * @returns {Array | null}
     */
    static #rawNode(source, keys) {
        for (const key of keys) {
            if (Array.isArray(source?.[key])) {
                return source[key]
            }
        }

        return null
    }

    /**
     * Builds a fallback KiCad symbol node from normalized data.
     * @param {{ designator?: string, symbol?: object }} selectedPart Selected part bundle.
     * @param {object[]} diagnostics Mutable diagnostics list.
     * @returns {Array}
     */
    static #fallbackSymbolNode(selectedPart, diagnostics) {
        const symbol = selectedPart?.symbol || {}
        const symbolName = KicadSelectedPartExporter.#libraryName(
            symbol.name || selectedPart?.designator || 'Component'
        )
        const pins = KicadSelectedPartExporter.#array(symbol.pins)

        diagnostics.push({
            severity: 'warning',
            code: 'kicad_symbol_generated',
            message:
                'Generated KiCad symbol from normalized selected component data.'
        })

        return [
            'symbol',
            symbolName,
            [
                'property',
                'Reference',
                selectedPart?.designator || 'U',
                ['at', 0, 0, 0]
            ],
            ['property', 'Value', symbolName, ['at', 0, -2.54, 0]],
            [
                'rectangle',
                ['start', -5.08, -5.08],
                ['end', 5.08, 5.08],
                ['stroke', ['width', 0.15], ['type', 'default']],
                ['fill', ['type', 'background']]
            ],
            ...pins.map((pin, index) =>
                KicadSelectedPartExporter.#fallbackPinNode(pin, index)
            )
        ]
    }

    /**
     * Builds one fallback symbol pin node.
     * @param {object} pin Normalized pin.
     * @param {number} index Pin index.
     * @returns {Array}
     */
    static #fallbackPinNode(pin, index) {
        const y = index * 2.54

        return [
            'pin',
            'passive',
            'line',
            ['at', -7.62, y, 0],
            ['length', 2.54],
            ['name', String(pin?.name || pin?.designator || index + 1)],
            ['number', String(pin?.number || pin?.pinNumber || index + 1)]
        ]
    }

    /**
     * Builds a fallback KiCad footprint node from normalized data.
     * @param {{ designator?: string, footprint?: object }} selectedPart Selected part bundle.
     * @param {object[]} diagnostics Mutable diagnostics list.
     * @returns {Array}
     */
    static #fallbackFootprintNode(selectedPart, diagnostics) {
        const footprint = selectedPart?.footprint || {}
        const footprintName = KicadSelectedPartExporter.#libraryName(
            footprint.name || selectedPart?.designator || 'Component'
        )
        const pads = KicadSelectedPartExporter.#array(footprint.pads)

        diagnostics.push({
            severity: 'warning',
            code: 'kicad_footprint_generated',
            message:
                'Generated KiCad footprint from normalized selected component data.'
        })

        return [
            'footprint',
            footprintName,
            ['layer', 'F.Cu'],
            [
                'property',
                'Reference',
                selectedPart?.designator || 'REF**',
                ['at', 0, -1.5, 0]
            ],
            ['property', 'Value', footprintName, ['at', 0, 1.5, 0]],
            ...pads.map((pad, index) =>
                KicadSelectedPartExporter.#fallbackPadNode(pad, index)
            )
        ]
    }

    /**
     * Builds one fallback footprint pad node.
     * @param {object} pad Normalized pad.
     * @param {number} index Pad index.
     * @returns {Array}
     */
    static #fallbackPadNode(pad, index) {
        return [
            'pad',
            String(pad?.number || pad?.designator || pad?.name || index + 1),
            'smd',
            'rect',
            [
                'at',
                KicadSelectedPartExporter.#number(pad?.x, index * 1.27),
                KicadSelectedPartExporter.#number(pad?.y, 0)
            ],
            [
                'size',
                KicadSelectedPartExporter.#number(pad?.width, 1),
                KicadSelectedPartExporter.#number(pad?.height, 1)
            ],
            ['layers', 'F.Cu', 'F.Paste', 'F.Mask']
        ]
    }

    /**
     * Creates one UTF-8 text export entry.
     * @param {string} path Archive path.
     * @param {string} text Source text.
     * @param {string} contentType Content type.
     * @returns {{ path: string, bytes: Uint8Array, contentType: string }}
     */
    static #textEntry(path, text, contentType) {
        return {
            path,
            bytes: new TextEncoder().encode(text),
            contentType
        }
    }

    /**
     * Resolves the archive-safe part file name.
     * @param {{ designator?: string }} selectedPart Selected part bundle.
     * @param {{ partName?: string }} options Export options.
     * @param {string} fallback Fallback name.
     * @returns {string}
     */
    static #partFileName(selectedPart, options, fallback) {
        return KicadSelectedPartExporter.#safeFileName(
            options?.partName || selectedPart?.designator || fallback
        )
    }

    /**
     * Resolves a KiCad library item name.
     * @param {string} value Raw name.
     * @returns {string}
     */
    static #libraryName(value) {
        return String(value || 'Component')
            .trim()
            .replace(/\s+/gu, '_')
            .replace(/[\\/:\u0000-\u001f]/gu, '_')
    }

    /**
     * Resolves a filesystem-safe file name token.
     * @param {string} value Raw value.
     * @returns {string}
     */
    static #safeFileName(value) {
        return String(value || 'part')
            .trim()
            .replace(/[\\/:\u0000-\u001f]/gu, '_')
    }

    /**
     * Normalizes a possible array.
     * @param {unknown} value Candidate array.
     * @returns {object[]}
     */
    static #array(value) {
        return Array.isArray(value) ? value : []
    }

    /**
     * Reads a finite number with fallback.
     * @param {unknown} value Candidate number.
     * @param {number} fallback Fallback number.
     * @returns {number}
     */
    static #number(value, fallback) {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : fallback
    }
}
