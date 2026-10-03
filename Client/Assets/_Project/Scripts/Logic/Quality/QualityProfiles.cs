using System;

namespace ConflictCore.Client.Logic.Quality
{
    /// <summary>
    /// The single source of quality preset values. Tuned against the device matrix in docs/PERFORMANCE.md;
    /// change values here together with the budget tables there.
    /// </summary>
    public static class QualityProfiles
    {
        public static QualityProfile Get(QualityTier tier)
        {
            switch (tier)
            {
                case QualityTier.Low:
                    return new QualityProfile
                    {
                        Tier = tier,
                        TargetFrameRate = 30,
                        RenderScale = 0.7f,
                        ShadowDistance = 0f,
                        ShadowCascades = 1,
                        ShadowResolution = 0,
                        SoftShadows = false,
                        MsaaSamples = 1,
                        PostProcessing = false,
                        Bloom = false,
                        MaxParticles = 800,
                        LodBias = 0.6f,
                        DetailDensity = 0f,
                        TextureMipmapLimit = 1,
                        ReflectionProbes = false,
                        DetailDrawDistance = 0f,
                    };
                case QualityTier.Medium:
                    return new QualityProfile
                    {
                        Tier = tier,
                        TargetFrameRate = 30,
                        RenderScale = 0.85f,
                        ShadowDistance = 90f,
                        ShadowCascades = 1,
                        ShadowResolution = 1024,
                        SoftShadows = false,
                        MsaaSamples = 1,
                        PostProcessing = true,
                        Bloom = false,
                        MaxParticles = 1500,
                        LodBias = 0.8f,
                        DetailDensity = 0.4f,
                        TextureMipmapLimit = 0,
                        ReflectionProbes = false,
                        DetailDrawDistance = 60f,
                    };
                case QualityTier.High:
                    return new QualityProfile
                    {
                        Tier = tier,
                        TargetFrameRate = 60,
                        RenderScale = 0.9f,
                        ShadowDistance = 140f,
                        ShadowCascades = 2,
                        ShadowResolution = 2048,
                        SoftShadows = true,
                        MsaaSamples = 2,
                        PostProcessing = true,
                        Bloom = true,
                        MaxParticles = 3000,
                        LodBias = 1f,
                        DetailDensity = 0.8f,
                        TextureMipmapLimit = 0,
                        ReflectionProbes = true,
                        DetailDrawDistance = 90f,
                    };
                case QualityTier.Ultra:
                    return new QualityProfile
                    {
                        Tier = tier,
                        TargetFrameRate = 60,
                        RenderScale = 1f,
                        ShadowDistance = 180f,
                        ShadowCascades = 2,
                        ShadowResolution = 2048,
                        SoftShadows = true,
                        MsaaSamples = 4,
                        PostProcessing = true,
                        Bloom = true,
                        MaxParticles = 5000,
                        LodBias = 1.25f,
                        DetailDensity = 1f,
                        TextureMipmapLimit = 0,
                        ReflectionProbes = true,
                        DetailDrawDistance = 120f,
                    };
                default:
                    throw new ArgumentOutOfRangeException(nameof(tier), tier, "Unknown quality tier.");
            }
        }
    }
}
