// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const pinNumberMargin = 0.2216

/**
 * Shared layout helpers for KiCad owner pin-name labels.
 */
export class SchematicOwnerPinLabelLayout {
    /**
     * Resolves one native-facing KiCad pin text placement.
     * @param {{ x: number, y: number, length: number, orientation: 'left' | 'right' | 'top' | 'bottom', nameOffset?: number }} pin Pin row.
     * @param {'name' | 'number'} labelKind Label kind.
     * @returns {{ x: number, yOffset: number, anchor: 'start' | 'middle' | 'end', rotation: number } | null}
     */
    static resolveNativePinTextPlacement(pin, labelKind) {
        if (labelKind === 'name') return resolveNamePlacement(pin)
        if (labelKind === 'number') return resolveNumberPlacement(pin)
        return null
    }

    /**
     * Builds one owner/pin label key.
     * @param {string | undefined} ownerIndex Owner index.
     * @param {string | undefined} name Pin name.
     * @returns {string}
     */
    static buildOwnerPinLabelKey(ownerIndex, name) {
        const normalizedOwnerIndex = String(ownerIndex || '').trim()
        const normalizedName = String(name || '').trim()

        if (!normalizedOwnerIndex || !normalizedName) return ''

        return normalizedOwnerIndex + '::' + normalizedName
    }

    /**
     * Returns the matched owner pin for an explicit text label.
     * @param {{ text?: string, ownerIndex?: string }} text Text row.
     * @param {object[]} pins Pin rows.
     * @returns {object | null}
     */
    static findExplicitOwnerPinLabelMatch(text, pins) {
        const ownerIndex = String(text?.ownerIndex || '').trim()
        const label = String(text?.text || '').trim()

        if (!ownerIndex || !label) return null

        return (
            (pins || []).find((pin) => {
                return (
                    String(pin.ownerIndex || '').trim() === ownerIndex &&
                    String(pin.name || '').trim() === label
                )
            }) || null
        )
    }

    /**
     * Resolves mirrored owner pin-name placement.
     * @param {object} text Text row.
     * @param {object | null} matchedOwnerPin Matched pin row.
     * @returns {{ x: number, y: number } | null}
     */
    static resolveMirroredOwnerPinLabelPlacement(text, matchedOwnerPin) {
        if (
            !matchedOwnerPin ||
            !text?.isMirrored ||
            !text?.rotation ||
            text.recordType !== '4'
        ) {
            return null
        }

        return {
            x: Number(matchedOwnerPin.x),
            y: Number(text.y)
        }
    }

    /**
     * Collects horizontal corrections for explicit owner pin-name labels.
     * @param {object[]} texts Text rows.
     * @param {object[]} pins Pin rows.
     * @returns {Map<string, number>}
     */
    static collectExplicitOwnerPinLabelOffsets(texts, pins) {
        const offsets = new Map()

        for (const text of texts || []) {
            const matchedOwnerPin =
                SchematicOwnerPinLabelLayout.findExplicitOwnerPinLabelMatch(
                    text,
                    pins
                )
            const placement =
                SchematicOwnerPinLabelLayout.resolveMirroredOwnerPinLabelPlacement(
                    text,
                    matchedOwnerPin
                )
            const key = SchematicOwnerPinLabelLayout.buildOwnerPinLabelKey(
                text?.ownerIndex,
                text?.text
            )

            if (!placement || !key) continue

            const delta = Number(placement.x) - Number(text.x)
            if (delta) offsets.set(key, delta)
        }

        return offsets
    }

    /**
     * Resolves the final SVG text anchor for one schematic free-text label.
     * @param {object} text Text row.
     * @param {'start' | 'middle' | 'end'} anchor Base anchor.
     * @param {object | null} matchedOwnerPin Matched pin row.
     * @returns {'start' | 'middle' | 'end'}
     */
    static resolveSchematicTextAnchor(text, anchor, matchedOwnerPin) {
        if (
            anchor !== 'start' ||
            !text?.isMirrored ||
            !text?.rotation ||
            text.recordType !== '4' ||
            !matchedOwnerPin
        ) {
            return anchor
        }

        return Number(text.y) >= Number(matchedOwnerPin.y) ? 'end' : 'start'
    }

    /**
     * Moves left/right pin numbers by explicit owner pin-name corrections.
     * @param {object} pin Pin row.
     * @param {number} baseX Base x coordinate.
     * @param {Map<string, number>} explicitOwnerPinLabelOffsets Offset map.
     * @returns {number}
     */
    static resolveExplicitOwnerPinNumberX(
        pin,
        baseX,
        explicitOwnerPinLabelOffsets
    ) {
        const key = SchematicOwnerPinLabelLayout.buildOwnerPinLabelKey(
            pin.ownerIndex,
            pin.name
        )
        const delta = Number(explicitOwnerPinLabelOffsets.get(key) || 0)

        if (!delta) return baseX
        if (pin.orientation === 'left') return baseX - delta
        if (pin.orientation === 'right') return baseX + delta
        return baseX
    }
}

/**
 * Resolves KiCad pin-name text placement from the body-side pin point.
 * @param {object} pin Pin row.
 * @returns {{ x: number, yOffset: number, anchor: 'start' | 'middle' | 'end', rotation: number } | null}
 */
function resolveNamePlacement(pin) {
    const offset = Number(pin?.nameOffset || 0.5)
    if (pin?.orientation === 'left') {
        return {
            x: Number(pin.x) + offset,
            yOffset: 0,
            anchor: 'start',
            rotation: 0
        }
    }
    if (pin?.orientation === 'right') {
        return {
            x: Number(pin.x) - offset,
            yOffset: 0,
            anchor: 'end',
            rotation: 0
        }
    }
    if (pin?.orientation === 'top') {
        return {
            x: Number(pin.x),
            yOffset: offset,
            anchor: 'end',
            rotation: -90
        }
    }
    if (pin?.orientation === 'bottom') {
        return {
            x: Number(pin.x),
            yOffset: -offset,
            anchor: 'end',
            rotation: 90
        }
    }
    return null
}

/**
 * Resolves KiCad pin-number text placement from the pin stub.
 * @param {object} pin Pin row.
 * @returns {{ x: number, yOffset: number, anchor: 'start' | 'middle' | 'end', rotation: number } | null}
 */
function resolveNumberPlacement(pin) {
    const midpoint = pinStubMidpoint(pin)
    if (!midpoint) return null

    if (pin.orientation === 'left' || pin.orientation === 'right') {
        return {
            x: midpoint.x,
            yOffset: -pinNumberMargin,
            anchor: 'middle',
            rotation: 0
        }
    }
    if (pin.orientation === 'top') {
        return {
            x: Number(pin.x) - pinNumberMargin,
            yOffset: midpoint.y - Number(pin.y),
            anchor: 'middle',
            rotation: -90
        }
    }
    if (pin.orientation === 'bottom') {
        return {
            x: Number(pin.x) - pinNumberMargin,
            yOffset: midpoint.y - Number(pin.y),
            anchor: 'middle',
            rotation: 90
        }
    }
    return null
}

/**
 * Resolves the midpoint between symbol body and connection endpoint.
 * @param {object} pin Pin row.
 * @returns {{ x: number, y: number } | null}
 */
function pinStubMidpoint(pin) {
    const end = pinConnectionPoint(pin)
    if (!end) return null

    return {
        x: (Number(pin.x) + end.x) / 2,
        y: (Number(pin.y) + end.y) / 2
    }
}

/**
 * Resolves a KiCad pin connection point.
 * @param {object} pin Pin row.
 * @returns {{ x: number, y: number } | null}
 */
function pinConnectionPoint(pin) {
    const length = Number(pin?.length || 0)
    if (pin?.orientation === 'left')
        return { x: Number(pin.x) - length, y: Number(pin.y) }
    if (pin?.orientation === 'right')
        return { x: Number(pin.x) + length, y: Number(pin.y) }
    if (pin?.orientation === 'top')
        return { x: Number(pin.x), y: Number(pin.y) - length }
    if (pin?.orientation === 'bottom')
        return { x: Number(pin.x), y: Number(pin.y) + length }
    return null
}
