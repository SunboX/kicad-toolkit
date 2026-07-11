// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Exact synthetic delegate for contract-resolution tests.
 */
export class ExactContractDelegate {
    /**
     * Returns the exact result contract.
     * @param {unknown} input Ignored input.
     * @param {object} [options] Delegate options.
     * @returns {object}
     */
    static run(input, options = {}) {
        void input
        return ExactContractDelegate.#build(options)
    }

    /**
     * Builds the exact result through a source-visible private method.
     * @param {object} options Delegate options.
     * @returns {object}
     */
    static #build(options) {
        return {
            exact: true,
            nested: { value: options.exactOption || 0 }
        }
    }
}
