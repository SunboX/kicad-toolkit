// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadDesignRulesParser } from './KicadDesignRulesParser.mjs'
import { KicadFootprintAssociationParser } from './KicadFootprintAssociationParser.mjs'
import { KicadJobsetParser } from './KicadJobsetParser.mjs'
import { KicadLegacyLibraryParser } from './KicadLegacyLibraryParser.mjs'
import { KicadLibraryTableParser } from './KicadLibraryTableParser.mjs'
import { KicadNetlistParser } from './KicadNetlistParser.mjs'
import { KicadWorksheetParser } from './KicadWorksheetParser.mjs'

/**
 * Routes non-board, non-schematic KiCad sidecar files to parser helpers.
 */
export class KicadAuxiliaryParserRouter {
    /**
     * Parses a supported auxiliary file or returns null for unknown names.
     * @param {string} fileName Source file name.
     * @param {string} source Source text.
     * @param {object} [options] Parser options.
     * @returns {object | null}
     */
    static parseIfSupported(fileName, source, options = {}) {
        const normalizedName = String(fileName || '')
        const route = routes.find((entry) => entry.test(normalizedName))
        if (!route) return null

        return route.parse(source, {
            ...options,
            fileName: normalizedName
        })
    }
}

const routes = Object.freeze([
    route(
        (fileName) => KicadLibraryTableParser.isLibraryTableFile(fileName),
        KicadLibraryTableParser
    ),
    route((fileName) => /\.kicad_jobset$/i.test(fileName), KicadJobsetParser),
    route((fileName) => /\.kicad_dru$/i.test(fileName), KicadDesignRulesParser),
    route((fileName) => /\.kicad_wks$/i.test(fileName), KicadWorksheetParser),
    route((fileName) => /\.net$/i.test(fileName), KicadNetlistParser),
    route(
        (fileName) => /\.cmp$/i.test(fileName),
        KicadFootprintAssociationParser
    ),
    route(
        (fileName) => /\.(lib|dcm|mod)$/i.test(fileName),
        KicadLegacyLibraryParser
    )
])

/**
 * Builds one parser route.
 * @param {(fileName: string) => boolean} test Route predicate.
 * @param {{ parse: Function }} parser Parser class.
 * @returns {{ test: Function, parse: Function }}
 */
function route(test, parser) {
    return {
        test,
        parse: (source, options) => parser.parse(source, options)
    }
}
