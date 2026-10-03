using System.Numerics;

namespace ConflictCore.Client.Logic.Gestures
{
    public enum TouchState : byte
    {
        Began,
        Moved,
        Stationary,
        Ended,
        Canceled,
    }

    /// <summary>
    /// Engine-neutral snapshot of one finger for one frame. The Unity adapter converts Input System touches
    /// into these, which keeps gesture logic unit-testable without a device or the Unity editor.
    /// </summary>
    public readonly struct TouchSample
    {
        public TouchSample(int fingerId, Vector2 screenPosition, TouchState state)
        {
            FingerId = fingerId;
            ScreenPosition = screenPosition;
            State = state;
        }

        public int FingerId { get; }

        /// <summary>Pixels, origin bottom-left.</summary>
        public Vector2 ScreenPosition { get; }

        public TouchState State { get; }

        public bool IsActive => State != TouchState.Ended && State != TouchState.Canceled;
    }
}
