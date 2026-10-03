using System;
using System.Numerics;

namespace ConflictCore.Client.Logic.CameraControl
{
    /// <summary>
    /// Engine-independent RTS camera: ground focus point, yaw, zoom and pitch, with finger-locked panning,
    /// release inertia, smoothed pinch/twist and map-bound clamping.
    /// </summary>
    /// <remarks>
    /// World axes: X east, Y up, Z north. The camera looks at <see cref="Focus"/> from <see cref="Distance"/>
    /// metres away, <see cref="Pitch"/> degrees below the horizon, heading <see cref="Yaw"/> (0 = north).
    /// The Unity rig maps <see cref="Position"/> and Euler(<see cref="Pitch"/>, <see cref="Yaw"/>, 0) onto
    /// the camera transform. Purely visual: nothing here affects the simulation.
    /// </remarks>
    public sealed class RtsCameraModel
    {
        private const float DegreesToRadians = (float)(Math.PI / 180.0);

        private readonly RtsCameraSettings _settings;

        private Vector2 _focus;
        private Vector2 _velocity;
        private float _zoom = 0.5f;
        private float _targetZoom = 0.5f;
        private float _yaw;
        private float _targetYaw;
        private Vector2 _boundsMin = new Vector2(float.MinValue, float.MinValue);
        private Vector2 _boundsMax = new Vector2(float.MaxValue, float.MaxValue);

        public RtsCameraModel(RtsCameraSettings settings)
        {
            _settings = settings ?? throw new ArgumentNullException(nameof(settings));
        }

        /// <summary>Ground point at the centre of the view (X, Z).</summary>
        public Vector2 Focus => _focus;

        /// <summary>0 = closest zoom, 1 = farthest.</summary>
        public float Zoom => _zoom;

        public float Distance => Lerp(_settings.MinDistance, _settings.MaxDistance, _zoom);

        public float Pitch => Lerp(_settings.MinPitch, _settings.MaxPitch, _zoom);

        public float Yaw => _yaw;

        public Vector2 InertiaVelocity => _velocity;

        public Vector3 Position
        {
            get
            {
                float pitch = Pitch * DegreesToRadians;
                float yaw = _yaw * DegreesToRadians;
                float horizontal = Distance * (float)Math.Cos(pitch);
                return new Vector3(
                    _focus.X - ((float)Math.Sin(yaw) * horizontal),
                    Distance * (float)Math.Sin(pitch),
                    _focus.Y - ((float)Math.Cos(yaw) * horizontal));
            }
        }

        /// <summary>Restricts the focus point to the playable map rectangle.</summary>
        public void SetBounds(Vector2 min, Vector2 max)
        {
            if (min.X > max.X || min.Y > max.Y)
            {
                throw new ArgumentException("Bounds minimum exceeds maximum.");
            }

            _boundsMin = min;
            _boundsMax = max;
            _focus = ClampToBounds(_focus);
        }

        /// <summary>Jumps to a location immediately (minimap tap, base hotkey, alert).</summary>
        public void JumpTo(Vector2 focus)
        {
            _focus = ClampToBounds(focus);
            _velocity = Vector2.Zero;
        }

        public void SetZoomImmediate(float zoom)
        {
            _zoom = Clamp01(zoom);
            _targetZoom = _zoom;
        }

        /// <summary>Finger drag. The ground under the finger stays under the finger.</summary>
        public void Pan(Vector2 screenDelta, float viewportHeightPixels)
        {
            _velocity = Vector2.Zero;
            _focus = ClampToBounds(_focus + ScreenToGroundDelta(screenDelta, viewportHeightPixels));
        }

        /// <summary>Finger released mid-drag: keep gliding with the release velocity (pixels per second).</summary>
        public void ReleasePan(Vector2 screenVelocity, float viewportHeightPixels)
        {
            Vector2 velocity = ScreenToGroundDelta(screenVelocity, viewportHeightPixels);
            float maxSpeed = VisibleGroundHeight() * _settings.MaxInertiaScreensPerSecond;
            float speed = velocity.Length();
            _velocity = speed > maxSpeed ? velocity * (maxSpeed / speed) : velocity;
        }

        /// <summary>Touching the screen stops any glide.</summary>
        public void StopInertia() => _velocity = Vector2.Zero;

        /// <summary>Pinch: <paramref name="scale"/> &gt; 1 (fingers apart) zooms in.</summary>
        public void Pinch(float scale)
        {
            if (scale <= 0f || float.IsNaN(scale))
            {
                return;
            }

            float distance = Lerp(_settings.MinDistance, _settings.MaxDistance, _targetZoom);
            float sensitivityScale = (float)Math.Pow(scale, _settings.ZoomSensitivity);
            float newDistance = distance / sensitivityScale;
            _targetZoom = Clamp01(InverseLerp(_settings.MinDistance, _settings.MaxDistance, newDistance));
        }

        /// <summary>Two-finger twist, counter-clockwise positive on screen.</summary>
        public void Twist(float degrees)
        {
            if (_settings.RotationEnabled)
            {
                _targetYaw -= degrees;
            }
        }

        /// <summary>Advances inertia and smoothing by one rendered frame.</summary>
        public void Update(float deltaTime)
        {
            if (deltaTime <= 0f)
            {
                return;
            }

            if (_velocity != Vector2.Zero)
            {
                Vector2 next = _focus + (_velocity * deltaTime);
                Vector2 clamped = ClampToBounds(next);
                _velocity = new Vector2(
                    clamped.X == next.X ? _velocity.X : 0f,
                    clamped.Y == next.Y ? _velocity.Y : 0f);
                _focus = clamped;

                _velocity *= (float)Math.Exp(-_settings.InertiaDamping * deltaTime);
                if (_velocity.LengthSquared() < 0.0001f)
                {
                    _velocity = Vector2.Zero;
                }
            }

            float blend = 1f - (float)Math.Exp(-_settings.Smoothing * deltaTime);
            _zoom = Lerp(_zoom, _targetZoom, blend);
            _yaw = Lerp(_yaw, _targetYaw, blend);
        }

        /// <summary>Metres of ground covered by the viewport height at the focus point.</summary>
        public float VisibleGroundHeight() =>
            2f * Distance * (float)Math.Tan(_settings.VerticalFieldOfView * 0.5f * DegreesToRadians);

        private Vector2 ScreenToGroundDelta(Vector2 screenDelta, float viewportHeightPixels)
        {
            if (viewportHeightPixels <= 0f)
            {
                return Vector2.Zero;
            }

            float metresPerPixel = VisibleGroundHeight() / viewportHeightPixels * _settings.PanSensitivity;

            // Screen-vertical motion maps onto foreshortened ground, which is stretched by 1/sin(pitch).
            float depthStretch = 1f / Math.Max(0.2f, (float)Math.Sin(Pitch * DegreesToRadians));

            float yaw = _yaw * DegreesToRadians;
            var right = new Vector2((float)Math.Cos(yaw), -(float)Math.Sin(yaw));
            var forward = new Vector2((float)Math.Sin(yaw), (float)Math.Cos(yaw));

            // Content follows the finger, so the camera moves opposite to the drag.
            return -((right * screenDelta.X * metresPerPixel) + (forward * screenDelta.Y * metresPerPixel * depthStretch));
        }

        private Vector2 ClampToBounds(Vector2 point) => Vector2.Clamp(point, _boundsMin, _boundsMax);

        private static float Lerp(float a, float b, float t) => a + ((b - a) * t);

        private static float InverseLerp(float a, float b, float value) => Math.Abs(b - a) < 1e-6f ? 0f : (value - a) / (b - a);

        private static float Clamp01(float value) => value < 0f ? 0f : value > 1f ? 1f : value;
    }
}
