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
