// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadSchematicGeometryReadinessReportBuilder } from './KicadSchematicGeometryReadinessReportBuilder.mjs'

/**
 * Attaches deterministic schematic read-model sidecars to parsed documents.
 */
export class SchematicSidecarBuilder {
    /**
     * Attaches schematic sidecars.
     * @param {object} schematic Normalized schematic model.
     * @returns {object}
     */
    static attach(schematic) {
        schematic.geometryReadiness =
            KicadSchematicGeometryReadinessReportBuilder.build(schematic)
        return schematic
    }
}
