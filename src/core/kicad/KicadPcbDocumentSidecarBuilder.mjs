// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadPcbDimensionReadModelBuilder } from './KicadPcbDimensionReadModelBuilder.mjs'
import { KicadPcbLayerStackReadModelBuilder } from './KicadPcbLayerStackReadModelBuilder.mjs'
import { KicadPcbPlacedFootprintManifestBuilder } from './KicadPcbPlacedFootprintManifestBuilder.mjs'
import { KicadPcbRegionSemanticsBuilder } from './KicadPcbRegionSemanticsBuilder.mjs'
import { KicadPcbReviewMetadataBuilder } from './KicadPcbReviewMetadataBuilder.mjs'
import { KicadPcbRigidFlexTopologyBuilder } from './KicadPcbRigidFlexTopologyBuilder.mjs'
import { KicadPcbRouteAnalysisBuilder } from './KicadPcbRouteAnalysisBuilder.mjs'

/**
 * Attaches deterministic PCB read-model sidecars to parsed KiCad boards.
 */
export class KicadPcbDocumentSidecarBuilder {
    /**
     * Attaches route, review, and placed-footprint sidecars.
     * @param {object} pcb Normalized PCB model.
     * @param {{ fileName?: string }} [options] Sidecar options.
     * @returns {object}
     */
    static attach(pcb, options = {}) {
        const routeAnalysis = KicadPcbRouteAnalysisBuilder.build(pcb)

        pcb.layerStack = KicadPcbLayerStackReadModelBuilder.build(pcb)
        pcb.dimensions = KicadPcbDimensionReadModelBuilder.build(pcb)
        pcb.regionSemantics = KicadPcbRegionSemanticsBuilder.build(pcb)
        pcb.rigidFlexTopology = KicadPcbRigidFlexTopologyBuilder.build(pcb)
        pcb.routeAnalysis = routeAnalysis
        pcb.reviewMetadata = KicadPcbReviewMetadataBuilder.build({
            ...pcb,
            routeAnalysis
        })
        pcb.footprintExtractionManifest =
            KicadPcbPlacedFootprintManifestBuilder.build({
                fileName: options.fileName || '',
                pcb
            })

        return pcb
    }
}
