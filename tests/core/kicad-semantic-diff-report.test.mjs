// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadSemanticDiffReportBuilder } from '../../src/legacy-parser.mjs'

test('KicadSemanticDiffReportBuilder normalizes volatile S-expression fields', () => {
    const report = KicadSemanticDiffReportBuilder.build({
        leftLabel: 'generated',
        rightLabel: 'reference',
        leftEntries: [
            entry(
                'same.kicad_pcb',
                `(kicad_pcb
                    (version 20240108)
                    (generator "generator-a")
                    (generator_version "1.0")
                    (uuid "11111111-1111-1111-1111-111111111111")
                    (gr_line (start 0 0) (end 1 1) (layer "F.SilkS") (uuid "22222222-2222-2222-2222-222222222222"))
                )`
            ),
            entry(
                'changed.kicad_sym',
                `(kicad_symbol_lib (version 20240108) (symbol "Widget" (property "Value" "A")))`
            ),
            entry('left-only.kicad_mod', `(footprint "LeftOnly")`)
        ],
        rightEntries: [
            entry(
                'same.kicad_pcb',
                `(kicad_pcb
                    (version 20251231)
                    (generator "generator-b")
                    (generator_version "2.0")
                    (uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
                    (gr_line (start 0 0) (end 1 1) (layer "F.SilkS") (uuid "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"))
                )`
            ),
            entry(
                'changed.kicad_sym',
                `(kicad_symbol_lib (version 20240108) (symbol "Widget" (property "Value" "B")))`
            ),
            entry('right-only.kicad_mod', `(footprint "RightOnly")`)
        ]
    })

    assert.equal(report.schema, 'kicad-toolkit.semantic-diff.a1')
    assert.equal(report.pass, false)
    assert.deepEqual(report.summary, {
        entryCount: 4,
        identicalCount: 1,
        differentCount: 1,
        onlyInLeftCount: 1,
        onlyInRightCount: 1,
        diagnosticCount: 0,
        differenceCount: 3
    })
    assert.deepEqual(
        report.entries.map((row) => [row.path, row.status]),
        [
            ['changed.kicad_sym', 'different'],
            ['left-only.kicad_mod', 'only-in-left'],
            ['right-only.kicad_mod', 'only-in-right'],
            ['same.kicad_pcb', 'identical']
        ]
    )
    assert.equal(
        report.entries.find((row) => row.path === 'same.kicad_pcb')
            ?.normalizationKind,
        'sexpr'
    )
    assert.equal(
        report.entries.find((row) => row.path === 'changed.kicad_sym')
            ?.differences[0].left,
        '(kicad_symbol_lib (version __VERSION__) (symbol "Widget" (property "Value" "A")))'
    )
})

test('KicadSemanticDiffReportBuilder normalizes volatile project JSON fields', () => {
    const report = KicadSemanticDiffReportBuilder.compareText({
        path: 'demo.kicad_pro',
        leftText: JSON.stringify({
            head: {
                generator: 'first',
                generator_version: '1',
                created: '2026-01-01T00:00:00.000Z',
                modified: '2026-01-02T00:00:00.000Z',
                project_name: 'demo'
            },
            boards: ['demo.kicad_pcb'],
            sheets: [['random-left', 'Root']]
        }),
        rightText: JSON.stringify({
            head: {
                generator: 'second',
                generator_version: '2',
                created: '2026-05-01T00:00:00.000Z',
                modified: '2026-05-02T00:00:00.000Z',
                project_name: 'demo'
            },
            boards: ['demo.kicad_pcb'],
            sheets: [['random-right', 'Root']]
        })
    })

    assert.equal(report.pass, true)
    assert.deepEqual(report.summary, {
        entryCount: 1,
        identicalCount: 1,
        differentCount: 0,
        onlyInLeftCount: 0,
        onlyInRightCount: 0,
        diagnosticCount: 0,
        differenceCount: 0
    })
    assert.deepEqual(report.entries, [
        {
            path: 'demo.kicad_pro',
            status: 'identical',
            normalizationKind: 'json',
            leftLabel: 'left',
            rightLabel: 'right',
            differences: []
        }
    ])
})

/**
 * Builds one text entry for semantic diff tests.
 * @param {string} path Entry path.
 * @param {string} text Entry text.
 * @returns {{ path: string, bytes: Uint8Array }}
 */
function entry(path, text) {
    return {
        path,
        bytes: new TextEncoder().encode(text)
    }
}
