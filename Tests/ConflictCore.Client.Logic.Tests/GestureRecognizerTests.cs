using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using ConflictCore.Client.Logic.Gestures;

namespace ConflictCore.Client.Logic.Tests;

public class GestureRecognizerTests
{
    private const float Frame = 1f / 60f;

    private readonly GestureRecognizer _recognizer = new(new GestureSettings());
    private readonly List<GestureEvent> _events = new();
    private float _time;

    public GestureRecognizerTests()
    {
        _recognizer.SetScreenDpi(160f);
    }

    [Fact]
    public void QuickTouch_IsTap()
    {
        Step(Touch(0, 100, 100, TouchState.Began));
        Step(Touch(0, 102, 101, TouchState.Ended));

        GestureEvent tap = Assert.Single(_events);
        Assert.Equal(GestureType.Tap, tap.Type);
    }

    [Fact]
    public void TwoQuickTapsNearby_AreTapThenDoubleTap()
    {
        Tap(100, 100);
        Advance(0.1f);
        Tap(108, 104);

        Assert.Equal(new[] { GestureType.Tap, GestureType.DoubleTap }, Types());
    }

    [Fact]
    public void TapsFarApart_AreTwoTaps()
    {
        Tap(100, 100);
        Advance(0.1f);
        Tap(400, 400);

        Assert.Equal(new[] { GestureType.Tap, GestureType.Tap }, Types());
    }

    [Fact]
    public void SlowTouch_IsNotTap()
    {
        Step(Touch(0, 100, 100, TouchState.Began));
        Advance(0.35f);
        Step(Touch(0, 100, 100, TouchState.Ended));

        Assert.DoesNotContain(GestureType.Tap, Types());
    }

    [Fact]
    public void Drag_PansWithDeltasAndReleaseVelocity()
    {
        Step(Touch(0, 100, 100, TouchState.Began));
        for (int i = 1; i <= 10; i++)
        {
            Step(Touch(0, 100 + (i * 10), 100, TouchState.Moved));
        }

        Step(Touch(0, 210, 100, TouchState.Ended));

        Assert.Equal(GestureType.PanStart, _events[0].Type);
        float totalDelta = _events.Where(e => e.Type == GestureType.Pan).Sum(e => e.Delta.X);
        Assert.Equal(110f, totalDelta, 3);
        GestureEvent end = _events.Last();
        Assert.Equal(GestureType.PanEnd, end.Type);
        Assert.True(end.Velocity.X > 100f, $"Release velocity {end.Velocity.X} too low.");
    }

    [Fact]
    public void HoldStill_IsLongPress_ThenDragIsBoxSelect()
    {
        Step(Touch(0, 100, 100, TouchState.Began));
        for (int i = 0; i < 30; i++)
        {
            Step(Touch(0, 100, 100, TouchState.Stationary));
        }

        Assert.Contains(GestureType.LongPress, Types());

        Step(Touch(0, 160, 140, TouchState.Moved));
        Step(Touch(0, 200, 180, TouchState.Moved));
        Step(Touch(0, 200, 180, TouchState.Ended));

        GestureEvent end = _events.Last();
        Assert.Equal(GestureType.BoxSelectEnd, end.Type);
        Assert.Equal(new Vector2(100, 100), end.Start);
        Assert.Equal(new Vector2(200, 180), end.Position);
        Assert.DoesNotContain(GestureType.Pan, Types());
    }

    [Fact]
    public void Pinch_ReportsScaleAndEndsWithoutTap()
    {
        Step(Touch(0, 100, 100, TouchState.Began));
        Step(Touch(0, 100, 100, TouchState.Stationary), Touch(1, 200, 100, TouchState.Began));
        Step(Touch(0, 90, 100, TouchState.Moved), Touch(1, 210, 100, TouchState.Moved));
        Step(Touch(0, 90, 100, TouchState.Stationary), Touch(1, 210, 100, TouchState.Ended));
        Step(Touch(0, 90, 100, TouchState.Ended));

        GestureEvent pinch = _events.Single(e => e.Type == GestureType.TwoFinger);
        Assert.Equal(1.2f, pinch.Scale, 3);
        Assert.Contains(GestureType.TwoFingerEnd, Types());
        Assert.DoesNotContain(GestureType.Tap, Types());
    }

    [Fact]
    public void Twist_ReportsRotation()
    {
        Step(Touch(0, 100, 100, TouchState.Began), Touch(1, 200, 100, TouchState.Began));
        Step(Touch(0, 100, 100, TouchState.Stationary), Touch(1, 150 + 50 * 0.866f, 100 + 50 * 0.5f, TouchState.Moved));

        GestureEvent twist = _events.Single(e => e.Type == GestureType.TwoFinger);
        Assert.InRange(twist.RotationDegrees, 10f, 20f);
    }

    [Fact]
    public void SecondFingerDuringPan_EndsPanAndStartsTwoFinger()
    {
        Step(Touch(0, 100, 100, TouchState.Began));
        Step(Touch(0, 150, 100, TouchState.Moved));
        Step(Touch(0, 150, 100, TouchState.Stationary), Touch(1, 300, 100, TouchState.Began));
        Step(Touch(0, 140, 100, TouchState.Moved), Touch(1, 310, 100, TouchState.Moved));

        Assert.Equal(GestureType.PanEnd, _events.First(e => e.Type is GestureType.PanEnd or GestureType.TwoFinger).Type);
        Assert.Contains(GestureType.TwoFinger, Types());
    }

    [Fact]
    public void DisappearingFinger_CancelsBoxSelection()
    {
        Step(Touch(0, 100, 100, TouchState.Began));
        Advance(0.5f);
        Step(Touch(0, 100, 100, TouchState.Stationary));
        Step(Touch(0, 160, 160, TouchState.Moved));
        Step();

        Assert.Equal(GestureType.BoxSelectCancel, _events.Last().Type);
    }

    [Fact]
    public void HighDpiScreen_ScalesTapSlop()
    {
        _recognizer.SetScreenDpi(480f); // 3 px per point → 30 px slop
        Step(Touch(0, 100, 100, TouchState.Began));
        Step(Touch(0, 125, 100, TouchState.Ended));

        Assert.Equal(GestureType.Tap, Assert.Single(_events).Type);
    }

    private void Tap(float x, float y)
    {
        Step(Touch(0, x, y, TouchState.Began));
        Step(Touch(0, x, y, TouchState.Ended));
    }

    private void Advance(float seconds) => _time += seconds;

    private void Step(params TouchSample[] touches)
    {
        _time += Frame;
        _recognizer.Process(touches, _time, _events);
    }

    private GestureType[] Types() => _events.Select(e => e.Type).ToArray();

    private static TouchSample Touch(int id, float x, float y, TouchState state) => new(id, new Vector2(x, y), state);
}
