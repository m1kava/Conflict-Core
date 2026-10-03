using System.Collections.Generic;
using ConflictCore.Client.Logic.Gestures;
using UnityEngine.InputSystem.EnhancedTouch;
using InputTouchPhase = UnityEngine.InputSystem.TouchPhase;
using NumericsVector2 = System.Numerics.Vector2;
using Touch = UnityEngine.InputSystem.EnhancedTouch.Touch;

namespace ConflictCore.Client.Gestures
{
    /// <summary>
    /// Adapter from the Unity Input System (EnhancedTouch) to engine-neutral <see cref="TouchSample"/>s.
    /// In the editor, mouse input is converted to a simulated touch so the same code path is exercised.
    /// </summary>
    public sealed class UnityTouchReader
    {
        private readonly List<TouchSample> _samples = new List<TouchSample>(10);

        public UnityTouchReader()
        {
            EnhancedTouchSupport.Enable();
#if UNITY_EDITOR || UNITY_STANDALONE
            TouchSimulation.Enable();
#endif
        }

        /// <summary>Touches for the current frame, including those that ended this frame. Reused; do not cache.</summary>
        public IReadOnlyList<TouchSample> Read()
        {
            _samples.Clear();
            foreach (Touch touch in Touch.activeTouches)
            {
                _samples.Add(new TouchSample(
                    touch.touchId,
                    new NumericsVector2(touch.screenPosition.x, touch.screenPosition.y),
                    Convert(touch.phase)));
            }

            return _samples;
        }

        private static TouchState Convert(InputTouchPhase phase)
        {
            switch (phase)
            {
                case InputTouchPhase.Began:
                    return TouchState.Began;
                case InputTouchPhase.Moved:
                    return TouchState.Moved;
                case InputTouchPhase.Ended:
                    return TouchState.Ended;
                case InputTouchPhase.Canceled:
                    return TouchState.Canceled;
                default:
                    return TouchState.Stationary;
            }
        }
    }
}
