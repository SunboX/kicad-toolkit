// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { strToU8, zipSync } from 'fflate'
import {
    CircuitJsonKicadLibraryExporter,
    KicadPcmPackageQaReportBuilder,
    KicadPcmRepositoryIndexBuilder
} from '../../src/legacy-parser.mjs'

/**
 * Decodes one export entry as UTF-8 text.
 * @param {{ bytes: Uint8Array }} entry Export entry.
 * @returns {string}
 */
function decodeEntry(entry) {
    return new TextDecoder().decode(entry.bytes)
}

/**
 * Finds one export entry by archive path.
 * @param {{ entries: { path: string, bytes: Uint8Array }[] }} result Export result.
 * @param {string} path Archive path.
 * @returns {{ path: string, bytes: Uint8Array, contentType?: string }}
 */
function findEntry(result, path) {
    const entry = result.entries.find((candidate) => candidate.path === path)
    assert.ok(entry, 'Missing export entry: ' + path)
    return entry
}

/**
 * Builds a ZIP archive from package entries.
 * @param {{ path: string, bytes: Uint8Array }[]} entries Package entries.
 * @returns {Uint8Array}
 */
function zipEntries(entries) {
    return zipSync(
        Object.fromEntries(entries.map((entry) => [entry.path, entry.bytes]))
    )
}

/**
 * Builds a fake package export with a model entry.
 * @returns {{ entries: { path: string, bytes: Uint8Array, contentType: string }[] }}
 */
function packageExport() {
    return CircuitJsonKicadLibraryExporter.export(
        [
            ...packagedComponent('source_pkg_tool', 'pcb_pkg_tool', {
                symbolName: 'Widget',
                footprintName: 'Widget_SMD'
            })
        ],
        {
            libraryName: 'Bundle Parts',
            packageId: 'org.fake.bundle',
            packageName: 'Fake Bundle',
            packageVersion: '1.2.3',
            packageDescription: 'Reusable fake parts',
            packageDescriptionFull:
                'Reusable fake parts for package-manager installs.',
            packageAuthor: {
                name: 'Fake Author',
                contact: { web: 'https://example.invalid/author' }
            },
            packageMaintainer: {
                name: 'Fake Maintainer',
                contact: { web: 'https://example.invalid/maintainer' }
            },
            packageLicense: 'MIT',
            packageTags: ['fake', 'library'],
            pcmPackage: true,
            modelFiles: [
                {
                    name: 'widget.step',
                    sourcePath: 'models/widget.step',
                    bytes: new Uint8Array([4, 5, 6])
                }
            ]
        }
    )
}

test('KicadPcmRepositoryIndexBuilder builds repository and package index entries', () => {
    const libraryPackage = packageExport()
    const archiveBytes = zipEntries(libraryPackage.entries)
    const result = KicadPcmRepositoryIndexBuilder.build({
        name: 'Fake Library Repository',
        maintainer: {
            name: 'Repository Maintainer',
            contact: { web: 'https://example.invalid/repository' }
        },
        baseUrl: 'https://downloads.example.invalid/addons/',
        updateTimestamp: 1782518400,
        updateTimeUtc: '2026-06-27 00:00:00',
        packages: [
            {
                fileName: 'org.fake.bundle-1.2.3.zip',
                archiveBytes,
                entries: libraryPackage.entries
            }
        ]
    })
    const repository = JSON.parse(
        decodeEntry(findEntry(result, 'repository.json'))
    )
    const packages = JSON.parse(decodeEntry(findEntry(result, 'packages.json')))
    const packageIndexBytes = findEntry(result, 'packages.json').bytes
    const archiveSha = KicadPcmRepositoryIndexBuilder.sha256Hex(archiveBytes)

    assert.equal(result.schema, 'kicad-toolkit.pcm-repository-index.a1')
    assert.equal(
        KicadPcmRepositoryIndexBuilder.sha256Hex(strToU8('abc')),
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
    assert.deepEqual(
        result.entries.map((entry) => entry.path),
        ['packages.json', 'repository.json']
    )
    assert.deepEqual(
        result.archives.map((entry) => entry.path),
        ['org.fake.bundle-1.2.3.zip']
    )
    assert.equal(
        KicadPcmRepositoryIndexBuilder.previewResponse(result, '/').contentType,
        'application/json'
    )
    assert.equal(
        KicadPcmRepositoryIndexBuilder.previewResponse(
            result,
            '/org.fake.bundle-1.2.3.zip'
        ).contentType,
        'application/zip'
    )
    assert.equal(
        KicadPcmRepositoryIndexBuilder.previewResponse(result, '/missing.zip')
            .status,
        404
    )
    assert.equal(
        findEntry(result, 'repository.json').contentType,
        'application/json'
    )
    assert.equal(
        repository.$schema,
        'https://go.kicad.org/pcm/schemas/v2#/definitions/Repository'
    )
    assert.equal(repository.schema_version, 2)
    assert.equal(repository.name, 'Fake Library Repository')
    assert.deepEqual(repository.maintainer, {
        name: 'Repository Maintainer',
        contact: { web: 'https://example.invalid/repository' }
    })
    assert.deepEqual(repository.packages, {
        url: 'https://downloads.example.invalid/addons/packages.json',
        sha256: KicadPcmRepositoryIndexBuilder.sha256Hex(packageIndexBytes),
        update_time_utc: '2026-06-27 00:00:00',
        update_timestamp: 1782518400
    })
    assert.equal(result.diagnostics.length, 0)
    assert.equal(packages.packages.length, 1)
    assert.equal(packages.packages[0].identifier, 'org.fake.bundle')
    assert.equal(packages.packages[0].name, 'Fake Bundle')
    assert.equal(packages.packages[0].type, 'library')
    assert.equal(packages.packages[0].versions.length, 1)
    assert.deepEqual(packages.packages[0].versions[0], {
        version: '1.2.3',
        status: 'stable',
        kicad_version: '10.0',
        download_sha256: archiveSha,
        download_size: archiveBytes.byteLength,
        download_url:
            'https://downloads.example.invalid/addons/org.fake.bundle-1.2.3.zip',
        install_size: libraryPackage.entries.reduce(
            (total, entry) => total + entry.bytes.byteLength,
            0
        )
    })
})

test('KicadPcmPackageQaReportBuilder validates strict package entries', () => {
    const libraryPackage = packageExport()
    const report = KicadPcmPackageQaReportBuilder.build({
        entries: libraryPackage.entries,
        strictPackage: true
    })

    assert.equal(report.schema, 'kicad-toolkit.pcm-package-qa.a1')
    assert.equal(report.pass, true)
    assert.deepEqual(report.summary, {
        metadataPresent: true,
        symbolLibraryCount: 1,
        footprintCount: 1,
        modelEntryCount: 1,
        modelReferenceCount: 1,
        unresolvedModelReferenceCount: 0,
        diagnosticCount: 0
    })
    assert.equal(report.metadata.identifier, 'org.fake.bundle')
    assert.deepEqual(report.symbolLibraries, [
        {
            path: 'symbols/Bundle_Parts.kicad_sym',
            symbolCount: 1
        }
    ])
    assert.deepEqual(report.footprints, [
        {
            path: 'footprints/Bundle_Parts.pretty/Widget_SMD.kicad_mod',
            footprintName: 'Widget_SMD',
            modelReferences: [
                '${KICAD10_3RD_PARTY}/3dmodels/org_fake_bundle/Bundle_Parts.3dshapes/widget.step'
            ]
        }
    ])
    assert.deepEqual(report.diagnostics, [])
})

test('KicadPcmPackageQaReportBuilder reports package publishing blockers', () => {
    const libraryPackage = packageExport()
    const brokenEntries = [
        ...libraryPackage.entries.filter(
            (entry) => !entry.path.endsWith('.step')
        ),
        {
            path: 'fp-lib-table',
            bytes: strToU8('(fp_lib_table)'),
            contentType: 'application/x-kicad-library-table'
        }
    ]
    const report = KicadPcmPackageQaReportBuilder.build({
        entries: brokenEntries,
        strictPackage: true
    })

    assert.equal(report.pass, false)
    assert.equal(report.summary.unresolvedModelReferenceCount, 1)
    assert.deepEqual(
        report.diagnostics.map((diagnostic) => diagnostic.code),
        [
            'kicad-pcm-package.unwanted-library-table',
            'kicad-pcm-package.missing-model'
        ]
    )
    assert.equal(
        report.diagnostics.find(
            (diagnostic) =>
                diagnostic.code === 'kicad-pcm-package.missing-model'
        )?.modelReference,
        '${KICAD10_3RD_PARTY}/3dmodels/org_fake_bundle/Bundle_Parts.3dshapes/widget.step'
    )
})

/**
 * Builds source and PCB rows with package metadata.
 * @param {string} sourceId Source component id.
 * @param {string} pcbId PCB component id.
 * @param {object} options Metadata options.
 * @returns {object[]}
 */
function packagedComponent(sourceId, pcbId, options) {
    return [
        {
            type: 'source_component',
            source_component_id: sourceId,
            name: options.symbolName,
            metadata: {
                kicad_symbol: {
                    name: options.symbolName
                },
                kicad_footprint: {
                    name: options.footprintName
                }
            }
        },
        {
            type: 'pcb_component',
            pcb_component_id: pcbId,
            source_component_id: sourceId,
            center: { x: 0, y: 0 },
            layer: 'top'
        },
        {
            type: 'pcb_smtpad',
            pcb_smtpad_id: pcbId + '_pad_1',
            pcb_component_id: pcbId,
            shape: 'rect',
            x: 0,
            y: 0,
            width: 1,
            height: 1
        }
    ]
}
