using System;
using System.Numerics;
using ConflictCore.Client.Logic.CameraControl;

namespace ConflictCore.Client.Logic.Tests;

public class RtsCameraModelTests
{
    private const float ViewportHeight = 1080f;

    [Fact]
    public void Position_IsBehindAndAboveFocus()
    {
        var camera = new RtsCameraModel(new RtsCameraSettings());
        camera.JumpTo(new Vector2(100, 100));

        Vector3 position = camera.Position;

        Assert.True(position.Y > 0);
        Assert.True(position.Z < 100, "Yaw 0 looks north, so the camera sits south of the focus.");
        Assert.Equal(100f, position.X, 3);
        float distance = Vector3.Distance(position, new Vector3(100, 0, 100));
        Assert.Equal(camera.Distance, distance, 2);
    }

    [Fact]
    public void DraggingRight_MovesFocusWest()
    {
        var camera = new RtsCameraModel(new RtsCameraSettings());

        camera.Pan(new Vector2(100, 0), ViewportHeight);

        Assert.True(camera.Focus.X < 0);
        Assert.Equal(0f, camera.Focus.Y, 3);
    }

    [Fact]
    public void PanDistance_ScalesWithZoom()
    {
        var near = new RtsCameraModel(new RtsCameraSettings());
        near.SetZoomImmediate(0f);
        var far = new RtsCameraModel(new RtsCameraSettings());
        far.SetZoomImmediate(1f);

        near.Pan(new Vector2(100, 0), ViewportHeight);
        far.Pan(new Vector2(100, 0), ViewportHeight);

        Assert.True(Math.Abs(far.Focus.X) > Math.Abs(near.Focus.X) * 3);
    }

    [Fact]
    public void Inertia_GlidesThenStops()
    {
        var camera = new RtsCameraModel(new RtsCameraSettings());
        camera.ReleasePan(new Vector2(-800, 0), ViewportHeight);

        camera.Update(0.1f);
        float afterFirst = camera.Focus.X;
        for (int i = 0; i < 300; i++)
        {
            camera.Update(1f / 60f);
        }

        Assert.True(afterFirst > 0);
        Assert.True(camera.Focus.X > afterFirst);
        Assert.Equal(Vector2.Zero, camera.InertiaVelocity);
    }

    [Fact]
    public void Inertia_IsCapped()
    {
        var camera = new RtsCameraModel(new RtsCameraSettings());
        camera.ReleasePan(new Vector2(1_000_000, 0), ViewportHeight);

        float maxSpeed = camera.VisibleGroundHeight() * new RtsCameraSettings().MaxInertiaScreensPerSecond;
        Assert.True(camera.InertiaVelocity.Length() <= maxSpeed + 0.01f);
    }

    [Fact]
    public void Bounds_ClampFocusAndKillInertiaOnThatAxis()
    {
        var camera = new RtsCameraModel(new RtsCameraSettings());
        camera.SetBounds(new Vector2(-10, -10), new Vector2(10, 10));
        camera.ReleasePan(new Vector2(-2000, 0), ViewportHeight);

        for (int i = 0; i < 60; i++)
        {
            camera.Update(1f / 60f);
        }

        Assert.Equal(10f, camera.Focus.X);
        Assert.Equal(0f, camera.InertiaVelocity.X);
    }

    [Fact]
    public void Pinch_ZoomsInSmoothlyAndClamps()
    {
        var camera = new RtsCameraModel(new RtsCameraSettings());
        float before = camera.Distance;

        camera.Pinch(1.5f);
        camera.Update(1f / 60f);
        float afterOneFrame = camera.Distance;
        for (int i = 0; i < 120; i++)
        {
            camera.Update(1f / 60f);
        }

        Assert.True(afterOneFrame < before && afterOneFrame > camera.Distance);
        Assert.Equal(before / 1.5f, camera.Distance, 1);

        camera.Pinch(100f);
        for (int i = 0; i < 300; i++)
        {
            camera.Update(1f / 60f);
        }

        Assert.Equal(new RtsCameraSettings().MinDistance, camera.Distance, 1);
    }

    [Fact]
    public void Twist_IsIgnoredWhenRotationDisabled()
    {
        var camera = new RtsCameraModel(new RtsCameraSettings { RotationEnabled = false });

        camera.Twist(45f);
        camera.Update(1f);

        Assert.Equal(0f, camera.Yaw);
    }

    [Fact]
    public void InvalidPinchScale_IsIgnored()
    {
        var camera = new RtsCameraModel(new RtsCameraSettings());
        float before = camera.Distance;

        camera.Pinch(0f);
        camera.Pinch(float.NaN);
        camera.Update(1f);

        Assert.Equal(before, camera.Distance);
    }
}
