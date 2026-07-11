const GENERATED_ASSETS = new WeakMap()

/** Carries generated source assets beside a projected CircuitJSON array. */
export class CircuitJsonGeneratedAssetContext {
    /**
     * Attaches generated assets without serializing them into model rows.
     * @template {object[]} T
     * @param {T} model Projected CircuitJSON model.
     * @param {object[]} assets Generated raw assets.
     * @returns {T} The same model.
     */
    static attach(model, assets) {
        if (Array.isArray(model)) {
            GENERATED_ASSETS.set(model, Array.from(assets || []))
        }
        return model
    }

    /**
     * Returns generated assets for one exact projected model.
     * @param {unknown} model CircuitJSON model.
     * @returns {object[]} Generated assets.
     */
    static forModel(model) {
        return Array.isArray(model)
            ? Array.from(GENERATED_ASSETS.get(model) || [])
            : []
    }
}

Object.freeze(CircuitJsonGeneratedAssetContext.prototype)
Object.freeze(CircuitJsonGeneratedAssetContext)
