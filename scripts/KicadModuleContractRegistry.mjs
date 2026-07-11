// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFile } from 'node:fs/promises'

import { parse } from 'acorn'

/**
 * Loads runtime values and their exact local module symbols.
 */
export class KicadModuleContractRegistry {
    /**
     * Loads local imports and re-exports reachable from one entrypoint.
     * @param {string} target Repository-relative entrypoint target.
     * @param {URL} root Source tree root.
     * @returns {Promise<KicadModuleContractRegistry>} Module registry.
     */
    static async load(target, root) {
        const registry = new KicadModuleContractRegistry()
        await registry.#visit(new URL(target, root))
        return registry
    }

    /**
     * Creates an empty registry.
     */
    constructor() {
        this.values = {}
        this.modules = new Map()
        this.contexts = new Map()
        this.localValues = new Map()
    }

    /**
     * Returns the defining source context for a runtime value.
     * @param {unknown} value Runtime value.
     * @returns {object | null} Symbol context.
     */
    contextFor(value) {
        return this.contexts.get(value) || null
    }

    /**
     * Returns a runtime value for one defining module-local symbol.
     * @param {object} module Module record.
     * @param {string} localName Local symbol name.
     * @returns {unknown} Runtime value or undefined.
     */
    valueFor(module, localName) {
        return this.localValues.get(`${module.url.href}#${localName}`)
    }

    /**
     * Loads one module and its local dependencies.
     * @param {URL} url Module URL.
     * @returns {Promise<void>}
     */
    async #visit(url) {
        if (this.modules.has(url.href)) return
        const source = await readFile(url, 'utf8')
        const program = parse(source, {
            ecmaVersion: 'latest',
            sourceType: 'module',
            allowHashBang: true
        })
        const module = {
            url,
            source,
            program,
            namespace: null,
            imports: new Map(),
            declarations: topLevelDeclarations(program)
        }
        this.modules.set(url.href, module)
        for (const declaration of program.body) {
            const specifier = declaration.source?.value
            if (!isLocalModuleSpecifier(specifier)) continue
            await this.#visit(new URL(specifier, url))
        }
        module.namespace = await import(url.href)
        Object.assign(this.values, module.namespace)
        await this.#bindImports(module)
        this.#bindRuntimeContexts(module)
    }

    /**
     * Binds exact import aliases for one module.
     * @param {object} module Module record.
     * @returns {Promise<void>}
     */
    async #bindImports(module) {
        for (const declaration of module.program.body) {
            const specifier = declaration.source?.value
            if (!isLocalModuleSpecifier(specifier)) continue
            const importedUrl = new URL(specifier, module.url)
            const imported = this.modules.get(importedUrl.href)?.namespace
            if (!imported) continue
            for (const binding of declaration.specifiers || []) {
                if (binding.type === 'ImportNamespaceSpecifier') {
                    module.imports.set(binding.local.name, {
                        kind: 'namespace',
                        namespace: imported
                    })
                    continue
                }
                const importedName =
                    binding.type === 'ImportDefaultSpecifier'
                        ? 'default'
                        : binding.imported?.name
                if (importedName && importedName in imported) {
                    const value = imported[importedName]
                    module.imports.set(binding.local.name, {
                        kind: 'runtime',
                        value
                    })
                    this.values[binding.local.name] = value
                }
            }
        }
    }

    /**
     * Associates exported runtime values with their defining declarations.
     * @param {object} module Module record.
     * @returns {void}
     */
    #bindRuntimeContexts(module) {
        for (const [exportName, value] of Object.entries(module.namespace)) {
            if (this.contexts.has(value)) continue
            const localName = exportedLocalName(module.program, exportName)
            const declaration = module.declarations.get(localName)
            if (!declaration) continue
            this.contexts.set(value, {
                module,
                exportName,
                localName,
                declaration
            })
            this.localValues.set(`${module.url.href}#${localName}`, value)
        }
    }
}

/**
 * Returns whether one import source is a local JavaScript module.
 * @param {unknown} specifier Import specifier.
 * @returns {boolean} Local-module flag.
 */
function isLocalModuleSpecifier(specifier) {
    return (
        typeof specifier === 'string' &&
        specifier.startsWith('.') &&
        specifier.endsWith('.mjs')
    )
}

/**
 * Collects top-level class, function, and variable declarations.
 * @param {object} program Program node.
 * @returns {Map<string, object>} Declarations by local name.
 */
function topLevelDeclarations(program) {
    const declarations = new Map()
    for (const statement of program.body) {
        const node = statement.declaration || statement
        if (
            ['ClassDeclaration', 'FunctionDeclaration'].includes(node.type) &&
            node.id
        ) {
            declarations.set(node.id.name, node)
        }
        if (node.type === 'VariableDeclaration') {
            for (const row of node.declarations) {
                if (row.id.type === 'Identifier') {
                    declarations.set(row.id.name, row)
                }
            }
        }
    }
    return declarations
}

/**
 * Resolves one exported name to its local declaration name.
 * @param {object} program Program node.
 * @param {string} exportName Export name.
 * @returns {string} Local name.
 */
function exportedLocalName(program, exportName) {
    for (const statement of program.body) {
        if (statement.type === 'ExportDefaultDeclaration') {
            if (exportName === 'default') {
                return statement.declaration.id?.name || 'default'
            }
        }
        if (statement.type !== 'ExportNamedDeclaration') continue
        const declaration = statement.declaration
        if (declaration?.id?.name === exportName) return exportName
        for (const specifier of statement.specifiers || []) {
            if (specifier.exported?.name === exportName && !statement.source) {
                return specifier.local.name
            }
        }
    }
    return exportName
}
