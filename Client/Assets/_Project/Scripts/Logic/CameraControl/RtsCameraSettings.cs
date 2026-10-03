namespace ConflictCore.Client.Logic.CameraControl
{
    /// <summary>
    /// Tunables for the RTS camera. Sensitivity values are player settings; the rest are design values for the
    /// classic high-angle RTS view (closer zoom = flatter, more cinematic angle).
    /// </summary>
    public sealed class RtsCameraSettings
    {
        public float MinDistance { get; set; } = 28f;

        public float MaxDistance { get; set; } = 140f;

        /// <summary>Pitch at closest zoom, degrees below the horizon.</summary>
        public float MinPitch { get; set; } = 42f;

        /// <summary>Pitch at farthest zoom.</summary>
        public float MaxPitch { get; set; } = 60f;

        public float VerticalFieldOfView { get; set; } = 35f;

        public float PanSensitivity { get; set; } = 1f;

        public float ZoomSensitivity { get; set; } = 1f;

        public bool RotationEnabled { get; set; } = true;

        /// <summary>Inertia decay rate (1/s). Higher stops sooner.</summary>
        public float InertiaDamping { get; set; } = 5f;

        /// <summary>Upper bound on inertial glide speed, as a multiple of the visible ground height per second.</summary>
        public float MaxInertiaScreensPerSecond { get; set; } = 2.5f;

        /// <summary>Zoom/rotation smoothing rate (1/s). Panning is 1:1 under the finger and never smoothed.</summary>
        public float Smoothing { get; set; } = 16f;
    }
}
