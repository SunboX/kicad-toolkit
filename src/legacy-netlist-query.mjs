// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Native KiCad netlist query API retained for explicit extension use.

export { RegexPattern } from './core/netlist-query/RegexPattern.mjs'
export {
    ComponentGrouping,
    MPN_MISSING_NOTE
} from './core/netlist-query/ComponentGrouping.mjs'
export { CircuitTraversal } from './core/netlist-query/CircuitTraversal.mjs'
export { QueryNetlistBuilder } from './core/netlist-query/QueryNetlistBuilder.mjs'
export { LoadedDesignNetlistService } from './core/netlist-query/LoadedDesignNetlistService.mjs'
