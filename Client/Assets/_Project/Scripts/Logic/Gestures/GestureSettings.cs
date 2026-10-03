namespace ConflictCore.Client.Logic.Gestures
{
    /// <summary>
    /// Gesture thresholds. Distances are in density-independent points (1/160 inch) and converted with the
    /// device DPI so behaviour feels identical on a 5" phone and a 13" tablet. Player-adjustable values are
    /// surfaced in the settings menu.
    /// </summary>
    public sealed class GestureSettings
    {
        public float TapSlopPoints { get; set; } = 10f;

        public float MaxTapSeconds { get; set; } = 0.30f;

        public float DoubleTapSeconds { get; set; } = 0.30f;

        public float DoubleTapSlopPoints { get; set; } = 28f;

        public float LongPressSeconds { get; set; } = 0.45f;

        /// <summary>Velocity averaging window for pan release (smooths jittery last frames).</summary>
        public float VelocitySmoothing { get; set; } = 0.35f;

        /// <summary>Converts points to pixels for the given screen DPI (160 DPI = 1 point per pixel).</summary>
        public static float PointsToPixels(float points, float dpi) => points * (dpi > 0f ? dpi : 160f) / 160f;
    }
}
