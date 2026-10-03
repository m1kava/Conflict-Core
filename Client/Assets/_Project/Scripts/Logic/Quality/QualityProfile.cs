namespace ConflictCore.Client.Logic.Quality
{
    public enum QualityTier
    {
        Low = 0,
        Medium = 1,
        High = 2,
        Ultra = 3,
    }

    /// <summary>
    /// Every rendering knob a quality preset controls. Budgets here are enforced by the corresponding
    /// subsystems (VFX pool caps particles, LOD system applies bias, etc.). See docs/PERFORMANCE.md.
    /// </summary>
    public sealed class QualityProfile
    {
        public QualityTier Tier { get; set; }

        public int TargetFrameRate { get; set; }

        /// <summary>3D render resolution relative to native (UI always renders at native resolution).</summary>
        public float RenderScale { get; set; }

        public float ShadowDistance { get; set; }

        public int ShadowCascades { get; set; }

        /// <summary>0 disables real-time shadows (blob shadows remain).</summary>
        public int ShadowResolution { get; set; }

        public bool SoftShadows { get; set; }

        /// <summary>MSAA sample count: 1 (off), 2 or 4.</summary>
        public int MsaaSamples { get; set; }

        public bool PostProcessing { get; set; }

        public bool Bloom { get; set; }

        /// <summary>Global cap on simultaneously simulated particles across all pooled VFX.</summary>
        public int MaxParticles { get; set; }

        /// <summary>Multiplier on authored LOD switch distances (lower = earlier switch to cheaper LODs).</summary>
        public float LodBias { get; set; }

        /// <summary>Terrain detail (grass, small props) density multiplier.</summary>
        public float DetailDensity { get; set; }

        /// <summary>Highest texture mip level loaded (0 = full resolution, 1 = half...).</summary>
        public int TextureMipmapLimit { get; set; }

        public bool ReflectionProbes { get; set; }

        public float DetailDrawDistance { get; set; }
    }
}
