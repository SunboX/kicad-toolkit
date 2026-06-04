// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { strToU8 } from 'fflate'
import {
    KicadLibraryIndexBuilder,
    KicadLibraryTableParser,
    KicadParser,
    KicadProjectLoader
} from '../../src/parser.mjs'

test('KicadLibraryTableParser parses KiCad footprint library tables', () => {
    const table = KicadLibraryTableParser.parse(footprintTableSource(), {
        fileName: 'fp-lib-table',
        variables: { KIPRJMOD: 'demo' }
    })

    assert.equal(table.kind, 'library-table')
    assert.equal(table.fileType, 'fp_lib_table')
    assert.equal(table.tableType, 'footprint')
    assert.equal(table.summary.libraryCount, 2)
    assert.deepEqual(
        table.rows.map((row) => ({
            name: row.name,
            type: row.type,
            uri: row.uri,
            resolvedUri: row.resolvedUri,
            description: row.description,
            enabled: row.enabled
        })),
        [
            {
                name: 'Passives',
                type: 'KiCad',
                uri: '${KIPRJMOD}/libs/Passives.pretty',
                resolvedUri: 'demo/libs/Passives.pretty',
                description: 'passive footprints',
                enabled: true
            },
            {
                name: 'Disabled',
                type: 'KiCad',
                uri: '${KIPRJMOD}/libs/Disabled.pretty',
                resolvedUri: 'demo/libs/Disabled.pretty',
                description: '',
                enabled: false
            }
        ]
    )
})

test('KicadLibraryTableParser parses KiCad symbol library tables through the facade', () => {
    const model = KicadParser.parseArrayBufferToRendererModel(
        'sym-lib-table',
        strToU8(symbolTableSource())
    )

    assert.equal(model.kind, 'library-table')
    assert.equal(model.fileType, 'sym_lib_table')
    assert.equal(model.tableType, 'symbol')
    assert.equal(model.rows[0].name, 'Device')
    assert.equal(model.rows[0].uri, '${KIPRJMOD}/libs/Device.kicad_sym')
})

test('KicadLibraryIndexBuilder builds a searchable manifest for table rows and library folders', () => {
    const index = KicadLibraryIndexBuilder.build(libraryEntries(), {
        variables: { KIPRJMOD: 'demo' }
    })

    assert.equal(index.kind, 'library-index')
    assert.deepEqual(index.summary, {
        title: 'KiCad library index',
        libraryCount: 4,
        tableCount: 2,
        footprintCount: 1,
        symbolCount: 2,
        designBlockCount: 0
    })
    assert.deepEqual(
        index.libraries.map((library) => ({
            name: library.name,
            kind: library.kind,
            path: library.path,
            itemCount: library.itemCount
        })),
        [
            {
                name: 'Passives',
                kind: 'footprint',
                path: 'demo/libs/Passives.pretty',
                itemCount: 1
            },
            {
                name: 'Device',
                kind: 'symbol',
                path: 'demo/libs/Device.kicad_sym',
                itemCount: 1
            },
            {
                name: 'Power',
                kind: 'symbol',
                path: 'demo/libs/Power.kicad_symdir',
                itemCount: 1
            },
            {
                name: 'External',
                kind: 'symbol',
                path: '${KICAD_SYMBOL_DIR}/External.kicad_sym',
                itemCount: 0
            }
        ]
    )
    assert.deepEqual(
        index.items.map((item) => ({
            libraryName: item.libraryName,
            kind: item.kind,
            name: item.name,
            fileName: item.fileName
        })),
        [
            {
                libraryName: 'Passives',
                kind: 'footprint',
                name: 'R_0603',
                fileName: 'demo/libs/Passives.pretty/R_0603.kicad_mod'
            },
            {
                libraryName: 'Device',
                kind: 'symbol',
                name: 'Device:R',
                fileName: 'demo/libs/Device.kicad_sym'
            },
            {
                libraryName: 'Power',
                kind: 'symbol',
                name: 'Power:PWR_FLAG',
                fileName: 'demo/libs/Power.kicad_symdir/PWR_FLAG.kicad_sym'
            }
        ]
    )
})

test('KicadProjectLoader includes KiCad library manifests from project archives', async () => {
    const result = await KicadProjectLoader.loadEntries([
        {
            name: 'demo/demo.kicad_pro',
            bytes: strToU8('{"meta":{"version":1}}')
        },
        {
            name: 'demo/demo.kicad_pcb',
            bytes: strToU8(boardSource())
        },
        ...libraryEntries()
    ])

    assert.equal(result.libraries.summary.footprintCount, 1)
    assert.equal(result.libraries.summary.symbolCount, 2)
    assert.equal(result.project.libraryCount, 4)
    assert.equal(result.project.libraryItemCount, 3)
})

test('KicadLibraryIndexBuilder includes design block library folders', () => {
    const index = KicadLibraryIndexBuilder.build([
        ...libraryEntries(),
        {
            name: 'demo/blocks.kicad_blocks/Power.kicad_block/block.json',
            bytes: strToU8(
                JSON.stringify({
                    name: 'Power',
                    description: 'Fake power block'
                })
            )
        },
        {
            name: 'demo/blocks.kicad_blocks/Power.kicad_block/Power.kicad_sch',
            bytes: strToU8('(kicad_sch (version 20250114))')
        }
    ])

    assert.equal(index.summary.designBlockCount, 1)
    assert.deepEqual(
        index.items
            .filter((item) => item.kind === 'design-block')
            .map((item) => ({
                libraryName: item.libraryName,
                name: item.name,
                fileName: item.fileName
            })),
        [
            {
                libraryName: 'blocks',
                name: 'Power',
                fileName: 'demo/blocks.kicad_blocks/Power.kicad_block'
            }
        ]
    )
})

/**
 * Builds a fake KiCad footprint table.
 * @returns {string}
 */
function footprintTableSource() {
    return `(fp_lib_table
        (version 7)
        (lib
            (name "Passives")
            (type "KiCad")
            (uri "\${KIPRJMOD}/libs/Passives.pretty")
            (options "")
            (descr "passive footprints")
        )
        (lib
            (name "Disabled")
            (type "KiCad")
            (uri "\${KIPRJMOD}/libs/Disabled.pretty")
            (options "")
            (descr "")
            (disabled)
        )
    )`
}

/**
 * Builds a fake KiCad symbol table.
 * @returns {string}
 */
function symbolTableSource() {
    return `(sym_lib_table
        (lib
            (name "Device")
            (type "KiCad")
            (uri "\${KIPRJMOD}/libs/Device.kicad_sym")
            (options "exclude_from_bom=true|visible")
            (descr "packed symbols")
        )
        (lib
            (name "External")
            (type "KiCad")
            (uri "\${KICAD_SYMBOL_DIR}/External.kicad_sym")
            (options "")
            (descr "")
        )
    )`
}

/**
 * Builds fake project library entries.
 * @returns {{ name: string, bytes: Uint8Array }[]}
 */
function libraryEntries() {
    return [
        {
            name: 'demo/fp-lib-table',
            bytes: strToU8(footprintTableSource())
        },
        {
            name: 'demo/sym-lib-table',
            bytes: strToU8(symbolTableSource())
        },
        {
            name: 'demo/libs/Passives.pretty/R_0603.kicad_mod',
            bytes: strToU8(footprintSource())
        },
        {
            name: 'demo/libs/Device.kicad_sym',
            bytes: strToU8(symbolLibrarySource('Device:R'))
        },
        {
            name: 'demo/libs/Power.kicad_symdir/PWR_FLAG.kicad_sym',
            bytes: strToU8(symbolLibrarySource('Power:PWR_FLAG'))
        }
    ]
}

/**
 * Builds a fake standalone footprint source.
 * @returns {string}
 */
function footprintSource() {
    return `(footprint "Passives:R_0603"
        (version 20240108)
        (generator "kicad-toolkit-test")
        (layer "F.Cu")
        (property "Reference" "REF**" (at 0 0 0) (layer "F.SilkS"))
        (property "Value" "R_0603" (at 0 1 0) (layer "F.Fab"))
        (pad "1" smd rect (at -0.5 0 0) (size 0.6 0.8) (layers "F.Cu"))
    )`
}

/**
 * Builds a fake symbol library source with one symbol.
 * @param {string} symbolName Symbol name.
 * @returns {string}
 */
function symbolLibrarySource(symbolName) {
    return `(kicad_symbol_lib
        (version 20231120)
        (generator "kicad-toolkit-test")
        (symbol "${symbolName}"
            (property "Reference" "U" (at 0 0 0))
            (pin passive line
                (at 0 0 0)
                (length 2.54)
                (name "~")
                (number "1")
            )
        )
    )`
}

/**
 * Builds a minimal board source.
 * @returns {string}
 */
function boardSource() {
    return `(kicad_pcb
        (version 20241229)
        (title_block (title "Demo Board"))
        (gr_poly
            (pts (xy 0 0) (xy 10 0) (xy 10 10) (xy 0 10))
            (stroke (width 0.15) (type solid))
            (fill no)
            (layer "Edge.Cuts")
        )
    )`
}
