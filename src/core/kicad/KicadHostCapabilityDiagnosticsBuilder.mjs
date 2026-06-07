// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Builds deterministic host capability and fallback diagnostics.
 */
export class KicadHostCapabilityDiagnosticsBuilder {
    static SCHEMA = 'kicad-toolkit.host-capabilities.a1'

    /**
     * Builds a host capability diagnostics report.
     * @param {{ host?: object, capabilities?: Record<string, boolean>, fallbacks?: object[] }} options Diagnostics options.
     * @returns {object}
     */
    static build(options = {}) {
        const capabilities = capabilityRows(options.capabilities || {})
        const diagnostics = [
            ...capabilityDiagnostics(capabilities),
            ...fallbackDiagnostics(options.fallbacks || [])
        ]

        return {
            schema: KicadHostCapabilityDiagnosticsBuilder.SCHEMA,
            host: options.host || {},
            summary: {
                capabilityCount: capabilities.length,
                unsupportedCapabilityCount: capabilities.filter(
                    (capability) => !capability.supported
                ).length,
                fallbackCount: (options.fallbacks || []).length,
                warningCount: diagnostics.filter(
                    (diagnostic) => diagnostic.severity === 'warning'
                ).length
            },
            capabilities,
            diagnostics
        }
    }
}

/**
 * Builds sorted capability rows.
 * @param {Record<string, boolean>} capabilities Capability map.
 * @returns {object[]}
 */
function capabilityRows(capabilities) {
    return Object.keys(capabilities || {})
        .sort(localeCompare)
        .map((key) => {
            const supported = capabilities[key] === true
            return stripUndefined({
                key,
                supported,
                diagnosticCode: supported ? undefined : capabilityCode(key)
            })
        })
}

/**
 * Builds diagnostics for unsupported capabilities.
 * @param {object[]} capabilities Capability rows.
 * @returns {object[]}
 */
function capabilityDiagnostics(capabilities) {
    return capabilities
        .filter((capability) => !capability.supported)
        .map((capability) => ({
            code: capability.diagnosticCode,
            severity: 'warning',
            capability: capability.key,
            message: 'Host capability ' + capability.key + ' is unavailable.'
        }))
}

/**
 * Builds diagnostics for fallback decisions.
 * @param {object[]} fallbacks Fallback rows.
 * @returns {object[]}
 */
function fallbackDiagnostics(fallbacks) {
    return (fallbacks || []).map((fallback) =>
        stripUndefined({
            ...fallback,
            code: fallback.code || 'host.fallback.used',
            severity: fallback.severity || 'info',
            message:
                fallback.message ||
                'Host fallback ' +
                    (fallback.code || 'host.fallback.used') +
                    ' was used.'
        })
    )
}

/**
 * Builds an unsupported-capability diagnostic code.
 * @param {string} key Capability key.
 * @returns {string}
 */
function capabilityCode(key) {
    return 'host.capability.' + key + '.unsupported'
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
 * Removes undefined fields.
 * @param {Record<string, unknown>} value Candidate object.
 * @returns {Record<string, unknown>}
 */
function stripUndefined(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter(
            ([, entryValue]) => entryValue !== undefined
        )
    )
}
