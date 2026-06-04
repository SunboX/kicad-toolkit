// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonModelAdapter } from '../circuit-json/CircuitJsonModelAdapter.mjs'
import { NormalizedModelSchema } from './NormalizedModelSchema.mjs'
import { ProjectVariantViewBuilder } from './ProjectVariantViewBuilder.mjs'

/**
 * Composes parsed KiCad project, schematic, and PCB models into one bundle.
 */
export class ProjectDesignBundleBuilder {
    /**
     * Builds a normalized KiCad project/design bundle from parsed models.
     * @param {{ projectModel?: object, documentModels?: object[], variantName?: string }} options Bundle options.
     * @returns {object}
     */
    static build(options = {}) {
        const projectModel = options.projectModel || {}
        const documentModels = resolveDocumentModels(options, projectModel)
        const project = projectModel.project || {}
        const schematicModels = documentModels.filter(
            (model) => model?.kind === 'schematic'
        )
        const pcbModels = documentModels.filter(
            (model) => model?.kind === 'pcb'
        )
        const sheets = ProjectDesignBundleBuilder.#buildSheets(
            schematicModels,
            project
        )
        const components = ProjectDesignBundleBuilder.#buildComponents(
            schematicModels,
            pcbModels
        )
        const pnp = ProjectDesignBundleBuilder.#buildPnp(pcbModels)
        const nets = ProjectDesignBundleBuilder.#buildNets(
            schematicModels,
            pcbModels
        )
        const bundle = NormalizedModelSchema.attach({
            kind: 'design-bundle',
            fileType: 'KicadProjectDesignBundle',
            sourceFormat: 'kicad',
            fileName: project.fileName || 'kicad-design-bundle.json',
            summary: {
                title:
                    project.name ||
                    projectModel.summary?.title ||
                    'KiCad design bundle',
                sheetCount: sheets.length,
                componentCount: components.length,
                netCount: nets.length,
                pnpCount: pnp.entries.length,
                variantCount: (project.variants || []).length
            },
            diagnostics: projectModel.diagnostics || [],
            project,
            variants: project.variants || [],
            sheets,
            components,
            schematic_hierarchy:
                ProjectDesignBundleBuilder.#buildSchematicHierarchy(project),
            pnp,
            nets,
            annotations: { mappings: [] },
            indexes: ProjectDesignBundleBuilder.#buildIndexes(
                sheets,
                components,
                nets,
                pnp
            ),
            bom: ProjectDesignBundleBuilder.#buildBom(documentModels)
        })

        if (options.variantName) {
            bundle.effectiveVariant = ProjectVariantViewBuilder.build(bundle, {
                variantName: options.variantName
            })
        }

        return bundle
    }

    /**
     * Builds schematic sheet bundle entries.
     * @param {object[]} schematicModels Parsed schematic models.
     * @param {object} project Project summary.
     * @returns {object[]}
     */
    static #buildSheets(schematicModels, project) {
        return schematicModels.map((model, index) => {
            const page = (project.pages || []).find(
                (entry) => entry.fileName === model.fileName
            )

            return {
                bundleIndex: index,
                fileName: model.fileName,
                title:
                    page?.title ||
                    model.summary?.title ||
                    model.schematic?.sheet?.title ||
                    model.fileName,
                path: page?.path || '',
                page: page?.page || '',
                root: page?.root === true,
                sheet: model.schematic?.sheet || {},
                componentCount: model.schematic?.components?.length || 0,
                netCount: model.schematic?.nets?.length || 0
            }
        })
    }

    /**
     * Builds component entries joined by designator.
     * @param {object[]} schematicModels Parsed schematic models.
     * @param {object[]} pcbModels Parsed PCB models.
     * @returns {object[]}
     */
    static #buildComponents(schematicModels, pcbModels) {
        const componentsByDesignator = new Map()

        for (const model of schematicModels) {
            for (const component of model.schematic?.components || []) {
                const entry = componentEntry(
                    componentsByDesignator,
                    component.designator
                )
                entry.schematic = schematicComponent(model, component)
                entry.doNotPopulate ||= isDnp(component)
                entry.excludeFromBom ||= component.excludeFromBom === true
            }
        }

        for (const model of pcbModels) {
            for (const component of model.pcb?.components || []) {
                const entry = componentEntry(
                    componentsByDesignator,
                    component.designator
                )
                entry.pcb = pcbComponent(model, component)
                entry.doNotPopulate ||= isDnp(component)
                entry.excludeFromBom ||= component.excludeFromBom === true
            }
        }

        return [...componentsByDesignator.values()].map((component, index) => ({
            bundleIndex: index,
            ...component
        }))
    }

    /**
     * Builds a combined pick-place model.
     * @param {object[]} pcbModels Parsed PCB models.
     * @returns {object}
     */
    static #buildPnp(pcbModels) {
        const entries = []
        let positionMode = ''

        for (const model of pcbModels) {
            const pnp = model.pnp || model.pcb?.pickPlace || {}
            positionMode ||= pnp.positionMode || ''
            for (const entry of pnp.entries || []) {
                entries.push({
                    bundleIndex: entries.length,
                    sourceFileName: model.fileName,
                    ...entry
                })
            }
        }

        return {
            positionMode,
            entries,
            modes: {}
        }
    }

    /**
     * Builds combined schematic and PCB net entries.
     * @param {object[]} schematicModels Parsed schematic models.
     * @param {object[]} pcbModels Parsed PCB models.
     * @returns {object[]}
     */
    static #buildNets(schematicModels, pcbModels) {
        const netsByName = new Map()

        for (const model of schematicModels) {
            const ownerDesignators = ownerDesignatorMap(
                model.schematic?.components || []
            )
            for (const net of model.schematic?.nets || []) {
                const entry = netEntry(netsByName, net.name)
                const pins = (net.pins || []).map((pin) =>
                    normalizePin(pin, ownerDesignators)
                )
                entry.schematic.push({
                    fileName: model.fileName,
                    pins,
                    labels: net.labels || [],
                    segments: net.segments || [],
                    ports: net.ports || [],
                    sheetEntries: net.sheetEntries || []
                })
                entry.pins.push(...pins)
            }
        }

        for (const model of pcbModels) {
            for (const net of model.pcb?.nets || []) {
                const entry = netEntry(netsByName, net.name)
                entry.pcb.push({
                    fileName: model.fileName,
                    netIndex: net.netIndex ?? net.index
                })
            }
        }

        return [...netsByName.values()].map((net, index) => ({
            bundleIndex: index,
            ...net
        }))
    }

    /**
     * Selects a combined BOM.
     * @param {object[]} documentModels Parsed document models.
     * @returns {object[]}
     */
    static #buildBom(documentModels) {
        const pcbBom = documentModels
            .filter((model) => model?.kind === 'pcb')
            .flatMap((model) => model.bom || [])

        if (pcbBom.length) return pcbBom
        return documentModels.flatMap((model) => model.bom || [])
    }

    /**
     * Builds KiCad schematic hierarchy metadata.
     * @param {object} project Project summary.
     * @returns {object}
     */
    static #buildSchematicHierarchy(project) {
        return {
            rootSchematic: project.rootSchematic || '',
            pages: project.pages || []
        }
    }

    /**
     * Builds bundle lookup indexes.
     * @param {object[]} sheets Bundle sheets.
     * @param {object[]} components Bundle components.
     * @param {object[]} nets Bundle nets.
     * @param {object} pnp Bundle PnP.
     * @returns {object}
     */
    static #buildIndexes(sheets, components, nets, pnp) {
        return {
            sheetsByFileName: indexBy(sheets, 'fileName'),
            componentsByDesignator: indexBy(components, 'designator'),
            netsByName: indexBy(nets, 'name'),
            pnpByDesignator: indexBy(pnp.entries, 'designator')
        }
    }
}

/**
 * Resolves parsed document models from direct options or a loader result.
 * @param {object} options Build options.
 * @param {object} projectModel Project model.
 * @returns {object[]}
 */
function resolveDocumentModels(options, projectModel) {
    const records =
        options.documentModels ||
        projectModel.rendererDocuments ||
        projectModel.documents ||
        []
    return (Array.isArray(records) ? records : []).map((record) => {
        if (record?.kind || record?.schematic || record?.pcb) return record
        return CircuitJsonModelAdapter.toRendererModel(record)
    })
}

/**
 * Gets or creates one component bundle entry.
 * @param {Map<string, object>} componentsByDesignator Component map.
 * @param {string} designator Component designator.
 * @returns {object}
 */
function componentEntry(componentsByDesignator, designator) {
    const key = String(designator || '').trim()
    if (!componentsByDesignator.has(key)) {
        componentsByDesignator.set(key, {
            designator: key,
            schematic: null,
            pcb: null,
            doNotPopulate: false,
            excludeFromBom: false
        })
    }
    return componentsByDesignator.get(key)
}

/**
 * Builds a schematic-side component descriptor.
 * @param {object} model Source model.
 * @param {object} component Source component.
 * @returns {object}
 */
function schematicComponent(model, component) {
    return {
        fileName: model.fileName,
        ownerIndex: component.ownerIndex || '',
        libId: component.libId || component.libReference || '',
        value: component.value || '',
        description: component.description || ''
    }
}

/**
 * Builds a PCB-side component descriptor.
 * @param {object} model Source model.
 * @param {object} component Source component.
 * @returns {object}
 */
function pcbComponent(model, component) {
    return {
        fileName: model.fileName,
        componentIndex: component.componentIndex,
        pattern: component.pattern || component.footprintName || '',
        value: component.value || ''
    }
}

/**
 * Checks KiCad DNP flags.
 * @param {object} component Component row.
 * @returns {boolean}
 */
function isDnp(component) {
    return (
        component.doNotPopulate === true ||
        component.dnp === true ||
        component.dns === true
    )
}

/**
 * Builds a schematic owner-index to designator map.
 * @param {object[]} components Schematic components.
 * @returns {Map<string, string>}
 */
function ownerDesignatorMap(components) {
    const map = new Map()
    for (const component of components || []) {
        const designator = String(component?.designator || '').trim()
        const ownerIndex = String(component?.ownerIndex || component?.id || '')
        if (designator && ownerIndex) map.set(ownerIndex, designator)
    }
    return map
}

/**
 * Normalizes one net pin row with a KiCad component designator.
 * @param {object} pin Pin row.
 * @param {Map<string, string>} ownerDesignators Owner designator lookup.
 * @returns {object}
 */
function normalizePin(pin, ownerDesignators) {
    const ownerIndex = String(pin?.ownerIndex || '').trim()
    const componentDesignator = String(
        pin?.componentDesignator ||
            pin?.refdes ||
            pin?.ownerDesignator ||
            ownerDesignators.get(ownerIndex) ||
            ''
    ).trim()
    return {
        ...pin,
        ownerIndex,
        componentDesignator
    }
}

/**
 * Gets or creates a normalized net entry.
 * @param {Map<string, object>} netsByName Net map.
 * @param {string} name Net name.
 * @returns {object}
 */
function netEntry(netsByName, name) {
    const key = String(name || '').trim()
    if (!netsByName.has(key)) {
        netsByName.set(key, {
            name: key,
            schematic: [],
            pcb: [],
            pins: []
        })
    }
    return netsByName.get(key)
}

/**
 * Builds a compact object index by a field.
 * @param {object[]} records Records.
 * @param {string} key Field name.
 * @returns {Record<string, object>}
 */
function indexBy(records, key) {
    const index = {}
    for (const record of records || []) {
        const value = String(record?.[key] || '').trim()
        if (!value) continue
        index[value] = {
            bundleIndex: record.bundleIndex ?? record.index ?? 0
        }
    }
    return index
}
