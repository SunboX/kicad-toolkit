// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Resolves procedural PCB package families and dimensions.
 */
export class PcbScene3dPackages {
    /**
     * Resolves one procedural package description for a component.
     * @param {{ pattern?: string, height?: number | null }} component Component model.
     * @param {{ width?: number, depth?: number }} [padSpan] Pad span fallback.
     * @returns {{ family: string, sizeMil: { width: number, depth: number, height: number } }}
     */
    static resolve(component, padSpan = { width: 0, depth: 0 }) {
        const family = PcbScene3dPackages.#resolveFamily(component?.pattern)
        const defaults = PcbScene3dPackages.#resolveDefaultSize(
            family,
            component?.pattern
        )
        const explicitHeight = Number(component?.height)
        const height =
            Number.isFinite(explicitHeight) && explicitHeight > 0
                ? explicitHeight
                : defaults.height

        return {
            family,
            sizeMil: {
                width: Math.max(defaults.width, Number(padSpan.width) || 0),
                depth: Math.max(defaults.depth, Number(padSpan.depth) || 0),
                height
            }
        }
    }

    /**
     * Resolves a generic package family from one footprint pattern.
     * @param {string | undefined} pattern Footprint pattern.
     * @returns {string}
     */
    static #resolveFamily(pattern) {
        const normalized = String(pattern || '').toUpperCase()

        if (
            /(0402|0603|0805|1206|C0805|C0603|R_0603|C_0603)/u.test(normalized)
        ) {
            return 'chip'
        }

        if (normalized.includes('SOT')) {
            return 'sot'
        }

        if (
            normalized.includes('QFN') ||
            normalized.includes('QFP') ||
            normalized.includes('DFN') ||
            normalized.includes('SOIC') ||
            normalized.includes('TSSOP') ||
            normalized.includes('SSOP')
        ) {
            return 'ic'
        }

        if (
            normalized.includes('CP_') ||
            normalized.includes('RADIAL') ||
            /C\d+(?:\.\d+)?A/u.test(normalized)
        ) {
            return 'radial-capacitor'
        }

        if (normalized.includes('TESTPOINT') || normalized.includes('TP')) {
            return 'test-point'
        }

        if (
            normalized.includes('CONNECTOR') ||
            normalized.includes('PIN_') ||
            normalized.includes('HEADER') ||
            normalized.includes('PH')
        ) {
            return 'connector-block'
        }

        if (normalized.includes('DIODE') || normalized.includes('SMA')) {
            return 'diode'
        }

        return 'generic'
    }

    /**
     * Resolves one default body size for the chosen family.
     * @param {string} family Package family.
     * @param {string | undefined} pattern Footprint pattern.
     * @returns {{ width: number, depth: number, height: number }}
     */
    static #resolveDefaultSize(family, pattern) {
        const normalized = String(pattern || '').toUpperCase()

        if (family === 'chip') {
            if (normalized.includes('0402')) {
                return { width: 24, depth: 12, height: 14 }
            }
            if (normalized.includes('0805')) {
                return { width: 80, depth: 50, height: 24 }
            }
            if (normalized.includes('1206')) {
                return { width: 126, depth: 63, height: 28 }
            }
            return { width: 60, depth: 30, height: 20 }
        }

        if (family === 'sot') {
            return { width: 110, depth: 90, height: 45 }
        }

        if (family === 'ic') {
            return { width: 180, depth: 180, height: 55 }
        }

        if (family === 'radial-capacitor') {
            return { width: 120, depth: 120, height: 180 }
        }

        if (family === 'test-point') {
            return { width: 36, depth: 36, height: 60 }
        }

        if (family === 'connector-block') {
            return { width: 320, depth: 120, height: 150 }
        }

        if (family === 'diode') {
            return { width: 95, depth: 60, height: 34 }
        }

        return { width: 96, depth: 72, height: 48 }
    }
}

/**
 * Builds data-only 3D scene descriptions for KiCad PCB documents.
 */
export class PcbScene3dBuilder {
    /**
     * Builds a deterministic scene description without depending on Three.js.
     * @param {object} documentModel Normalized KiCad PCB document.
     * @param {object} [options] Scene build options.
     * @returns {object}
     */
    static build(documentModel, options = {}) {
        const pcb = documentModel?.pcb || {}
        const boardOutline = pcb.boardOutline || {}
        const thicknessMil = Number(options.boardThicknessMil || 63) || 63
        const registry =
            options.modelRegistry instanceof PcbScene3dModelRegistry
                ? options.modelRegistry
                : new PcbScene3dModelRegistry({
                      sessionAssets: options.sessionAssets || []
                  })
        const board = {
            widthMil: Number(boardOutline.widthMil || 0),
            heightMil: Number(boardOutline.heightMil || 0),
            thicknessMil,
            minX: Number(boardOutline.minX || 0),
            minY: Number(boardOutline.minY || 0),
            centerX:
                Number(boardOutline.minX || 0) +
                Number(boardOutline.widthMil || 0) / 2,
            centerY:
                Number(boardOutline.minY || 0) +
                Number(boardOutline.heightMil || 0) / 2,
            segments: boardOutline.segments || []
        }
        const components = (pcb.components || []).map((component) => {
            const mountSide =
                String(component.layer || 'TOP').toUpperCase() === 'BOTTOM'
                    ? 'bottom'
                    : 'top'
            const body = PcbScene3dPackages.resolve(component, {
                width: Number(component.width || 0),
                depth: Number(component.depth || 0)
            })
            const z =
                mountSide === 'bottom'
                    ? -(thicknessMil / 2 + body.sizeMil.height / 2)
                    : thicknessMil / 2 + body.sizeMil.height / 2

            return {
                designator: String(component.designator || ''),
                mountSide,
                rotationDeg: Number(component.rotation || 0),
                positionMil: {
                    x: Number(component.x || 0) - board.centerX,
                    y: Number(component.y || 0) - board.centerY,
                    z
                },
                boardPositionMil: {
                    x: Number(component.x || 0),
                    y: Number(component.y || 0),
                    z: 0
                },
                pattern: String(component.pattern || ''),
                source: String(component.source || ''),
                body,
                externalModel: registry.resolveComponentModel(component)
            }
        })

        return {
            sourceFormat: documentModel?.sourceFormat || 'kicad',
            board,
            layers: pcb.layers || [],
            components,
            pads: pcb.pads || [],
            tracks: pcb.tracks || [],
            vias: pcb.vias || [],
            zones: pcb.polygons || [],
            texts: pcb.texts || [],
            externalPlacements: [],
            detail: {
                pads: pcb.pads || [],
                tracks: pcb.tracks || [],
                arcs: pcb.arcs || [],
                fills: pcb.fills || [],
                vias: pcb.vias || [],
                polygons: pcb.polygons || [],
                silkscreen: {
                    top: { fills: [], tracks: [], arcs: [] },
                    bottom: { fills: [], tracks: [], arcs: [] }
                }
            },
            externalModels: components
                .map((component) => component.externalModel)
                .filter(Boolean)
        }
    }
}

/**
 * Async preparation facade matching the Altium scene3d contract.
 */
export class PcbScene3dScenePreparator {
    /**
     * Prepares a scene description.
     * @param {object} documentModel Normalized KiCad PCB document.
     * @param {object} [options] Preparation options.
     * @returns {Promise<object>}
     */
    static async prepare(documentModel, options = {}) {
        return PcbScene3dBuilder.build(documentModel, options)
    }
}

/**
 * Resolves companion 3D model assets for KiCad footprints.
 */
export class PcbScene3dModelRegistry {
    #assets

    /**
     * Creates a model registry.
     * @param {{ sessionAssets?: object[] }} [options] Registry options.
     */
    constructor(options = {}) {
        this.#assets = Array.from(options.sessionAssets || [])
    }

    /**
     * Creates a model registry from session files.
     * @param {object[]} sessionAssets Session assets.
     * @returns {PcbScene3dModelRegistry}
     */
    static create(sessionAssets) {
        return new PcbScene3dModelRegistry({ sessionAssets })
    }

    /**
     * Returns the currently registered session assets.
     * @returns {object[]}
     */
    get assets() {
        return [...this.#assets]
    }

    /**
     * Finds a companion asset for a component.
     * @param {object} component Component placement.
     * @returns {object | null}
     */
    resolveForComponent(component) {
        const keys = [
            component?.modelName,
            component?.modelPath,
            component?.pattern,
            component?.source,
            component?.description
        ]
            .filter(Boolean)
            .map(normalizeMatchKey)

        if (!keys.length) return null

        return (
            this.#assets.find((asset) => {
                const assetName = normalizeMatchKey(
                    asset.name || asset.path || ''
                )
                return keys.some((key) => {
                    return (
                        assetName === key ||
                        assetName.startsWith(key + '.') ||
                        assetName.includes('/' + key + '.')
                    )
                })
            }) || null
        )
    }

    /**
     * Resolves a component model using the Altium-style method name.
     * @param {object} component Component placement.
     * @returns {object | null}
     */
    resolveComponentModel(component) {
        return this.resolveForComponent(component)
    }

    /**
     * KiCad normalized models do not yet expose explicit body-model records.
     * @returns {null}
     */
    resolveComponentBodyModel() {
        return null
    }
}

/**
 * Renders compact scene summary markup.
 */
export class PcbScene3dSummaryRenderer {
    /**
     * Renders a human-readable scene summary.
     * @param {object} documentModel Normalized KiCad PCB document.
     * @returns {string}
     */
    static render(documentModel) {
        const pcb = documentModel?.pcb || {}
        const outline = pcb.boardOutline || {}
        const componentCount = (pcb.components || []).length

        return [
            '<section class="kicad-scene3d-summary">',
            '<h2>KiCad 3D scene</h2>',
            '<dl>',
            `<dt>Components</dt><dd>${componentCount}</dd>`,
            `<dt>Width</dt><dd>${escapeHtml(String(Math.round(outline.widthMil || 0)))} mil</dd>`,
            `<dt>Height</dt><dd>${escapeHtml(String(Math.round(outline.heightMil || 0)))} mil</dd>`,
            '</dl>',
            '</section>'
        ].join('')
    }
}

/**
 * Normalizes asset and component matching keys.
 * @param {string} value Source value.
 * @returns {string}
 */
function normalizeMatchKey(value) {
    return String(value || '')
        .replace(/\\/g, '/')
        .split('/')
        .at(-1)
        .replace(/\.(step|stp|wrl|vrml)$/i, '')
        .toLowerCase()
}

/**
 * Escapes HTML-sensitive text.
 * @param {string} value Raw value.
 * @returns {string}
 */
function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[character]
    })
}
