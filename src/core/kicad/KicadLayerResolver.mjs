// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const layerAliases = Object.freeze({
    'F.Silkscreen': 'F.SilkS',
    'B.Silkscreen': 'B.SilkS',
    'F.Courtyard': 'F.CrtYd',
    'B.Courtyard': 'B.CrtYd'
})

const technicalLayerDefinitions = Object.freeze([
    { ordinal: 32, name: 'B.Adhes', type: 'user', userName: 'B.Adhesive' },
    { ordinal: 33, name: 'F.Adhes', type: 'user', userName: 'F.Adhesive' },
    { ordinal: 34, name: 'B.Paste', type: 'user', userName: '' },
    { ordinal: 35, name: 'F.Paste', type: 'user', userName: '' },
    { ordinal: 36, name: 'B.SilkS', type: 'user', userName: 'B.Silkscreen' },
    { ordinal: 37, name: 'F.SilkS', type: 'user', userName: 'F.Silkscreen' },
    { ordinal: 38, name: 'B.Mask', type: 'user', userName: '' },
    { ordinal: 39, name: 'F.Mask', type: 'user', userName: '' },
    { ordinal: 40, name: 'Dwgs.User', type: 'user', userName: 'User.Drawings' },
    { ordinal: 41, name: 'Cmts.User', type: 'user', userName: 'User.Comments' },
    { ordinal: 42, name: 'Eco1.User', type: 'user', userName: 'User.Eco1' },
    { ordinal: 43, name: 'Eco2.User', type: 'user', userName: 'User.Eco2' },
    { ordinal: 44, name: 'Edge.Cuts', type: 'user', userName: '' },
    { ordinal: 45, name: 'Margin', type: 'user', userName: '' },
    { ordinal: 46, name: 'B.CrtYd', type: 'user', userName: 'B.Courtyard' },
    { ordinal: 47, name: 'F.CrtYd', type: 'user', userName: 'F.Courtyard' },
    { ordinal: 48, name: 'B.Fab', type: 'user', userName: '' },
    { ordinal: 49, name: 'F.Fab', type: 'user', userName: '' },
    ...Array.from({ length: 9 }, (_, index) => ({
        ordinal: 50 + index,
        name: `User.${index + 1}`,
        type: 'user',
        userName: ''
    }))
])

const technicalLayerByName = new Map(
    technicalLayerDefinitions.map((layer) => [layer.name, layer])
)

/**
 * Resolves KiCad layer names and display sides.
 */
export class KicadLayerResolver {
    /**
     * Returns KiCad's standard copper and technical layer records.
     * @param {{ includeInnerCopper?: boolean }} [options] Options.
     * @returns {{ ordinal: number, name: string, type: string, userName: string }[]}
     */
    static standardLayers(options = {}) {
        const includeInnerCopper = options.includeInnerCopper !== false
        const copper = [
            { ordinal: 0, name: 'F.Cu', type: 'signal', userName: '' }
        ]
        if (includeInnerCopper) {
            copper.push(
                ...Array.from({ length: 30 }, (_, index) => ({
                    ordinal: index + 1,
                    name: `In${index + 1}.Cu`,
                    type: 'signal',
                    userName: ''
                }))
            )
        }
        copper.push({ ordinal: 31, name: 'B.Cu', type: 'signal', userName: '' })
        return [...copper, ...technicalLayerDefinitions].map((layer) => ({
            ...layer
        }))
    }

    /**
     * Normalizes legacy/user-facing KiCad layer aliases.
     * @param {string} layer Layer name.
     * @returns {string}
     */
    static normalizeLayerName(layer) {
        const value = String(layer || '')
        return layerAliases[value] || value
    }

    /**
     * Builds normalized metadata for one KiCad layer name.
     * @param {string} layer Layer name.
     * @returns {{ name: string, originalName: string, ordinal: number | null, side: 'front' | 'back' | 'both', layerClass: string, isCopper: boolean, isTechnical: boolean, isWildcard: boolean, isKnownStandard: boolean }}
     */
    static metadataForLayer(layer) {
        const originalName = String(layer || '')
        const name = KicadLayerResolver.normalizeLayerName(originalName)
        const ordinal = KicadLayerResolver.ordinalForLayer(name)
        const layerClass = KicadLayerResolver.layerClass(name)
        const isWildcard = name.startsWith('*.')

        return {
            name,
            originalName,
            ordinal,
            side: KicadLayerResolver.sideFromLayer(name),
            layerClass,
            isCopper: KicadLayerResolver.isCopperLayer(name),
            isTechnical:
                !KicadLayerResolver.isCopperLayer(name) &&
                (technicalLayerByName.has(name) || isWildcard),
            isWildcard,
            isKnownStandard: ordinal !== null || isWildcard
        }
    }

    /**
     * Resolves the standard KiCad ordinal for a layer name.
     * @param {string} layer Layer name.
     * @returns {number | null}
     */
    static ordinalForLayer(layer) {
        const name = KicadLayerResolver.normalizeLayerName(layer)
        if (name === 'F.Cu') return 0
        if (name === 'B.Cu') return 31

        const innerMatch = /^In(\d+)\.Cu$/u.exec(name)
        if (innerMatch) {
            const ordinal = Number(innerMatch[1])
            return ordinal >= 1 && ordinal <= 30 ? ordinal : null
        }

        return technicalLayerByName.get(name)?.ordinal ?? null
    }

    /**
     * Returns a coarse KiCad layer class.
     * @param {string} layer Layer name.
     * @returns {string}
     */
    static layerClass(layer) {
        const name = KicadLayerResolver.normalizeLayerName(layer)
        if (name === 'F.Cu') return 'front_copper'
        if (name === 'B.Cu') return 'back_copper'
        if (/^In\d+\.Cu$/u.test(name)) return 'inner_copper'
        if (name === '*.Cu') return 'copper'
        if (name.endsWith('.Mask') || name === '*.Mask') return 'mask'
        if (name.endsWith('.Paste') || name === '*.Paste') return 'paste'
        if (name.endsWith('.SilkS') || name === '*.SilkS') return 'silkscreen'
        if (name.endsWith('.Adhes') || name === '*.Adhes') return 'adhesive'
        if (name.endsWith('.CrtYd') || name === '*.CrtYd') return 'courtyard'
        if (name.endsWith('.Fab') || name === '*.Fab') return 'fabrication'
        if (name === 'Edge.Cuts') return 'edge_cuts'
        if (
            [
                'Dwgs.User',
                'Cmts.User',
                'Eco1.User',
                'Eco2.User',
                'Margin'
            ].includes(name) ||
            /^User\.\d+$/u.test(name)
        ) {
            return 'user'
        }
        return 'other'
    }

    /**
     * Returns whether a layer participates in copper.
     * @param {string} layer Layer name.
     * @returns {boolean}
     */
    static isCopperLayer(layer) {
        const name = KicadLayerResolver.normalizeLayerName(layer)
        return name === '*.Cu' || name.endsWith('.Cu')
    }

    /**
     * Maps layers to a display side.
     * @param {string[]} layers
     * @returns {'front' | 'back' | 'both'}
     */
    static sideFromLayers(layers) {
        const metadata = layers.map((layer) =>
            KicadLayerResolver.metadataForLayer(layer)
        )
        const hasBoth = metadata.some((layer) => layer.side === 'both')
        const hasFront = metadata.some((layer) => layer.side === 'front')
        const hasBack = metadata.some((layer) => layer.side === 'back')
        if (hasBoth || (hasFront && hasBack)) return 'both'
        if (hasBack) return 'back'
        return 'front'
    }

    /**
     * Maps one layer to a display side.
     * @param {string} layer
     * @returns {'front' | 'back' | 'both'}
     */
    static sideFromLayer(layer) {
        const normalized = KicadLayerResolver.normalizeLayerName(layer)
        if (normalized.startsWith('*.')) return 'both'
        if (normalized.startsWith('B.')) return 'back'
        if (normalized.startsWith('F.')) return 'front'
        return 'both'
    }

    /**
     * Resolves pad layers and whether their local rotation should be preserved.
     * @param {string[]} layers
     * @param {{ side?: string }} transform
     * @returns {{ layers: string[], preserveLocalRotation: boolean }}
     */
    static resolvePadLayers(layers, transform) {
        return {
            layers,
            preserveLocalRotation: transform.side === 'back'
        }
    }
}
