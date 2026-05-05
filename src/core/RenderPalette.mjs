// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const layerDefinitions = [
    {
        key: 'board',
        label: 'Board',
        fill: true,
        border: false,
        width: false,
        defaultStyle: {
            visible: true,
            fillColor: '#000000',
            borderColor: '#000000',
            borderWidth: null
        }
    },
    {
        key: 'edgeCuts',
        label: 'Edge.Cuts',
        fill: false,
        border: true,
        width: true,
        defaultStyle: {
            visible: true,
            fillColor: '#000000',
            borderColor: '#8e929c',
            borderWidth: null
        }
    },
    {
        key: 'pads',
        label: 'Pads',
        fill: true,
        border: true,
        width: true,
        defaultStyle: {
            visible: true,
            fillColor: '#cfd1d4',
            borderColor: '#50545f',
            borderWidth: 0.16
        }
    },
    {
        key: 'traces',
        label: 'Copper traces',
        fill: false,
        border: true,
        width: true,
        defaultStyle: {
            visible: true,
            fillColor: '#70747d',
            borderColor: '#70747d',
            borderWidth: null
        }
    },
    {
        key: 'zones',
        label: 'Copper zones',
        fill: true,
        border: true,
        width: true,
        defaultStyle: {
            visible: true,
            fillColor: '#3c3f46',
            borderColor: '#50545f',
            borderWidth: null
        }
    },
    {
        key: 'vias',
        label: 'Vias',
        fill: true,
        border: true,
        width: true,
        defaultStyle: {
            visible: true,
            fillColor: '#70747d',
            borderColor: '#50545f',
            borderWidth: 0.06
        }
    },
    {
        key: 'drills',
        label: 'Drill holes',
        fill: true,
        border: true,
        width: true,
        defaultStyle: {
            visible: true,
            fillColor: '#000000',
            borderColor: '#50545f',
            borderWidth: null
        }
    },
    {
        key: 'silkscreen',
        label: 'Silkscreen',
        fill: true,
        border: true,
        width: true,
        defaultStyle: {
            visible: true,
            fillColor: '#aeb3bd',
            borderColor: '#aeb3bd',
            borderWidth: null
        }
    }
]

/**
 * Provides the supported renderer layers and normalized style values.
 */
export class RenderPalette {
    /**
     * Returns visible layer metadata for controls.
     * @returns {{ key: string, label: string, fill: boolean, border: boolean, width: boolean }[]}
     */
    static layers() {
        return layerDefinitions.map((layer) => ({
            key: layer.key,
            label: layer.label,
            fill: layer.fill,
            border: layer.border,
            width: layer.width
        }))
    }

    /**
     * Returns the default renderer layer styles.
     * @returns {Record<string, { visible: boolean, fillColor: string, fillOpacity: number, borderColor: string, borderWidth: number | null }>}
     */
    static defaultStyles() {
        return Object.fromEntries(
            layerDefinitions.map((layer) => [
                layer.key,
                RenderPalette.#cloneStyle(layer.defaultStyle)
            ])
        )
    }

    /**
     * Returns the legacy color map used by older renderer calls.
     * @returns {Record<string, string>}
     */
    static defaultColors() {
        const styles = RenderPalette.defaultStyles()
        return {
            board: styles.board.fillColor,
            outline: styles.edgeCuts.borderColor,
            copper: styles.pads.fillColor,
            copperTrace: styles.traces.borderColor,
            copperZone: styles.zones.fillColor,
            copperStroke: styles.pads.borderColor,
            silk: styles.silkscreen.borderColor
        }
    }

    /**
     * Resolves partial user styles against the defaults.
     * @param {Record<string, object | string> | undefined} layerStyles
     * @param {Record<string, string> | undefined} legacyColors
     * @returns {Record<string, { visible: boolean, fillColor: string, fillOpacity: number, borderColor: string, borderWidth: number | null }>}
     */
    static resolveStyles(layerStyles = {}, legacyColors = {}) {
        const styleInput = RenderPalette.#isLegacyColorMap(layerStyles)
            ? RenderPalette.stylesFromColors(layerStyles)
            : layerStyles
        const legacyStyles = RenderPalette.stylesFromColors(legacyColors)

        return Object.fromEntries(
            layerDefinitions.map((layer) => {
                const patch = {
                    ...(legacyStyles[layer.key] || {}),
                    ...(styleInput[layer.key] || {})
                }
                return [
                    layer.key,
                    RenderPalette.#normalizeStyle(layer.defaultStyle, patch)
                ]
            })
        )
    }

    /**
     * Merges a style patch into existing resolved styles.
     * @param {Record<string, object>} base
     * @param {Record<string, object>} patch
     * @returns {Record<string, { visible: boolean, fillColor: string, fillOpacity: number, borderColor: string, borderWidth: number | null }>}
     */
    static mergeStyles(base = {}, patch = {}) {
        const resolved = RenderPalette.resolveStyles(base)
        const merged = { ...resolved }

        for (const layer of layerDefinitions) {
            if (!patch[layer.key]) continue
            merged[layer.key] = {
                ...merged[layer.key],
                ...patch[layer.key]
            }
        }

        return RenderPalette.resolveStyles(merged)
    }

    /**
     * Converts the legacy color map into layer style patches.
     * @param {Record<string, string> | undefined} colors
     * @returns {Record<string, object>}
     */
    static stylesFromColors(colors = {}) {
        return {
            board: { fillColor: colors.board },
            edgeCuts: { borderColor: colors.outline },
            pads: {
                fillColor: colors.copper,
                borderColor: colors.copperStroke
            },
            traces: {
                fillColor: colors.copperTrace,
                borderColor: colors.copperTrace
            },
            zones: {
                fillColor: colors.copperZone,
                borderColor: colors.copperStroke
            },
            vias: {
                fillColor: colors.copperTrace,
                borderColor: colors.copperStroke
            },
            drills: {
                fillColor: colors.board,
                borderColor: colors.copperStroke
            },
            silkscreen: {
                fillColor: colors.silk,
                borderColor: colors.silk
            }
        }
    }

    /**
     * Resolves a legacy color map against defaults.
     * @param {Record<string, string> | undefined} colors
     * @returns {Record<string, string>}
     */
    static resolve(colors = {}) {
        const styles = RenderPalette.resolveStyles(
            RenderPalette.stylesFromColors(colors)
        )
        return {
            board: styles.board.fillColor,
            outline: styles.edgeCuts.borderColor,
            copper: styles.pads.fillColor,
            copperTrace: styles.traces.borderColor,
            copperZone: styles.zones.fillColor,
            copperStroke: styles.pads.borderColor,
            silk: styles.silkscreen.borderColor
        }
    }

    /**
     * Checks whether a value is a valid browser color input value.
     * @param {unknown} value
     * @returns {boolean}
     */
    static isColor(value) {
        return Boolean(RenderPalette.#normalizeColor(value))
    }

    /**
     * Normalizes a browser color input value.
     * @param {unknown} value
     * @param {string} fallback
     * @returns {string}
     */
    static normalizeColor(value, fallback = '') {
        return RenderPalette.#normalizeColor(value) || fallback
    }

    /**
     * Clones one resolved style object.
     * @param {{ visible: boolean, fillColor: string, fillOpacity?: number, borderColor: string, borderWidth: number | null }} style
     * @returns {{ visible: boolean, fillColor: string, fillOpacity: number, borderColor: string, borderWidth: number | null }}
     */
    static #cloneStyle(style) {
        return {
            ...style,
            fillOpacity: RenderPalette.#normalizeOpacity(style.fillOpacity, 1)
        }
    }

    /**
     * Normalizes one style patch against a default style.
     * @param {{ visible: boolean, fillColor: string, fillOpacity?: number, borderColor: string, borderWidth: number | null }} defaults
     * @param {object} patch
     * @returns {{ visible: boolean, fillColor: string, fillOpacity: number, borderColor: string, borderWidth: number | null }}
     */
    static #normalizeStyle(defaults, patch) {
        return {
            visible:
                'visible' in patch ? patch.visible !== false : defaults.visible,
            fillColor:
                RenderPalette.#normalizeColor(patch.fillColor) ||
                defaults.fillColor,
            fillOpacity: RenderPalette.#normalizeOpacity(
                patch.fillOpacity,
                defaults.fillOpacity ?? 1
            ),
            borderColor:
                RenderPalette.#normalizeColor(patch.borderColor) ||
                defaults.borderColor,
            borderWidth: RenderPalette.#normalizeWidth(
                patch.borderWidth,
                defaults.borderWidth
            )
        }
    }

    /**
     * Checks whether an object uses the old color-key shape.
     * @param {unknown} value
     * @returns {boolean}
     */
    static #isLegacyColorMap(value) {
        return (
            typeof value?.board === 'string' ||
            typeof value?.copper === 'string'
        )
    }

    /**
     * Normalizes short and long hex color strings.
     * @param {unknown} value
     * @returns {string}
     */
    static #normalizeColor(value) {
        const color = String(value || '').trim()
        const match = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/iu)
        if (!match) return ''

        const valuePart = match[1].toLowerCase()
        if (valuePart.length === 6) return '#' + valuePart

        return (
            '#' +
            valuePart
                .split('')
                .map((part) => part + part)
                .join('')
        )
    }

    /**
     * Normalizes a stroke width, preserving null as automatic thickness.
     * @param {unknown} value
     * @param {number | null} fallback
     * @returns {number | null}
     */
    static #normalizeWidth(value, fallback) {
        if (value === null || value === '') return null
        if (value === undefined) return fallback

        const width = Number(value)
        if (!Number.isFinite(width) || width < 0) return fallback

        return Math.min(width, 20)
    }

    /**
     * Normalizes a fill opacity value to SVG's 0..1 range.
     * @param {unknown} value
     * @param {number} fallback
     * @returns {number}
     */
    static #normalizeOpacity(value, fallback) {
        if (value === undefined || value === '') return fallback

        const opacity = Number(value)
        if (!Number.isFinite(opacity)) return fallback

        return Math.max(0, Math.min(1, opacity))
    }
}
