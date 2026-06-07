// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Builds KiCad drill overlay and draw-order review metadata.
 */
export class KicadPcbReviewDrillMetadataBuilder {
    /**
     * Builds drill review and draw-order metadata.
     * @param {object} pcb Normalized KiCad PCB model.
     * @returns {{ overlays: object[], layerDrawOrder: object[] }}
     */
    static build(pcb = {}) {
        return {
            overlays: [
                ...drillRows('via', pcb.vias || []),
                ...drillRows('pad', pcb.pads || [])
            ],
            layerDrawOrder: layerDrawOrder(pcb)
        }
    }
}

/**
 * Builds drill overlay rows for one drill-owner collection.
 * @param {'via' | 'pad'} ownerKind Drill owner kind.
 * @param {object[]} owners Drill owners.
 * @returns {object[]}
 */
function drillRows(ownerKind, owners) {
    return (owners || [])
        .map((owner, index) => {
            if (!hasHole(owner)) return null
            const ownerKey = ownerKind + '-' + index
            const hole = holeKind(owner)
            const plating = owner?.isPlated === false ? 'non-plated' : 'plated'
            const renderState = drillRenderState(owner)

            return stripEmpty({
                elementKey: 'pcb-' + ownerKind + '-hole-' + String(index),
                ownerKind,
                ownerKey,
                holeKind: hole,
                plating,
                renderState,
                overlayKind: overlayKind(ownerKind, hole, plating, renderState),
                layerKeys: sortedStrings([layerKey(owner)])
            })
        })
        .filter(Boolean)
}

/**
 * Builds layer draw-order rows for visual review.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function layerDrawOrder(pcb) {
    const descriptors = new Map()
    for (const layer of [
        ...(pcb.layers || []),
        ...(pcb.primitiveLayers || [])
    ]) {
        const key = layerKey(layer)
        if (!key || descriptors.has(key)) continue
        descriptors.set(key, {
            layerKey: key,
            displayName:
                layer?.displayName ||
                layer?.userName ||
                layer?.name ||
                layer?.canonicalName ||
                key,
            role: layerRole(layer, key)
        })
    }

    return [...descriptors.values()]
        .sort((left, right) => localeCompare(left.layerKey, right.layerKey))
        .map((layer, drawOrder) => ({ ...layer, drawOrder }))
}

/**
 * Returns true when a drill owner has a visible hole.
 * @param {object} owner Drill owner primitive.
 * @returns {boolean}
 */
function hasHole(owner) {
    return Number(owner?.holeDiameter || owner?.drillDiameter || 0) > 0
}

/**
 * Resolves a drill owner hole kind.
 * @param {object} owner Drill owner primitive.
 * @returns {'round' | 'slot'}
 */
function holeKind(owner) {
    const holeShape = String(owner?.holeShape || '').toLowerCase()
    if (
        Number(owner?.holeSlotLength || owner?.slotLength || 0) > 0 ||
        holeShape.includes('slot')
    ) {
        return 'slot'
    }

    return 'round'
}

/**
 * Resolves drill rendering state from explicit and via-protection metadata.
 * @param {object} owner Drill owner primitive.
 * @returns {'open' | 'covered' | 'filled' | 'capped'}
 */
function drillRenderState(owner) {
    const explicit =
        owner?.drillRenderState ||
        owner?.renderState ||
        owner?.drill?.renderState
    if (explicit) return normalizeRenderState(explicit)

    const featureText = (owner?.viaProtection?.features || [])
        .flatMap((feature) => [feature.type, feature.material])
        .join(' ')
        .toLowerCase()

    if (/cap/u.test(featureText)) return 'capped'
    if (/fill|plug/u.test(featureText)) return 'filled'
    if (/cover|tent|mask/u.test(featureText)) return 'covered'

    const ipcType = Number(
        owner?.ipc4761Type ?? owner?.viaProtection?.ipc4761Type
    )
    if (ipcType === 6 || ipcType === 7) return 'capped'
    if (ipcType === 3 || ipcType === 4 || ipcType === 5) return 'filled'
    if (ipcType === 1 || ipcType === 2) return 'covered'

    return 'open'
}

/**
 * Normalizes a render-state label.
 * @param {unknown} value Raw render-state value.
 * @returns {'open' | 'covered' | 'filled' | 'capped'}
 */
function normalizeRenderState(value) {
    const normalized = String(value || '').toLowerCase()
    if (/cap/u.test(normalized)) return 'capped'
    if (/fill|plug/u.test(normalized)) return 'filled'
    if (/cover|tent|mask/u.test(normalized)) return 'covered'
    return 'open'
}

/**
 * Resolves a deterministic overlay kind.
 * @param {'via' | 'pad'} ownerKind Drill owner kind.
 * @param {'round' | 'slot'} holeKindValue Hole kind.
 * @param {'plated' | 'non-plated'} plating Plating state.
 * @param {'open' | 'covered' | 'filled' | 'capped'} renderState Render state.
 * @returns {string}
 */
function overlayKind(ownerKind, holeKindValue, plating, renderState) {
    if (plating === 'non-plated') {
        return holeKindValue === 'slot' ? 'non-plated-slot' : 'non-plated-hole'
    }
    if (ownerKind === 'via' && ['filled', 'capped'].includes(renderState)) {
        return 'filled-or-capped-via'
    }
    if (ownerKind === 'via' && renderState === 'covered') {
        return 'covered-via'
    }
    return holeKindValue === 'slot' ? 'plated-slot' : 'plated-hole'
}

/**
 * Resolves a layer key from a primitive or layer descriptor.
 * @param {object} value Primitive or layer descriptor.
 * @returns {string}
 */
function layerKey(value) {
    return String(
        value?.layerKey ||
            value?.layer ||
            value?.layerName ||
            value?.name ||
            value?.canonicalName ||
            ''
    ).trim()
}

/**
 * Resolves a layer role suitable for visual draw order.
 * @param {object} layer Layer row.
 * @param {string} key Layer key.
 * @returns {string}
 */
function layerRole(layer, key) {
    const label = [layer?.role, layer?.kind, layer?.name, key]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
    if (label.includes('silk') || label.includes('overlay')) return 'overlay'
    if (label.includes('cu')) return 'copper'
    if (label.includes('mask')) return 'mask'
    if (label.includes('paste')) return 'paste'
    if (label.includes('edge')) return 'mechanical'
    return 'other'
}

/**
 * Sorts and deduplicates strings naturally.
 * @param {string[]} values Source values.
 * @returns {string[]}
 */
function sortedStrings(values) {
    return [...new Set((values || []).filter(Boolean))].sort(localeCompare)
}

/**
 * Compares strings with numeric ordering.
 * @param {string} left Left string.
 * @param {string} right Right string.
 * @returns {number}
 */
function localeCompare(left, right) {
    return String(left).localeCompare(String(right), undefined, {
        numeric: true
    })
}

/**
 * Removes empty fields while preserving zeros and false.
 * @param {Record<string, unknown>} value Candidate object.
 * @returns {Record<string, unknown>}
 */
function stripEmpty(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter(([, entryValue]) => {
            if (Array.isArray(entryValue)) return entryValue.length > 0
            return (
                entryValue !== null &&
                entryValue !== undefined &&
                entryValue !== ''
            )
        })
    )
}
