using ConflictCore.Client.Gestures;
using ConflictCore.Client.Logic.CameraControl;
using ConflictCore.Client.Logic.Gestures;
using UnityEngine;
using NumericsVector2 = System.Numerics.Vector2;

namespace ConflictCore.Client.CameraControl
{
    /// <summary>
    /// Drives a Unity <see cref="Camera"/> from the engine-independent <see cref="RtsCameraModel"/>, fed by
    /// one-finger pan and two-finger pinch/twist gestures.
    /// </summary>
    [RequireComponent(typeof(Camera))]
    public sealed class RtsCameraRig : MonoBehaviour
    {
        private RtsCameraModel? _model;
        private GestureInputRouter? _input;
        private Camera? _camera;

        public RtsCameraSettings Settings { get; } = new RtsCameraSettings();

        public RtsCameraModel? Model => _model;

        /// <summary>Wires the rig to input and confines it to the map rectangle (metres, X/Z).</summary>
        public void Initialize(GestureInputRouter input, Vector2 boundsMin, Vector2 boundsMax, Vector2 startFocus)
        {
            _camera = GetComponent<Camera>();
            _camera.fieldOfView = Settings.VerticalFieldOfView;

            _model = new RtsCameraModel(Settings);
            _model.SetBounds(ToNumerics(boundsMin), ToNumerics(boundsMax));
            _model.JumpTo(ToNumerics(startFocus));

            if (_input != null)
            {
                _input.GestureRecognized -= OnGesture;
            }

            _input = input;
            _input.GestureRecognized += OnGesture;
            ApplyPose();
        }

        private void OnDestroy()
        {
            if (_input != null)
            {
                _input.GestureRecognized -= OnGesture;
            }
        }

        private void OnGesture(GestureEvent gesture)
        {
            if (_model == null)
            {
                return;
            }

            float viewportHeight = Screen.height;
            switch (gesture.Type)
            {
                case GestureType.PanStart:
                    _model.StopInertia();
                    break;
                case GestureType.Pan:
                    _model.Pan(gesture.Delta, viewportHeight);
                    break;
                case GestureType.PanEnd:
                    _model.ReleasePan(gesture.Velocity, viewportHeight);
                    break;
                case GestureType.TwoFinger:
                    _model.Pinch(gesture.Scale);
                    _model.Twist(gesture.RotationDegrees);
                    _model.Pan(gesture.Delta, viewportHeight);
                    break;
            }
        }

        private void LateUpdate()
        {
            if (_model == null)
            {
                return;
            }

            _model.Update(Time.unscaledDeltaTime);
            ApplyPose();
        }

        private void ApplyPose()
        {
            if (_model == null)
            {
                return;
            }

            System.Numerics.Vector3 position = _model.Position;
            transform.SetPositionAndRotation(
                new Vector3(position.X, position.Y, position.Z),
                Quaternion.Euler(_model.Pitch, _model.Yaw, 0f));
        }

        private static NumericsVector2 ToNumerics(Vector2 value) => new NumericsVector2(value.x, value.y);
    }
}
