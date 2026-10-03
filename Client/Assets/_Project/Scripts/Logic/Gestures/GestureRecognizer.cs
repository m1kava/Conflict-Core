using System;
using System.Collections.Generic;
using System.Numerics;

namespace ConflictCore.Client.Logic.Gestures
{
    /// <summary>
    /// Converts raw touches into RTS gestures. Pure state machine: no engine calls, no allocations per frame.
    /// </summary>
    /// <remarks>
    /// Mobile control scheme (see docs/GAMEPLAY.md, "Mobile controls"):
    /// <list type="bullet">
    /// <item>one-finger drag pans the camera (with inertia on release);</item>
    /// <item>tap selects / issues a context command; double-tap selects visible units of the same type;</item>
    /// <item>press-and-hold opens the context menu, and dragging after the hold draws a selection box;</item>
    /// <item>two fingers pinch-zoom, twist-rotate and pan together.</item>
    /// </list>
    /// When the second finger lifts, remaining fingers are ignored until all are released, so the end of a
    /// pinch never turns into an accidental tap or pan.
    /// </remarks>
    public sealed class GestureRecognizer
    {
        private const float MinPinchDistancePixels = 1f;

        private readonly GestureSettings _settings;

        private Mode _mode = Mode.Idle;
        private float _pixelsPerPoint = 1f;

        private int _primaryId;
        private Vector2 _start;
        private Vector2 _last;
        private float _startTime;
        private float _lastTime;
        private Vector2 _velocity;

        private int _secondaryId;
        private float _lastPinchDistance;
        private float _lastPinchAngle;
        private Vector2 _lastCentroid;

        private bool _hasPreviousTap;
        private float _previousTapTime;
        private Vector2 _previousTapPosition;

        public GestureRecognizer(GestureSettings settings)
        {
            _settings = settings ?? throw new ArgumentNullException(nameof(settings));
        }

        private enum Mode
        {
            Idle,
            Pending,
            Panning,
            LongPressHeld,
            BoxSelecting,
            TwoFinger,
            WaitForRelease,
        }

        /// <summary>Screen density used to convert point thresholds into pixels.</summary>
        public void SetScreenDpi(float dpi) => _pixelsPerPoint = GestureSettings.PointsToPixels(1f, dpi);

        /// <summary>Drops any gesture in progress (e.g. when the app is paused or a modal UI opens).</summary>
        public void Reset()
        {
            _mode = Mode.Idle;
            _velocity = Vector2.Zero;
        }

        /// <summary>
        /// Processes this frame's touches. <paramref name="touches"/> must include touches that ended this frame.
        /// Recognised gestures are appended to <paramref name="output"/>.
        /// </summary>
        public void Process(IReadOnlyList<TouchSample> touches, float time, List<GestureEvent> output)
        {
            int activeCount = CountActive(touches);

            switch (_mode)
            {
                case Mode.TwoFinger:
                    ProcessTwoFinger(touches, activeCount, output);
                    return;
                case Mode.WaitForRelease:
                    if (activeCount == 0)
                    {
                        _mode = Mode.Idle;
                    }

                    return;
            }

            if (activeCount >= 2)
            {
                BeginTwoFinger(touches, output);
                return;
            }

            if (_mode == Mode.Idle)
            {
                TryBeginSingle(touches, time);
                return;
            }

            if (!TryFind(touches, _primaryId, out TouchSample primary))
            {
                // Finger vanished without an Ended event (focus loss, OS gesture): treat as cancel.
                Cancel(output);
                return;
            }

            switch (_mode)
            {
                case Mode.Pending:
                    ProcessPending(primary, time, output);
                    break;
                case Mode.Panning:
                    ProcessPanning(primary, time, output);
                    break;
                case Mode.LongPressHeld:
                    ProcessLongPressHeld(primary, output);
                    break;
                case Mode.BoxSelecting:
                    ProcessBoxSelecting(primary, output);
                    break;
            }
        }

        private void TryBeginSingle(IReadOnlyList<TouchSample> touches, float time)
        {
            for (int i = 0; i < touches.Count; i++)
            {
                if (touches[i].State == TouchState.Began)
                {
                    _primaryId = touches[i].FingerId;
                    _start = touches[i].ScreenPosition;
                    _last = _start;
                    _startTime = time;
                    _lastTime = time;
                    _velocity = Vector2.Zero;
                    _mode = Mode.Pending;
                    return;
                }
            }
        }

        private void ProcessPending(TouchSample primary, float time, List<GestureEvent> output)
        {
            Vector2 position = primary.ScreenPosition;
            bool withinSlop = Vector2.Distance(position, _start) <= Pixels(_settings.TapSlopPoints);

            if (primary.State == TouchState.Canceled)
            {
                _mode = Mode.Idle;
                return;
            }

            if (primary.State == TouchState.Ended)
            {
                if (withinSlop && time - _startTime <= _settings.MaxTapSeconds)
                {
                    EmitTap(position, time, output);
                }

                _mode = Mode.Idle;
                return;
            }

            if (!withinSlop)
            {
                _mode = Mode.Panning;
                output.Add(new GestureEvent(GestureType.PanStart, position, _start));
                output.Add(new GestureEvent(GestureType.Pan, position, _start, position - _start));
                _last = position;
                _lastTime = time;
                return;
            }

            if (time - _startTime >= _settings.LongPressSeconds)
            {
                _mode = Mode.LongPressHeld;
                _hasPreviousTap = false;
                output.Add(new GestureEvent(GestureType.LongPress, position, _start));
            }
        }

        private void ProcessPanning(TouchSample primary, float time, List<GestureEvent> output)
        {
            Vector2 position = primary.ScreenPosition;
            Vector2 delta = position - _last;
            float deltaTime = time - _lastTime;

            if (deltaTime > 0f)
            {
                Vector2 instantaneous = delta / deltaTime;
                _velocity = Vector2.Lerp(_velocity, instantaneous, Clamp01(_settings.VelocitySmoothing));
            }

            if (delta != Vector2.Zero)
            {
                output.Add(new GestureEvent(GestureType.Pan, position, _start, delta));
            }

            _last = position;
            _lastTime = time;

            if (primary.State == TouchState.Ended || primary.State == TouchState.Canceled)
            {
                Vector2 velocity = primary.State == TouchState.Ended ? _velocity : Vector2.Zero;
                output.Add(new GestureEvent(GestureType.PanEnd, position, _start, velocity: velocity));
                _mode = Mode.Idle;
            }
        }

        private void ProcessLongPressHeld(TouchSample primary, List<GestureEvent> output)
        {
            if (!primary.IsActive)
            {
                _mode = Mode.Idle;
                return;
            }

            if (Vector2.Distance(primary.ScreenPosition, _start) > Pixels(_settings.TapSlopPoints))
            {
                _mode = Mode.BoxSelecting;
                _last = primary.ScreenPosition;
                output.Add(new GestureEvent(GestureType.BoxSelectUpdate, primary.ScreenPosition, _start));
            }
        }

        private void ProcessBoxSelecting(TouchSample primary, List<GestureEvent> output)
        {
            Vector2 position = primary.ScreenPosition;
            switch (primary.State)
            {
                case TouchState.Ended:
                    output.Add(new GestureEvent(GestureType.BoxSelectEnd, position, _start));
                    _mode = Mode.Idle;
                    return;
                case TouchState.Canceled:
                    output.Add(new GestureEvent(GestureType.BoxSelectCancel, position, _start));
                    _mode = Mode.Idle;
                    return;
            }

            if (position != _last)
            {
                output.Add(new GestureEvent(GestureType.BoxSelectUpdate, position, _start, position - _last));
                _last = position;
            }
        }

        private void BeginTwoFinger(IReadOnlyList<TouchSample> touches, List<GestureEvent> output)
        {
            // Close whatever single-finger gesture was running so consumers never see a dangling state.
            if (_mode == Mode.Panning)
            {
                output.Add(new GestureEvent(GestureType.PanEnd, _last, _start));
            }
            else if (_mode == Mode.BoxSelecting)
            {
                output.Add(new GestureEvent(GestureType.BoxSelectCancel, _last, _start));
            }

            int found = 0;
            for (int i = 0; i < touches.Count && found < 2; i++)
            {
                if (!touches[i].IsActive)
                {
                    continue;
                }

                if (found == 0)
                {
                    _primaryId = touches[i].FingerId;
                }
                else
                {
                    _secondaryId = touches[i].FingerId;
                }

                found++;
            }

            TryFind(touches, _primaryId, out TouchSample first);
            TryFind(touches, _secondaryId, out TouchSample second);
            MeasurePair(first.ScreenPosition, second.ScreenPosition, out _lastPinchDistance, out _lastPinchAngle, out _lastCentroid);
            _hasPreviousTap = false;
            _mode = Mode.TwoFinger;
        }

        private void ProcessTwoFinger(IReadOnlyList<TouchSample> touches, int activeCount, List<GestureEvent> output)
        {
            bool hasFirst = TryFind(touches, _primaryId, out TouchSample first) && first.IsActive;
            bool hasSecond = TryFind(touches, _secondaryId, out TouchSample second) && second.IsActive;

            if (!hasFirst || !hasSecond)
            {
                output.Add(new GestureEvent(GestureType.TwoFingerEnd, _lastCentroid));
                _mode = activeCount > 0 ? Mode.WaitForRelease : Mode.Idle;
                return;
            }

            MeasurePair(first.ScreenPosition, second.ScreenPosition, out float distance, out float angle, out Vector2 centroid);

            float scale = _lastPinchDistance > MinPinchDistancePixels ? distance / _lastPinchDistance : 1f;
            float rotation = WrapDegrees(angle - _lastPinchAngle);
            Vector2 delta = centroid - _lastCentroid;

            if (scale != 1f || rotation != 0f || delta != Vector2.Zero)
            {
                output.Add(new GestureEvent(GestureType.TwoFinger, centroid, delta: delta, scale: scale, rotationDegrees: rotation));
            }

            _lastPinchDistance = distance;
            _lastPinchAngle = angle;
            _lastCentroid = centroid;
        }

        private void EmitTap(Vector2 position, float time, List<GestureEvent> output)
        {
            bool isDouble = _hasPreviousTap
                && time - _previousTapTime <= _settings.DoubleTapSeconds
                && Vector2.Distance(position, _previousTapPosition) <= Pixels(_settings.DoubleTapSlopPoints);

            if (isDouble)
            {
                output.Add(new GestureEvent(GestureType.DoubleTap, position, position));
                _hasPreviousTap = false;
                return;
            }

            output.Add(new GestureEvent(GestureType.Tap, position, position));
            _hasPreviousTap = true;
            _previousTapTime = time;
            _previousTapPosition = position;
        }

        private void Cancel(List<GestureEvent> output)
        {
            if (_mode == Mode.Panning)
            {
                output.Add(new GestureEvent(GestureType.PanEnd, _last, _start));
            }
            else if (_mode == Mode.BoxSelecting)
            {
                output.Add(new GestureEvent(GestureType.BoxSelectCancel, _last, _start));
            }

            _mode = Mode.Idle;
        }

        private float Pixels(float points) => points * _pixelsPerPoint;

        private static void MeasurePair(Vector2 a, Vector2 b, out float distance, out float angleDegrees, out Vector2 centroid)
        {
            Vector2 offset = b - a;
            distance = offset.Length();
            angleDegrees = (float)(Math.Atan2(offset.Y, offset.X) * (180.0 / Math.PI));
            centroid = (a + b) * 0.5f;
        }

        private static float WrapDegrees(float degrees)
        {
            while (degrees > 180f)
            {
                degrees -= 360f;
            }

            while (degrees < -180f)
            {
                degrees += 360f;
            }

            return degrees;
        }

        private static float Clamp01(float value) => value < 0f ? 0f : value > 1f ? 1f : value;

        private static int CountActive(IReadOnlyList<TouchSample> touches)
        {
            int count = 0;
            for (int i = 0; i < touches.Count; i++)
            {
                if (touches[i].IsActive)
                {
                    count++;
                }
            }

            return count;
        }

        private static bool TryFind(IReadOnlyList<TouchSample> touches, int fingerId, out TouchSample sample)
        {
            for (int i = 0; i < touches.Count; i++)
            {
                if (touches[i].FingerId == fingerId)
                {
                    sample = touches[i];
                    return true;
                }
            }

            sample = default;
            return false;
        }
    }
}
