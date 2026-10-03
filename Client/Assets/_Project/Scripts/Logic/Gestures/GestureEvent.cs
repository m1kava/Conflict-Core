using System.Numerics;

namespace ConflictCore.Client.Logic.Gestures
{
    public enum GestureType : byte
    {
        /// <summary>Quick touch and release: select / issue context command.</summary>
        Tap,

        /// <summary>Second tap close in time and space: select all visible units of the same type.</summary>
        DoubleTap,

        /// <summary>Finger held still: open context menu; continuing to drag turns into a box selection.</summary>
        LongPress,

        PanStart,
        Pan,

        /// <summary>One-finger drag released; <see cref="GestureEvent.Velocity"/> seeds camera inertia.</summary>
        PanEnd,

        BoxSelectUpdate,
        BoxSelectEnd,
        BoxSelectCancel,

        /// <summary>Two-finger gesture frame: pinch <see cref="GestureEvent.Scale"/>, twist <see cref="GestureEvent.RotationDegrees"/>, centroid <see cref="GestureEvent.Delta"/>.</summary>
        TwoFinger,
        TwoFingerEnd,
    }

    /// <summary>One recognised gesture. A struct written into a reusable list, so recognition never allocates.</summary>
    public readonly struct GestureEvent
    {
        public GestureEvent(
            GestureType type,
            Vector2 position,
            Vector2 start = default,
            Vector2 delta = default,
            Vector2 velocity = default,
            float scale = 1f,
            float rotationDegrees = 0f)
        {
            Type = type;
            Position = position;
            Start = start;
            Delta = delta;
            Velocity = velocity;
            Scale = scale;
            RotationDegrees = rotationDegrees;
        }

        public GestureType Type { get; }

        /// <summary>Current finger position, or two-finger centroid.</summary>
        public Vector2 Position { get; }

        /// <summary>Where the gesture began (box selection corner).</summary>
        public Vector2 Start { get; }

        /// <summary>Screen-space movement since the previous event of this gesture.</summary>
        public Vector2 Delta { get; }

        /// <summary>Pixels per second at release (pan end).</summary>
        public Vector2 Velocity { get; }

        /// <summary>Pinch scale factor since the previous frame (&gt;1 = fingers spreading).</summary>
        public float Scale { get; }

        /// <summary>Twist since the previous frame, counter-clockwise positive.</summary>
        public float RotationDegrees { get; }
    }
}
