// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Native KiCad renderer API retained for explicit extension use.

export { BomTableRenderer } from './ui/BomTableRenderer.mjs'
export { KicadStrokeFont } from './ui/KicadStrokeFont.mjs'
export { KicadPcbRenderOutlineAdapter } from './ui/KicadPcbRenderOutlineAdapter.mjs'
export { KicadSvgUtils } from './ui/KicadSvgUtils.mjs'
export { PcbArcUtils } from './ui/PcbArcUtils.mjs'
export { PcbEdgeFacingGlyphNormalizer } from './ui/PcbEdgeFacingGlyphNormalizer.mjs'
export { PcbFootprintPrimitiveSelector } from './ui/PcbFootprintPrimitiveSelector.mjs'
export { PcbFootprintPadAxisNormalizer } from './ui/PcbFootprintPadAxisNormalizer.mjs'
export { PcbInteractionIndex } from './ui/PcbInteractionIndex.mjs'
export { PcbInteractionItemRegistry } from './ui/PcbInteractionItemRegistry.mjs'
export { PcbInteractionLayerModel } from './ui/PcbInteractionLayerModel.mjs'
export {
    PcbSideResolvedRenderModel,
    isCopperPrimitive,
    preparePcbSideResolvedRenderModel
} from './ui/PcbSideResolvedRenderModel.mjs'
export { PcbSvgSemanticMetadata } from './ui/PcbSvgSemanticMetadata.mjs'
export { PcbSvgRenderer } from './ui/PcbSvgRenderer.mjs'
export { SchematicRenderOpsSidecarBuilder } from './ui/SchematicRenderOpsSidecarBuilder.mjs'
export { SchematicColorResolver } from './ui/SchematicColorResolver.mjs'
export { SchematicContentLayout } from './ui/SchematicContentLayout.mjs'
export { SchematicOwnerPinLabelLayout } from './ui/SchematicOwnerPinLabelLayout.mjs'
export { SchematicProjectParameterResolver } from './ui/SchematicProjectParameterResolver.mjs'
export { SchematicSvgUtils } from './ui/SchematicSvgUtils.mjs'
export { SchematicSvgSemanticMetadata } from './ui/SchematicSvgSemanticMetadata.mjs'
export { SchematicSvgRenderer } from './ui/SchematicSvgRenderer.mjs'
export { SchematicSvgTextMetrics } from './ui/SchematicSvgTextMetrics.mjs'
export { SchematicTypography } from './ui/SchematicTypography.mjs'
