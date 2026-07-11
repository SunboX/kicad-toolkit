// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { ExampleServer } from '../examples/server.mjs'
import { NormalizedModelSchema } from '../src/legacy-parser.mjs'

const root = new URL('../', import.meta.url)

/**
 * Checks whether a project-relative file exists.
 * @param {string} relativePath
 * @returns {Promise<boolean>}
 */
async function exists(relativePath) {
    try {
        await access(new URL(relativePath, root), constants.F_OK)
        return true
    } catch {
        return false
    }
}

/**
 * Verifies mandatory library files.
 */
test('required project files exist', async () => {
    const required = [
        'README.md',
        'AGENTS.md',
        'LICENSE',
        'LICENSES/GPL-3.0-or-later.txt',
        'LICENSES/CC-BY-SA-4.0.txt',
        'COMMERCIAL-LICENSE.md',
        'NOTICE.md',
        'CONTRIBUTING.md',
        'REUSE.toml',
        'package.json',
        'spec/library-scope.md',
        'docs/api.md',
        'docs/capabilities.md',
        'docs/migration.md',
        'docs/model-format.md',
        'docs/native-api.md',
        'docs/native-capabilities.md',
        'docs/native-model-format.md',
        'docs/release-notes-v1.1.0.md',
        'docs/release-notes-v1.1.1.md',
        'docs/release-notes-v1.1.2.md',
        'docs/release-notes-v1.1.3.md',
        'docs/schemas/kicad_toolkit/normalized_model_a1.schema.json',
        'docs/schemas/kicad_toolkit/project_bundle_a1.schema.json',
        'docs/schemas/kicad_toolkit/netlist_a1.schema.json',
        'docs/schemas/kicad_toolkit/schematic_svg_semantics_a1.schema.json',
        'docs/schemas/kicad_toolkit/schematic_render_ops_a1.schema.json',
        'docs/schemas/kicad_toolkit/schematic_geometry_readiness_a1.schema.json',
        'docs/schemas/kicad_toolkit/pcb_svg_semantics_a1.schema.json',
        'docs/schemas/kicad_toolkit/ci_artifact_bundle_a1.schema.json',
        'docs/schemas/kicad_toolkit/contract_gate_a1.schema.json',
        'docs/schemas/kicad_toolkit/project_document_graph_a1.schema.json',
        'docs/schemas/kicad_toolkit/project_expected_artifacts_a1.schema.json',
        'docs/schemas/kicad_toolkit/project_output_digest_a1.schema.json',
        'docs/schemas/kicad_toolkit/svg_model_cross_link_a1.schema.json',
        'docs/schemas/kicad_toolkit/parser_compatibility_fuzz_a1.schema.json',
        'docs/schemas/kicad_toolkit/source_coverage_a1.schema.json',
        'docs/schemas/kicad_toolkit/pcb_route_analysis_a1.schema.json',
        'docs/schemas/kicad_toolkit/pcb_rule_read_model_a1.schema.json',
        'docs/schemas/kicad_toolkit/pcb_rigid_flex_topology_a1.schema.json',
        'docs/schemas/kicad_toolkit/pcb_statistics_a1.schema.json',
        'docs/schemas/kicad_toolkit/pcb_3d_model_readiness_a1.schema.json',
        'docs/schemas/kicad_toolkit/pcb_fidelity_diagnostics_a1.schema.json',
        'docs/schemas/kicad_toolkit/pcb_geometry_readiness_a1.schema.json',
        'docs/schemas/kicad_toolkit/pcb_layer_stack_a1.schema.json',
        'docs/schemas/kicad_toolkit/pcb_layer_usage_a1.schema.json',
        'docs/schemas/kicad_toolkit/pcb_dimensions_a1.schema.json',
        'docs/schemas/kicad_toolkit/pcb_region_semantics_a1.schema.json',
        'docs/schemas/kicad_toolkit/pcb_ownership_graph_a1.schema.json',
        'docs/schemas/kicad_toolkit/schematic_ownership_graph_a1.schema.json',
        'docs/schemas/kicad_toolkit/schematic_hierarchy_graph_a1.schema.json',
        'docs/schemas/kicad_toolkit/project_bom_pnp_reconciliation_a1.schema.json',
        'docs/schemas/kicad_toolkit/library_qa_a1.schema.json',
        'docs/schemas/kicad_toolkit/library_merge_plan_a1.schema.json',
        'docs/schemas/kicad_toolkit/pcm_repository_index_a1.schema.json',
        'docs/schemas/kicad_toolkit/pcm_package_qa_a1.schema.json',
        'docs/schemas/kicad_toolkit/semantic_diff_a1.schema.json',
        'docs/schemas/kicad_toolkit/schematic_qa_a1.schema.json',
        'docs/testing.md',
        'examples/server.mjs',
        'examples/rp2040-minimal-design/index.html',
        'examples/rp2040-minimal-design/example.mjs',
        'examples/rp2040-minimal-design/styles.css',
        'src/extensions.mjs',
        'src/legacy-parser.mjs',
        'src/legacy-renderers.mjs',
        'src/styles/kicad-renderers.css',
        'src/core/kicad/Geometry.mjs',
        'src/core/kicad/KicadAuxiliaryParserRouter.mjs',
        'src/core/kicad/KicadDesignBlockLibraryParser.mjs',
        'src/core/kicad/KicadDesignRulesParser.mjs',
        'src/core/kicad/KicadEmbeddedAssetInventoryBuilder.mjs',
        'src/core/kicad/KicadContractGateReportBuilder.mjs',
        'src/core/kicad/KicadFootprintAssociationParser.mjs',
        'src/core/kicad/KicadFootprintLibraryParser.mjs',
        'src/core/kicad/KicadJobsetDigestBuilder.mjs',
        'src/core/kicad/KicadJobsetParser.mjs',
        'src/core/kicad/KicadLayerResolver.mjs',
        'src/core/kicad/KicadLegacyLibraryParser.mjs',
        'src/core/kicad/KicadLibraryIndexBuilder.mjs',
        'src/core/kicad/KicadLibraryQaReportBuilder.mjs',
        'src/core/kicad/KicadLibraryRenderManifestBuilder.mjs',
        'src/core/kicad/KicadLibrarySearchIndex.mjs',
        'src/core/kicad/KicadLibraryTableParser.mjs',
        'src/core/kicad/KicadNetlistParser.mjs',
        'src/core/kicad/KicadPcbComponentParticipationPolicy.mjs',
        'src/core/kicad/KicadPcb3dModelReadinessReportBuilder.mjs',
        'src/core/kicad/KicadPcbDimensionReadModelBuilder.mjs',
        'src/core/kicad/KicadPcbFidelityDiagnosticsBuilder.mjs',
        'src/core/kicad/KicadPcbGeometryReadinessReportBuilder.mjs',
        'src/core/kicad/KicadPcbLayerStackReadModelBuilder.mjs',
        'src/core/kicad/KicadPcbLayerUsageReportBuilder.mjs',
        'src/core/kicad/KicadPcbParser.mjs',
        'src/core/kicad/KicadPcbRegionSemanticsBuilder.mjs',
        'src/core/kicad/KicadPcbRigidFlexTopologyBuilder.mjs',
        'src/core/kicad/KicadPcbRuleReadModelBuilder.mjs',
        'src/core/kicad/KicadPcbReviewDrillMetadataBuilder.mjs',
        'src/core/kicad/KicadPcbReviewPolygonRealizationBuilder.mjs',
        'src/core/kicad/KicadPcbReviewRouteHighlightProfileBuilder.mjs',
        'src/core/kicad/KicadPcbTextBoxMetadata.mjs',
        'src/core/kicad/KicadProjectBomPnpReconciliationBuilder.mjs',
        'src/core/kicad/KicadProjectOutputDigestBuilder.mjs',
        'src/core/kicad/KicadProjectLoader.mjs',
        'src/core/kicad/KicadProjectMetadataParser.mjs',
        'src/core/kicad/KicadFeatureParity.mjs',
        'src/core/kicad/KicadSchematicConnectivityQaBuilder.mjs',
        'src/core/kicad/KicadSchematicGeometryReadinessReportBuilder.mjs',
        'src/core/kicad/KicadSchematicOwnershipGraphBuilder.mjs',
        'src/core/kicad/KicadSchematicQaReportBuilder.mjs',
        'src/core/kicad/KicadSemanticDiffReportBuilder.mjs',
        'src/core/kicad/KicadSourceCoverageReportBuilder.mjs',
        'src/core/kicad/KicadSymbolLibraryParser.mjs',
        'src/core/kicad/ProjectDesignBundleBuilder.mjs',
        'src/core/kicad/ProjectNetlistExporter.mjs',
        'src/core/kicad/ProjectVariantViewBuilder.mjs',
        'src/core/kicad/SExpressionParser.mjs',
        'src/core/kicad/KicadWorksheetParser.mjs',
        'src/ui/KicadStrokeFont.mjs',
        'src/ui/SchematicRenderOpsSidecarBuilder.mjs',
        'src/PcbScene3dTextBoxLayoutResolver.mjs',
        'src/ui/PcbSvgRenderer.mjs',
        'tests/core/kicad-pcb-parser.test.mjs',
        'tests/core/kicad-auxiliary-file-parsers.test.mjs',
        'tests/core/kicad-library-index.test.mjs',
        'tests/core/kicad-library-parsers.test.mjs',
        'tests/core/kicad-parity-helper-apis.test.mjs',
        'tests/core/kicad-final-parity-read-models.test.mjs',
        'tests/core/kicad-project-loader.test.mjs',
        'tests/core/kicad-sexpression-parser.test.mjs',
        'tests/ui/pcb-svg-renderer.test.mjs',
        'tests/ui/pcb-svg-renderer-pad-strokes.test.mjs',
        'tests/api-entrypoints.test.mjs',
        'tests/package-layout.test.mjs',
        'tests/project-structure.test.mjs',
        'tests/mjs-line-limit.test.mjs',
        'tests/fixtures/minimal.kicad_pcb'
    ]

    for (const relativePath of required) {
        assert.equal(
            await exists(relativePath),
            true,
            'Missing file: ' + relativePath
        )
    }
})

/**
 * Verifies the RP2040 example credits and fetches the source board at runtime.
 */
test('RP2040 example credits and fetches the public source board', async () => {
    const html = await readFile(
        new URL('examples/rp2040-minimal-design/index.html', root),
        'utf8'
    )
    const source = await readFile(
        new URL('examples/rp2040-minimal-design/example.mjs', root),
        'utf8'
    )

    assert.match(
        html,
        /https:\/\/github\.com\/tommy-gilligan\/RP2040-minimal-design/
    )
    assert.match(html, /Tommy Gilligan/)
    assert.match(html, /BSD 3-Clause/)
    assert.match(
        source,
        /https:\/\/raw\.githubusercontent\.com\/tommy-gilligan\/RP2040-minimal-design\/main\/RP2040_minimal\.kicad_pcb/
    )
})

/**
 * Verifies the default example route opens the RP2040 GitHub-loaded board.
 */
test('example server defaults to the RP2040 Minimal Design example', async () => {
    const resolvedPath = await ExampleServer.resolveRequestPath(
        fileURLToPath(root),
        '/'
    )

    assert.equal(
        resolvedPath.endsWith('examples/rp2040-minimal-design/index.html'),
        true
    )
})

/**
 * Verifies the root route redirects to the default example directory.
 */
test('example server redirects root requests to the default example URL', async () => {
    const { server, host, port } = await ExampleServer.start({
        port: 0,
        logger: { log() {} }
    })

    try {
        const response = await fetch('http://' + host + ':' + port + '/', {
            redirect: 'manual'
        })

        assert.equal(response.status, 302)
        assert.equal(
            response.headers.get('location'),
            '/examples/rp2040-minimal-design/'
        )
    } finally {
        await new Promise((resolveClose, rejectClose) => {
            server.close((error) => {
                if (error) rejectClose(error)
                else resolveClose()
            })
        })
    }
})

/**
 * Verifies browser examples resolve package dependencies without bundling.
 */
test('browser extension examples map their bare package dependencies', async () => {
    const exampleSlugs = ['rp2040-minimal-design']

    for (const slug of exampleSlugs) {
        const html = await readFile(
            new URL('examples/' + slug + '/index.html', root),
            'utf8'
        )
        const source = await readFile(
            new URL('examples/' + slug + '/example.mjs', root),
            'utf8'
        )

        if (!source.includes('../../src/extensions.mjs')) continue

        assert.match(
            html,
            /"fflate":\s*"\.\.\/\.\.\/node_modules\/fflate\/esm\/browser\.js"/,
            slug + ' must provide a browser import map for fflate'
        )
        assert.match(
            html,
            /"circuitjson-toolkit\/extensions":\s*"\.\.\/\.\.\/node_modules\/circuitjson-toolkit\/src\/extensions\.mjs"/,
            slug + ' must map the shared browser extension entrypoint'
        )
    }
})

/**
 * Verifies browser examples do not trigger missing favicon requests.
 */
test('browser examples define inline favicons', async () => {
    const exampleSlugs = ['rp2040-minimal-design']

    for (const slug of exampleSlugs) {
        const html = await readFile(
            new URL('examples/' + slug + '/index.html', root),
            'utf8'
        )

        assert.match(
            html,
            /rel="icon"/,
            slug + ' must define an inline favicon'
        )
    }
})

/**
 * Verifies package metadata follows the SunboX dual-license policy.
 */
test('package declares GPL and commercial licensing notices', async () => {
    const pkg = JSON.parse(
        await readFile(new URL('package.json', root), 'utf8')
    )
    const readme = await readFile(new URL('README.md', root), 'utf8')
    const commercial = await readFile(
        new URL('COMMERCIAL-LICENSE.md', root),
        'utf8'
    )
    const notice = await readFile(new URL('NOTICE.md', root), 'utf8')
    const contributing = await readFile(
        new URL('CONTRIBUTING.md', root),
        'utf8'
    )

    assert.equal(pkg.name, 'kicad-toolkit')
    assert.equal(pkg.license, 'GPL-3.0-or-later')
    assert.match(readme, /GPL-3\.0-or-later/)
    assert.match(readme, /CC-BY-SA-4\.0/)
    assert.match(readme, /Commercial licensing contact/)
    assert.match(commercial, /not itself a commercial license grant/)
    assert.match(notice, /https:\/\/github\.com\/SunboX\/kicad-toolkit/)
    assert.match(contributing, /commercial\/proprietary license offerings/)
})

/**
 * Verifies public exports mirror the Altium Toolkit entrypoint shape.
 */
test('package exposes common and native extension entrypoints', async () => {
    const pkg = JSON.parse(
        await readFile(new URL('package.json', root), 'utf8')
    )

    assert.equal(pkg.exports['.'], './src/index.mjs')
    assert.equal(pkg.exports['./parser'], './src/parser.mjs')
    assert.equal(pkg.exports['./project'], './src/project.mjs')
    assert.equal(pkg.exports['./renderers'], './src/renderers.mjs')
    assert.equal(pkg.exports['./scene3d'], './src/scene3d.mjs')
    assert.equal(pkg.exports['./extensions'], './src/extensions.mjs')
    assert.equal(pkg.exports['./extensions/node'], './src/legacy-node.mjs')
    assert.equal(
        pkg.exports['./extensions/workers/kicad-parser.worker.mjs'],
        './src/workers/kicad-parser.worker.mjs'
    )
    assert.equal(
        pkg.exports['./extensions/styles/kicad-renderers.css'],
        './src/styles/kicad-renderers.css'
    )
})

/**
 * Verifies the common and native API references document their public paths.
 */
test('API docs describe common and native KiCad entrypoints', async () => {
    const apiDocs = await readFile(new URL('docs/api.md', root), 'utf8')
    const nativeApiDocs = await readFile(
        new URL('docs/native-api.md', root),
        'utf8'
    )

    assert.match(apiDocs, /CircuitJsonDocumentContext/)
    assert.match(apiDocs, /Parser\.parseAsync/)
    assert.match(apiDocs, /ProjectLoader\.loadAsync/)
    assert.match(apiDocs, /kicad-toolkit\/scene3d/)
    assert.match(apiDocs, /kicad-toolkit\/workers\/parser\.worker\.mjs/)
    assert.match(apiDocs, /PcbScene3dPreparator/)
    assert.match(apiDocs, /kicad-toolkit\/extensions/)

    assert.match(nativeApiDocs, /NormalizedModelSchema/)
    assert.match(nativeApiDocs, /preparePcbSideResolvedRenderModel/)
    assert.match(nativeApiDocs, /PcbScene3dPackages/)
    assert.match(nativeApiDocs, /KicadToolkitCapabilities/)
    assert.match(nativeApiDocs, /KicadFeatureParity/)
    assert.match(nativeApiDocs, /KicadReadinessReport/)
    assert.match(nativeApiDocs, /KicadProjectMetadataParser/)
    assert.match(nativeApiDocs, /KicadProjectDocumentGraphBuilder/)
    assert.match(nativeApiDocs, /KicadCiArtifactBundleBuilder/)
    assert.match(nativeApiDocs, /KicadSvgModelCrossLinkValidator/)
    assert.match(nativeApiDocs, /KicadParserCompatibilityFuzzer/)
    assert.match(nativeApiDocs, /KicadPcbRouteAnalysisBuilder/)
    assert.match(nativeApiDocs, /KicadPcbStatisticsBuilder/)
    assert.match(nativeApiDocs, /KicadPcbPickPlacePositionResolver/)
    assert.match(nativeApiDocs, /KicadPcbOwnershipGraphBuilder/)
    assert.match(nativeApiDocs, /KicadSchematicHierarchyGraphBuilder/)
    assert.match(nativeApiDocs, /KicadSvgUtils/)
    assert.match(nativeApiDocs, /PcbArcUtils/)
    assert.match(nativeApiDocs, /PcbFootprintPrimitiveSelector/)
    assert.match(nativeApiDocs, /PcbSvgSemanticMetadata/)
    assert.match(nativeApiDocs, /SchematicColorResolver/)
    assert.match(nativeApiDocs, /SchematicProjectParameterResolver/)
    assert.match(nativeApiDocs, /SchematicSvgUtils/)
    assert.match(nativeApiDocs, /SchematicSvgTextMetrics/)
    assert.match(nativeApiDocs, /SchematicTypography/)
    assert.match(nativeApiDocs, /ProjectDesignBundleBuilder/)
    assert.match(nativeApiDocs, /ProjectNetlistExporter/)
})

/**
 * Verifies the normalized model schema is documented like Altium Toolkit.
 */
test('model docs publish the normalized model JSON schema contract', async () => {
    const readme = await readFile(new URL('README.md', root), 'utf8')
    const modelDocs = await readFile(
        new URL('docs/model-format.md', root),
        'utf8'
    )
    const nativeModelDocs = await readFile(
        new URL('docs/native-model-format.md', root),
        'utf8'
    )
    const capabilityDocs = await readFile(
        new URL('docs/capabilities.md', root),
        'utf8'
    )
    const nativeCapabilityDocs = await readFile(
        new URL('docs/native-capabilities.md', root),
        'utf8'
    )
    const packageConfig = JSON.parse(
        await readFile(new URL('package.json', root), 'utf8')
    )
    const schema = JSON.parse(
        await readFile(
            new URL(
                'docs/schemas/kicad_toolkit/normalized_model_a1.schema.json',
                root
            ),
            'utf8'
        )
    )

    assert.match(readme, /Normalized Model Schema/)
    assert.match(readme, /Capabilities/)
    assert.match(modelDocs, /ecad-toolkit\.document\.v1/)
    assert.match(modelDocs, /dense CircuitJSON array/)
    assert.match(modelDocs, /Native Model Format/)
    assert.match(nativeModelDocs, /Schema Contracts/)
    assert.match(nativeModelDocs, /Helper Report Fields/)
    assert.match(capabilityDocs, /ToolkitCapabilities\.inventory/)
    assert.match(capabilityDocs, /shared CircuitJSON services/)
    assert.match(nativeCapabilityDocs, /Capability Inventory/)
    assert.match(nativeCapabilityDocs, /Feature Parity Inventory/)
    assert.match(nativeCapabilityDocs, /Source-Format Exemptions/)
    assert.match(nativeCapabilityDocs, /Fabrication Readiness/)
    assert.equal(schema.$id, NormalizedModelSchema.CURRENT_SCHEMA_ID)
    assert.equal(schema.properties.schema.const, schema.$id)
    assert.deepEqual(schema.properties.kind.enum, [
        'schematic',
        'pcb',
        'footprint-library',
        'symbol-library',
        'library-table',
        'library-index',
        'project-metadata',
        'design-bundle',
        'jobset',
        'jobset-digest',
        'design-rules',
        'worksheet',
        'netlist',
        'footprint-associations',
        'design-block-library',
        'legacy-library',
        'asset-inventory'
    ])
    assert.deepEqual(schema.properties.fileType.enum, [
        'kicad_sch',
        'kicad_pcb',
        'kicad_mod',
        'kicad_sym',
        'fp_lib_table',
        'sym_lib_table',
        'KicadLibraryIndex',
        'kicad_pro',
        'KicadProjectDesignBundle',
        'kicad_jobset',
        'KicadJobsetDigest',
        'kicad_dru',
        'kicad_wks',
        'net',
        'cmp',
        'kicad_blocks',
        'lib',
        'dcm',
        'mod',
        'KicadAssetInventory'
    ])
    assert.ok(
        packageConfig.files.includes(
            'docs/schemas/kicad_toolkit/normalized_model_a1.schema.json'
        )
    )
    assert.ok(
        packageConfig.files.includes(
            'docs/schemas/kicad_toolkit/project_bundle_a1.schema.json'
        )
    )
    assert.ok(
        packageConfig.files.includes(
            'docs/schemas/kicad_toolkit/pcb_route_analysis_a1.schema.json'
        )
    )
    assert.ok(packageConfig.files.includes('docs/capabilities.md'))
})

/**
 * Verifies the test-relative repository root carries the package identity.
 */
test('project root identifies the kicad-toolkit package in any checkout', async () => {
    const pkg = JSON.parse(
        await readFile(new URL('package.json', root), 'utf8')
    )

    assert.equal(pkg.name, 'kicad-toolkit')
    assert.equal(
        new URL('tests/', root).href,
        new URL('./', import.meta.url).href
    )
})

/**
 * Verifies docs describe library rather than app responsibilities.
 */
test('documentation keeps host app behavior out of library scope', async () => {
    const scope = await readFile(new URL('spec/library-scope.md', root), 'utf8')
    const agents = await readFile(new URL('AGENTS.md', root), 'utf8')

    assert.match(scope, /Application state management/)
    assert.match(scope, /Out Of Scope/)
    assert.match(agents, /no file picker wiring/i)
    assert.doesNotMatch(
        scope,
        /WebMCP bridge and external app integrations.*In Scope/s
    )
})
