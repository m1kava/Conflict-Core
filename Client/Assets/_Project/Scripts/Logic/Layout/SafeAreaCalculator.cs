using System.Numerics;

namespace ConflictCore.Client.Logic.Layout
{
    /// <summary>Normalised anchors (0..1) of the safe area inside the full screen.</summary>
    public readonly struct SafeAreaAnchors
    {
        public SafeAreaAnchors(Vector2 min, Vector2 max)
        {
            Min = min;
            Max = max;
        }

        public Vector2 Min { get; }

        public Vector2 Max { get; }
    }

    /// <summary>
    /// Converts the OS safe area (notches, Dynamic Island, rounded corners, Android gesture/navigation bars)
    /// into UI anchors. HUD panels anchor inside these so nothing interactive sits under system UI.
    /// </summary>
    public static class SafeAreaCalculator
    {
        /// <param name="screenSize">Full screen size in pixels.</param>
        /// <param name="safeAreaPosition">Bottom-left of the safe area in pixels.</param>
        /// <param name="safeAreaSize">Size of the safe area in pixels.</param>
        /// <param name="minimumMarginPixels">Extra inset on every edge so touch targets never hug the bezel.</param>
        public static SafeAreaAnchors Compute(Vector2 screenSize, Vector2 safeAreaPosition, Vector2 safeAreaSize, float minimumMarginPixels)
        {
            if (screenSize.X <= 0f || screenSize.Y <= 0f)
            {
                return new SafeAreaAnchors(Vector2.Zero, Vector2.One);
            }

            Vector2 margin = new Vector2(minimumMarginPixels);
            Vector2 min = Vector2.Max(safeAreaPosition, margin);
            Vector2 max = Vector2.Min(safeAreaPosition + safeAreaSize, screenSize - margin);

            if (max.X <= min.X || max.Y <= min.Y)
            {
                return new SafeAreaAnchors(Vector2.Zero, Vector2.One);
            }

            return new SafeAreaAnchors(min / screenSize, max / screenSize);
        }
    }
}
