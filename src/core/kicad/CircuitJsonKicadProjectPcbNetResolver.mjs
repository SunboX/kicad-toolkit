// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectContext as Context } from './CircuitJsonKicadProjectContext.mjs'
import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

/**
 * Resolves PCB export net names from direct and source-level references.
 */
export class CircuitJsonKicadProjectPcbNetResolver {
    /**
     * Resolves a KiCad net name using direct and source-level references.
     * @param {object} context Export context.
     * @param {object} element CircuitJSON element.
     * @returns {string}
     */
    static netName(context, element) {
        const direct = Context.netName(element)
        const directSourceNetName =
            CircuitJsonKicadProjectPcbNetResolver.sourceNetName(context, direct)
        if (directSourceNetName) return directSourceNetName

        const sourceNetName =
            CircuitJsonKicadProjectPcbNetResolver.sourceNetName(
                context,
                element?.source_net_id
            )
        if (sourceNetName) return sourceNetName

        const sourceTraceNetName =
            CircuitJsonKicadProjectPcbNetResolver.sourceTraceNetName(
                context,
                element?.source_trace_id
            )
        if (sourceTraceNetName) return sourceTraceNetName

        const portNetName = CircuitJsonKicadProjectPcbNetResolver.portNetName(
            context,
            element
        )
        if (portNetName) return portNetName

        const connectionName = Utils.text(element?.connection_name)
        const connectionSourceNetName =
            CircuitJsonKicadProjectPcbNetResolver.sourceNetName(
                context,
                connectionName
            )
        if (connectionSourceNetName) return connectionSourceNetName
        if (connectionName && context.netMap.has(connectionName)) {
            return connectionName
        }

        const connectivityKey = Utils.text(
            element?.subcircuit_connectivity_map_key
        )
        const connectivitySourceNetName =
            CircuitJsonKicadProjectPcbNetResolver.sourceNetNameForConnectivityKey(
                context,
                connectivityKey
            )
        if (connectivitySourceNetName) return connectivitySourceNetName
        if (connectivityKey && context.netMap.has(connectivityKey)) {
            return connectivityKey
        }

        if (direct && context.netMap.has(direct)) return direct
        return direct
    }

    /**
     * Resolves a pad net through PCB and source-port connectivity.
     * @param {object} context Export context.
     * @param {object} element CircuitJSON element.
     * @returns {string}
     */
    static portNetName(context, element) {
        const pcbPort =
            CircuitJsonKicadProjectPcbNetResolver.pcbPort(
                context,
                element?.pcb_port_id
            ) || {}
        const sourcePort =
            CircuitJsonKicadProjectPcbNetResolver.sourcePort(
                context,
                pcbPort.source_port_id || element?.source_port_id
            ) || {}

        for (const candidate of [
            sourcePort.source_net_id,
            sourcePort.net,
            sourcePort.net_name,
            sourcePort.connection_name,
            pcbPort.source_net_id,
            pcbPort.net,
            pcbPort.net_name,
            pcbPort.connection_name
        ]) {
            const text = Utils.text(candidate)
            const sourceNetName =
                CircuitJsonKicadProjectPcbNetResolver.sourceNetName(
                    context,
                    text
                )
            if (sourceNetName) return sourceNetName
            if (text && context.netMap.has(text)) return text
        }

        for (const key of [
            sourcePort.subcircuit_connectivity_map_key,
            pcbPort.subcircuit_connectivity_map_key,
            element?.subcircuit_connectivity_map_key
        ]) {
            const name =
                CircuitJsonKicadProjectPcbNetResolver.sourceNetNameForConnectivityKey(
                    context,
                    key
                )
            if (name) return name
        }

        const sourceTracePortNetName =
            CircuitJsonKicadProjectPcbNetResolver.sourceTracePortNetName(
                context,
                sourcePort.source_port_id ||
                    pcbPort.source_port_id ||
                    element?.source_port_id
            )
        if (sourceTracePortNetName) return sourceTracePortNetName

        return ''
    }

    /**
     * Resolves a source trace net through one connected source port.
     * @param {object} context Export context.
     * @param {unknown} sourcePortId Source port id.
     * @returns {string}
     */
    static sourceTracePortNetName(context, sourcePortId) {
        const id = Utils.text(sourcePortId)
        if (!id) return ''
        const traces = context.sourceTracesByPort?.get(id) || []
        for (const trace of traces) {
            const name =
                CircuitJsonKicadProjectPcbNetResolver.sourceTraceNetName(
                    context,
                    trace.source_trace_id
                )
            if (name) return name
        }
        return ''
    }

    /**
     * Resolves a source trace's connected net name.
     * @param {object} context Export context.
     * @param {unknown} sourceTraceId Source trace id.
     * @returns {string}
     */
    static sourceTraceNetName(context, sourceTraceId) {
        const id = Utils.text(sourceTraceId)
        if (!id) return ''
        const directSourceNetName =
            CircuitJsonKicadProjectPcbNetResolver.sourceNetName(context, id)
        if (directSourceNetName) return directSourceNetName
        const sourceTrace = CircuitJsonKicadProjectPcbNetResolver.sourceTrace(
            context,
            id
        )
        if (!sourceTrace) return context.netMap.has(id) ? id : ''

        const sourceNetIds = Array.isArray(sourceTrace.connected_source_net_ids)
            ? sourceTrace.connected_source_net_ids
            : []
        for (const sourceNetId of sourceNetIds) {
            const name = CircuitJsonKicadProjectPcbNetResolver.sourceNetName(
                context,
                sourceNetId
            )
            if (name) return name
        }

        for (const key of [
            sourceTrace.source_net_id,
            sourceTrace.connection_name,
            sourceTrace.subcircuit_connectivity_map_key,
            Context.netName(sourceTrace)
        ]) {
            const text = Utils.text(key)
            const name = CircuitJsonKicadProjectPcbNetResolver.sourceNetName(
                context,
                text
            )
            if (name) return name
            if (text && context.netMap.has(text)) return text
        }

        return ''
    }

    /**
     * Resolves a source net display name from an id.
     * @param {object} context Export context.
     * @param {unknown} sourceNetId Source net id.
     * @returns {string}
     */
    static sourceNetName(context, sourceNetId) {
        const sourceNet = CircuitJsonKicadProjectPcbNetResolver.sourceNet(
            context,
            sourceNetId
        )
        return sourceNet
            ? CircuitJsonKicadProjectPcbNetResolver.sourceNetDisplayName(
                  sourceNet
              )
            : ''
    }

    /**
     * Resolves a source net display name for a connectivity key.
     * @param {object} context Export context.
     * @param {unknown} connectivityKey Source connectivity key.
     * @returns {string}
     */
    static sourceNetNameForConnectivityKey(context, connectivityKey) {
        const sourceNet =
            CircuitJsonKicadProjectPcbNetResolver.sourceNetForConnectivityKey(
                context,
                connectivityKey
            )
        return sourceNet
            ? CircuitJsonKicadProjectPcbNetResolver.sourceNetDisplayName(
                  sourceNet
              )
            : ''
    }

    /**
     * Resolves a source net display name.
     * @param {object} sourceNet Source net row.
     * @returns {string}
     */
    static sourceNetDisplayName(sourceNet) {
        return Utils.text(
            sourceNet.raw_name || sourceNet.name || sourceNet.source_net_id
        )
    }

    /**
     * Looks up a source net by id.
     * @param {object} context Export context.
     * @param {unknown} sourceNetId Source net id.
     * @returns {object | null}
     */
    static sourceNet(context, sourceNetId) {
        const id = Utils.text(sourceNetId)
        if (!id) return null
        return (
            context.sourceNets?.get(id) ||
            context.elements.find(
                (element) =>
                    element?.type === 'source_net' &&
                    Utils.text(element.source_net_id) === id
            ) ||
            null
        )
    }

    /**
     * Looks up a source net by subcircuit connectivity key.
     * @param {object} context Export context.
     * @param {unknown} connectivityKey Source connectivity key.
     * @returns {object | null}
     */
    static sourceNetForConnectivityKey(context, connectivityKey) {
        const key = Utils.text(connectivityKey)
        if (!key) return null
        const sourceNets = [
            ...Array.from(context.sourceNets?.values() || []),
            ...context.elements.filter(
                (element) => element?.type === 'source_net'
            )
        ]
        return (
            sourceNets.find(
                (sourceNet) =>
                    Utils.text(sourceNet.subcircuit_connectivity_map_key) ===
                    key
            ) || null
        )
    }

    /**
     * Looks up a source trace by id.
     * @param {object} context Export context.
     * @param {unknown} sourceTraceId Source trace id.
     * @returns {object | null}
     */
    static sourceTrace(context, sourceTraceId) {
        const id = Utils.text(sourceTraceId)
        if (!id) return null
        return (
            context.sourceTraces?.get(id) ||
            context.elements.find(
                (element) =>
                    element?.type === 'source_trace' &&
                    Utils.text(element.source_trace_id) === id
            ) ||
            null
        )
    }

    /**
     * Looks up a PCB port by id.
     * @param {object} context Export context.
     * @param {unknown} pcbPortId PCB port id.
     * @returns {object | null}
     */
    static pcbPort(context, pcbPortId) {
        const id = Utils.text(pcbPortId)
        if (!id) return null
        return (
            context.pcbPorts?.get(id) ||
            context.elements.find(
                (element) =>
                    element?.type === 'pcb_port' &&
                    Utils.text(element.pcb_port_id) === id
            ) ||
            null
        )
    }

    /**
     * Looks up a source port by id.
     * @param {object} context Export context.
     * @param {unknown} sourcePortId Source port id.
     * @returns {object | null}
     */
    static sourcePort(context, sourcePortId) {
        const id = Utils.text(sourcePortId)
        if (!id) return null
        return (
            context.sourcePorts?.byId?.get(id) ||
            context.elements.find(
                (element) =>
                    element?.type === 'source_port' &&
                    Utils.text(element.source_port_id) === id
            ) ||
            null
        )
    }
}
