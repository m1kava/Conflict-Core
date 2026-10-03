using ConflictCore.Client.Logic.Quality;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace ConflictCore.Client.Quality
{
    /// <summary>Applies a <see cref="QualityProfile"/> to Unity and the active URP asset.</summary>
    public static class QualityPresetApplier
    {
        private static UniversalRenderPipelineAsset? _runtimePipeline;

        public static QualityTier DetectDefaultTier()
        {
            var device = new DeviceCapabilities(
                SystemInfo.systemMemorySize,
                SystemInfo.graphicsMemorySize,
                SystemInfo.processorCount,
                SystemInfo.supportsComputeShaders,
                isTablet: Mathf.Min(Screen.width, Screen.height) / Mathf.Max(Screen.dpi, 1f) > 3.5f);
            return DeviceTierClassifier.Classify(device);
        }

        public static void Apply(QualityProfile profile)
        {
            Application.targetFrameRate = profile.TargetFrameRate;
            QualitySettings.vSyncCount = 0;
            QualitySettings.lodBias = profile.LodBias;
            QualitySettings.globalTextureMipmapLimit = profile.TextureMipmapLimit;
            QualitySettings.realtimeReflectionProbes = profile.ReflectionProbes;
            // Fully qualified: URP also defines a ShadowQuality enum.
            QualitySettings.shadows = profile.ShadowResolution > 0
                ? (profile.SoftShadows ? UnityEngine.ShadowQuality.All : UnityEngine.ShadowQuality.HardOnly)
                : UnityEngine.ShadowQuality.Disable;

            UniversalRenderPipelineAsset? urp = GetRuntimePipeline();
            if (urp != null)
            {
                urp.renderScale = profile.RenderScale;
                urp.shadowDistance = profile.ShadowDistance;
                urp.shadowCascadeCount = profile.ShadowCascades;
                urp.msaaSampleCount = profile.MsaaSamples;
            }
            else
            {
                Debug.LogWarning("Quality preset applied without a URP asset; render scale and shadows unchanged.");
            }
        }

        /// <summary>
        /// Returns a runtime clone of the project's URP asset. Mutating the original would write player-specific
        /// settings back into the project asset when running in the editor.
        /// </summary>
        private static UniversalRenderPipelineAsset? GetRuntimePipeline()
        {
            if (_runtimePipeline != null)
            {
                return _runtimePipeline;
            }

            if (!(GraphicsSettings.currentRenderPipeline is UniversalRenderPipelineAsset source))
            {
                return null;
            }

            _runtimePipeline = Object.Instantiate(source);
            _runtimePipeline.name = source.name + " (Runtime)";
            QualitySettings.renderPipeline = _runtimePipeline;
            return _runtimePipeline;
        }
    }
}
