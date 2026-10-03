namespace ConflictCore.Client.Logic.Quality
{
    /// <summary>Hardware facts the classifier needs, gathered by the engine adapter.</summary>
    public readonly struct DeviceCapabilities
    {
        public DeviceCapabilities(int systemMemoryMb, int graphicsMemoryMb, int processorCount, bool supportsComputeShaders, bool isTablet)
        {
            SystemMemoryMb = systemMemoryMb;
            GraphicsMemoryMb = graphicsMemoryMb;
            ProcessorCount = processorCount;
            SupportsComputeShaders = supportsComputeShaders;
            IsTablet = isTablet;
        }

        public int SystemMemoryMb { get; }

        public int GraphicsMemoryMb { get; }

        public int ProcessorCount { get; }

        public bool SupportsComputeShaders { get; }

        public bool IsTablet { get; }
    }

    /// <summary>
    /// Picks the default quality tier on first launch. Deliberately conservative: a smooth 30 FPS beats a
    /// stuttering 60. Players can override the choice, and a frame-time watchdog (Phase 6) can step a tier
    /// down after sustained budget overruns. A device allow/deny list will refine this once telemetry exists.
    /// </summary>
    public static class DeviceTierClassifier
    {
        private const int UltraMemoryMb = 11_000;
        private const int HighMemoryMb = 7_000;
        private const int MediumMemoryMb = 3_500;
        private const int MinimumCoresForHigh = 8;

        public static QualityTier Classify(DeviceCapabilities device)
        {
            if (!device.SupportsComputeShaders || device.SystemMemoryMb < MediumMemoryMb)
            {
                return QualityTier.Low;
            }

            if (device.SystemMemoryMb >= UltraMemoryMb && device.ProcessorCount >= MinimumCoresForHigh)
            {
                return QualityTier.Ultra;
            }

            if (device.SystemMemoryMb >= HighMemoryMb && device.ProcessorCount >= MinimumCoresForHigh)
            {
                return QualityTier.High;
            }

            return QualityTier.Medium;
        }
    }
}
