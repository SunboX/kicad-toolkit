// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Collects paths from an abstract returned value.
 * @param {object} value Abstract value.
 * @param {string} prefix Parent path.
 * @param {Set<string>} fields Output fields.
 * @returns {void}
 */
export function collectPaths(value, prefix, fields) {
    if (value.kind === 'union') {
        for (const row of value.values) collectPaths(row, prefix, fields)
        return
    }
    if (value.kind === 'paths') {
        for (const path of value.paths) {
            fields.add(prefix ? `${prefix}.${path}` : path)
        }
        return
    }
    if (value.kind === 'array') {
        for (const row of value.values) {
            collectPaths(row, prefix ? `${prefix}[]` : '', fields)
        }
        return
    }
    if (value.kind !== 'object') return
    for (const [name, row] of value.properties) {
        const path = prefix ? `${prefix}.${name}` : name
        fields.add(path)
        collectPaths(row, path, fields)
    }
}

/**
 * Creates an unknown value.
 * @returns {object} Value.
 */
export function unknownValue() {
    return { kind: 'unknown' }
}

/**
 * Creates a primitive value, optionally preserving its literal identity.
 * @param {...unknown} values Zero or one literal value.
 * @returns {object} Value.
 */
export function primitiveValue(...values) {
    return values.length
        ? { kind: 'primitive', known: true, value: values[0] }
        : { kind: 'primitive', known: false }
}

/**
 * Creates an object value.
 * @param {Map<string, object>} properties Properties.
 * @returns {object} Value.
 */
export function objectValue(properties) {
    return { kind: 'object', properties }
}

/**
 * Creates an array value.
 * @param {object[]} values Items.
 * @returns {object} Value.
 */
export function arrayValue(values) {
    return { kind: 'array', values }
}

/**
 * Creates a callable value.
 * @param {object} definition Callable definition.
 * @param {object} closureState Closure state.
 * @returns {object} Value.
 */
export function callableValue(definition, closureState) {
    return { kind: 'callable', definition, closureState: closureState.fork() }
}

/**
 * Creates a documented path value.
 * @param {string[]} paths Paths.
 * @returns {object} Value.
 */
export function pathsValue(paths) {
    return { kind: 'paths', paths }
}

/**
 * Creates a flattened union.
 * @param {object[]} values Values.
 * @returns {object} Value.
 */
export function unionValue(values) {
    const flattened = values.flatMap((value) =>
        value?.kind === 'union' ? value.values : [value || unknownValue()]
    )
    return flattened.length === 1
        ? flattened[0]
        : { kind: 'union', values: flattened }
}

/**
 * Returns object properties across union values.
 * @param {object} value Abstract value.
 * @returns {Map<string, object>} Properties.
 */
export function objectProperties(value) {
    if (value.kind === 'object') return value.properties
    if (value.kind !== 'union') return new Map()
    const properties = new Map()
    for (const row of value.values) {
        for (const [name, child] of objectProperties(row)) {
            properties.set(
                name,
                properties.has(name)
                    ? unionValue([properties.get(name), child])
                    : child
            )
        }
    }
    return properties
}

/**
 * Resolves a property from object/union values.
 * @param {object} value Abstract value.
 * @param {string} name Property name.
 * @returns {object} Property value.
 */
export function propertyValue(value, name) {
    if (!name) return unknownValue()
    if (value.kind === 'object') {
        return value.properties.get(name) || unknownValue()
    }
    if (value.kind === 'union') {
        return unionValue(value.values.map((row) => propertyValue(row, name)))
    }
    return unknownValue()
}

/**
 * Returns a callable descriptor.
 * @param {object} value Abstract value.
 * @returns {object | null} Descriptor.
 */
export function callableDescriptor(value) {
    return value.kind === 'callable'
        ? {
              definition: value.definition,
              closureState: value.closureState
          }
        : null
}

/**
 * Sets one nested property path immutably.
 * @param {object} value Base value.
 * @param {string[]} path Property path.
 * @param {object} assigned Assigned value.
 * @returns {object} Updated value.
 */
export function setObjectPath(value, path, assigned) {
    const properties = new Map(objectProperties(value))
    const [name, ...rest] = path
    properties.set(
        name,
        rest.length
            ? setObjectPath(
                  properties.get(name) || objectValue(new Map()),
                  rest,
                  assigned
              )
            : assigned
    )
    return objectValue(properties)
}

/**
 * Resolves a member-assignment root and path.
 * @param {object} member Member expression.
 * @param {Function} propertyName Static property resolver.
 * @returns {{ name: string, path: string[] } | null} Assignment path.
 */
export function memberAssignment(member, propertyName) {
    const path = []
    let current = member
    while (current.type === 'MemberExpression') {
        const name = propertyName(current.property)
        if (!name) return null
        path.unshift(name)
        current = current.object
    }
    return current.type === 'Identifier' ? { name: current.name, path } : null
}
