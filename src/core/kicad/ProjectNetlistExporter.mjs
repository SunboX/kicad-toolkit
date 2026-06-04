// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const netlistSchema = 'kicad-toolkit.netlist.a1'

/**
 * Builds deterministic netlist exports from KiCad project bundles.
 */
export class ProjectNetlistExporter {
    /**
     * Builds a line-oriented wirelist for CI and downstream tooling.
     * @param {object} bundle Normalized design bundle or effective variant.
     * @returns {string}
     */
    static buildWirelist(bundle) {
        const netlist = ProjectNetlistExporter.buildNetlistJson(bundle)
        const lines = [
            '# kicad-toolkit wirelist v1',
            'project ' + netlist.project
        ]

        for (const net of netlist.nets) {
            lines.push('net ' + net.name)
            for (const pin of net.pins) {
                lines.push('  ' + pin.component + '.' + pin.pin)
            }
        }

        lines.push('')
        return lines.join('\n')
    }

    /**
     * Builds a deterministic JSON netlist contract.
     * @param {object} bundle Normalized design bundle or effective variant.
     * @returns {{ schema: string, project: string, nets: object[] }}
     */
    static buildNetlistJson(bundle) {
        const projectName =
            bundle?.project?.name ||
            bundle?.projectName ||
            bundle?.name ||
            bundle?.summary?.title ||
            ''
        const nets = (bundle?.nets || [])
            .map((net) => ({
                name: trim(net?.name),
                aliases: netAliases(net),
                autoNamed: isAutoNamedNet(net?.name),
                signal: signalDescriptor(net),
                pins: netPins(net),
                sources: netSources(net),
                pcb: pcbSources(net),
                excludedDesignators: net.excludedDesignators || []
            }))
            .filter((net) => net.name)
            .sort((left, right) => naturalSort(left.name, right.name))

        return {
            schema: netlistSchema,
            project: projectName,
            nets
        }
    }
}

/**
 * Extracts deterministic pins from one normalized net row.
 * @param {object} net Net row.
 * @returns {object[]}
 */
function netPins(net) {
    const pins = (net?.pins || [])
        .map(pinDescriptor)
        .filter((pin) => pin.component && pin.pin)

    return dedupePins(pins).sort((left, right) => {
        return (
            naturalSort(left.component, right.component) ||
            naturalSort(left.pin, right.pin)
        )
    })
}

/**
 * Deduplicates pins while preserving first-seen data.
 * @param {object[]} pins Candidate pins.
 * @returns {object[]}
 */
function dedupePins(pins) {
    const byKey = new Map()
    for (const pin of pins || []) {
        const key = pin.component + '\u0000' + pin.pin
        if (!byKey.has(key)) {
            byKey.set(key, pin)
            continue
        }

        const existing = byKey.get(key)
        existing.duplicateOccurrences ||= []
        existing.duplicateOccurrences.push({
            component: pin.component,
            pin: pin.pin,
            name: pin.name
        })
    }
    return [...byKey.values()]
}

/**
 * Builds one terminal descriptor from a normalized pin row.
 * @param {object} pin Pin row.
 * @returns {object}
 */
function pinDescriptor(pin) {
    const pinNumber = pinNumberOf(pin)
    const name = trim(pin?.name)
    return stripEmpty({
        component: pinComponent(pin),
        pin: pinNumber,
        name: name && name !== pinNumber ? name : ''
    })
}

/**
 * Builds schematic source groups for one net.
 * @param {object} net Net row.
 * @returns {object[]}
 */
function netSources(net) {
    return (net?.schematic || []).map((source) => {
        const sheet = trim(source?.fileName)
        return stripEmpty({
            sheet,
            aliases: sourceAliases(source),
            graphicalElements: graphicalElements(source, sheet)
        })
    })
}

/**
 * Builds graphical element rows for one schematic net source.
 * @param {object} source Schematic net source.
 * @param {string} sheet Sheet file name.
 * @returns {object[]}
 */
function graphicalElements(source, sheet) {
    return [
        ...(source?.segments || []).map((segment, index) =>
            stripEmpty({
                kind: 'segment',
                key: sheet + ':segment:' + index,
                x1: segment.x1,
                y1: segment.y1,
                x2: segment.x2,
                y2: segment.y2
            })
        ),
        ...(source?.labels || []).map((label, index) =>
            stripEmpty({
                kind: 'label',
                key: sheet + ':label:' + index,
                text: label.text,
                x: label.x,
                y: label.y
            })
        )
    ]
}

/**
 * Extracts PCB net provenance rows.
 * @param {object} net Net row.
 * @returns {object[]}
 */
function pcbSources(net) {
    return (net?.pcb || []).map((entry) =>
        stripEmpty({
            fileName: entry.fileName,
            netIndex: entry.netIndex
        })
    )
}

/**
 * Collects known aliases for one net.
 * @param {object} net Net row.
 * @returns {string[]}
 */
function netAliases(net) {
    return dedupe(
        (net?.schematic || []).flatMap((source) => sourceAliases(source))
    )
}

/**
 * Collects aliases visible in one schematic net source.
 * @param {object} source Schematic source row.
 * @returns {string[]}
 */
function sourceAliases(source) {
    return dedupe([
        ...(source?.labels || []).map((label) => label.text),
        ...(source?.ports || []).map((port) => port.name),
        ...(source?.sheetEntries || []).map((entry) => entry.name)
    ])
}

/**
 * Builds signal shape metadata for one net.
 * @param {object} net Net row.
 * @returns {{ type: string, baseName: string, suffix: string, sourceHints: string[] }}
 */
function signalDescriptor(net) {
    const name = trim(net?.name)
    const bracket = name.match(/^(.+?)(\[[^\]]+\])$/u)
    const baseName = bracket ? bracket[1] : name
    const suffix = bracket ? bracket[2] : ''
    const sourceHints = signalSourceHints(net)
    let type = 'normal'

    if (suffix && /(?:\.\.|:|,)/u.test(suffix)) {
        type = 'wide'
    } else if (suffix) {
        type = 'sub'
    } else if (sourceHints.includes('bus')) {
        type = 'bus'
    }

    return { type, baseName, suffix, sourceHints }
}

/**
 * Collects source-derived signal hints.
 * @param {object} net Net row.
 * @returns {string[]}
 */
function signalSourceHints(net) {
    const hasBus = (net?.schematic || []).some((source) => {
        return (source?.segments || []).some(
            (segment) => segment?.isBus === true
        )
    })
    return hasBus ? ['bus'] : []
}

/**
 * Resolves a component designator from a pin row.
 * @param {object} pin Pin row.
 * @returns {string}
 */
function pinComponent(pin) {
    return trim(
        pin?.componentDesignator ||
            pin?.refdes ||
            pin?.ownerDesignator ||
            pin?.ownerIndex
    )
}

/**
 * Resolves a pin number from a pin row.
 * @param {object} pin Pin row.
 * @returns {string}
 */
function pinNumberOf(pin) {
    return trim(pin?.pin || pin?.designator || pin?.number || pin?.name)
}

/**
 * Returns true when a net name was synthesized.
 * @param {unknown} name Net name.
 * @returns {boolean}
 */
function isAutoNamedNet(name) {
    return /^UnknownNet\d+$/u.test(trim(name))
}

/**
 * Deduplicates non-empty strings.
 * @param {unknown[]} values Candidate values.
 * @returns {string[]}
 */
function dedupe(values) {
    return [...new Set((values || []).map(trim).filter(Boolean))]
}

/**
 * Drops empty object fields while preserving zero and false.
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

/**
 * Trims a value into a string.
 * @param {unknown} value Raw value.
 * @returns {string}
 */
function trim(value) {
    return String(value || '').trim()
}

/**
 * Sorts KiCad designator-like values naturally.
 * @param {string} left First value.
 * @param {string} right Second value.
 * @returns {number}
 */
function naturalSort(left, right) {
    return String(left).localeCompare(String(right), undefined, {
        numeric: true
    })
}
