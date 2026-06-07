// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const schemaId = 'kicad-toolkit.pcb.rigid-flex-topology.a1'

/**
 * Builds KiCad PCB rigid-flex topology status reports.
 */
export class KicadPcbRigidFlexTopologyBuilder {
    /**
     * Builds a deterministic topology report from stackup and region sidecars.
     * @param {{ layerStack?: object, regionSemantics?: object, pcb?: object } | object} [input] Topology context.
     * @returns {object}
     */
    static build(input = {}) {
        const layerStack = input.layerStack || input.pcb?.layerStack || {}
        const regionSemantics =
            input.regionSemantics || input.pcb?.regionSemantics || {}
        const layers = layerStack.layers || []
        const boardRegions = regionSemantics.boardRegions || []
        const substackRegionJoins = substackRows(layers, boardRegions)
        const bendLines = bendLineRows(substackRegionJoins, boardRegions)
        const branchGraph = []
        const diagnostics = diagnosticsFor(boardRegions)

        return {
            schema: schemaId,
            summary: {
                topologyStatus: boardRegions.length
                    ? 'region-metadata-only'
                    : 'flat-stack',
                layerCount: layers.length,
                substackCount: substackRegionJoins.length,
                flexRegionCount: boardRegions.filter(
                    (region) => region.isFlexRegion === true
                ).length,
                rigidRegionCount: boardRegions.filter(
                    (region) => region.isRigidRegion === true
                ).length,
                branchCount: branchGraph.length,
                bendLineCount: bendLines.length,
                diagnosticCount: diagnostics.length
            },
            substackRegionJoins,
            branchGraph,
            bendLines,
            diagnostics
        }
    }
}

/**
 * Builds substack rows from KiCad region metadata.
 * @param {object[]} layers Stackup layer rows.
 * @param {object[]} boardRegions Board-region rows.
 * @returns {object[]}
 */
function substackRows(layers, boardRegions) {
    const layerKeys = layers.map((layer) => layer.layerKey).filter(Boolean)
    if (!boardRegions.length) {
        return [
            {
                substackId: 'flat-stack',
                substackName: 'Flat stack',
                isFlex: false,
                layerKeys,
                regionKeys: [],
                regionNames: []
            }
        ]
    }

    const rowsById = new Map()
    for (const region of boardRegions) {
        const substackId = String(region.layerStackId || 'region-stack')
        if (!rowsById.has(substackId)) {
            rowsById.set(substackId, {
                substackId,
                substackName: substackId,
                isFlex: false,
                layerKeys,
                regionKeys: [],
                regionNames: []
            })
        }
        const row = rowsById.get(substackId)
        row.isFlex = row.isFlex || region.isFlexRegion === true
        row.regionKeys.push(region.key)
        row.regionNames.push(region.name || region.key)
    }

    return [...rowsById.values()].sort((left, right) =>
        left.substackId.localeCompare(right.substackId)
    )
}

/**
 * Builds synthetic bend-line summary rows from region counts.
 * @param {object[]} substacks Substack rows.
 * @param {object[]} boardRegions Board-region rows.
 * @returns {object[]}
 */
function bendLineRows(substacks, boardRegions) {
    const substackById = new Map(
        substacks.map((substack) => [substack.substackId, substack])
    )
    return boardRegions.flatMap((region) => {
        const substackId = String(region.layerStackId || 'region-stack')
        const substack = substackById.get(substackId)
        return Array.from({
            length: Number(region.bendingLineCount || 0)
        }).map((_, lineIndex) => ({
            substackId,
            substackName: substack?.substackName || substackId,
            regionKey: region.key,
            regionName: region.name || region.key,
            lineIndex
        }))
    })
}

/**
 * Builds topology diagnostics.
 * @param {object[]} boardRegions Board-region rows.
 * @returns {object[]}
 */
function diagnosticsFor(boardRegions) {
    if (!boardRegions.length) {
        return [
            {
                code: 'kicad.pcb.rigid-flex.flat-stack',
                severity: 'info',
                message:
                    'KiCad PCB data exposes a flat stackup without rigid-flex region metadata.'
            }
        ]
    }

    return [
        {
            code: 'kicad.pcb.rigid-flex.no-branch-topology',
            severity: 'info',
            message:
                'KiCad PCB region metadata is present, but no Altium-style branch graph is available from parsed KiCad data.'
        }
    ]
}
