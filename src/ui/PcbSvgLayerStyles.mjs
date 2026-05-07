// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Returns the base KiCad renderer layer styles.
 * @returns {Record<string, { visible: boolean, fillColor: string, fillOpacity: number, borderColor: string, borderWidth: number | null }>}
 */
export function defaultLayerStyles() {
    return {
        board: {
            visible: true,
            fillColor: '#000000',
            fillOpacity: 1,
            borderColor: '#000000',
            borderWidth: null
        },
        edgeCuts: {
            visible: true,
            fillColor: '#000000',
            fillOpacity: 1,
            borderColor: '#8e929c',
            borderWidth: null
        },
        pads: {
            visible: true,
            fillColor: '#cfd1d4',
            fillOpacity: 1,
            borderColor: '#50545f',
            borderWidth: 0.16
        },
        traces: {
            visible: true,
            fillColor: '#70747d',
            fillOpacity: 1,
            borderColor: '#70747d',
            borderWidth: null
        },
        zones: {
            visible: true,
            fillColor: '#3c3f46',
            fillOpacity: 1,
            borderColor: '#50545f',
            borderWidth: null
        },
        vias: {
            visible: true,
            fillColor: '#70747d',
            fillOpacity: 1,
            borderColor: '#50545f',
            borderWidth: 0.06
        },
        drills: {
            visible: true,
            fillColor: '#000000',
            fillOpacity: 1,
            borderColor: '#50545f',
            borderWidth: null
        },
        silkscreen: {
            visible: true,
            fillColor: '#aeb3bd',
            fillOpacity: 1,
            borderColor: '#aeb3bd',
            borderWidth: null
        }
    }
}
