using System;
using System.Numerics;
using ConflictCore.Client.Logic.Layout;
using ConflictCore.Client.Logic.Quality;

namespace ConflictCore.Client.Logic.Tests;

public class LayoutAndQualityTests
{
    [Fact]
    public void SafeArea_WithNotch_InsetsAnchors()
    {
        // Landscape phone: 2532x1170 with a 132 px notch inset on the left and a 63 px home indicator.
        SafeAreaAnchors anchors = SafeAreaCalculator.Compute(
            new Vector2(2532, 1170), new Vector2(132, 63), new Vector2(2268, 1107), minimumMarginPixels: 0);

        Assert.Equal(132f / 2532f, anchors.Min.X, 5);
        Assert.Equal(63f / 1170f, anchors.Min.Y, 5);
        Assert.Equal(2400f / 2532f, anchors.Max.X, 5);
        Assert.Equal(1f, anchors.Max.Y, 5);
    }

    [Fact]
    public void SafeArea_AppliesMinimumMargin()
    {
        SafeAreaAnchors anchors = SafeAreaCalculator.Compute(new Vector2(1000, 500), Vector2.Zero, new Vector2(1000, 500), 10);

        Assert.Equal(0.01f, anchors.Min.X, 5);
        Assert.Equal(0.98f, anchors.Max.Y, 5);
    }

    [Fact]
    public void SafeArea_InvalidInput_FallsBackToFullScreen()
    {
        SafeAreaAnchors anchors = SafeAreaCalculator.Compute(Vector2.Zero, Vector2.Zero, Vector2.Zero, 0);

        Assert.Equal(Vector2.Zero, anchors.Min);
        Assert.Equal(Vector2.One, anchors.Max);
    }

    [Theory]
    [InlineData(2_000, 4, true, QualityTier.Low)]
    [InlineData(8_000, 8, false, QualityTier.Low)]
    [InlineData(4_000, 8, true, QualityTier.Medium)]
    [InlineData(8_000, 6, true, QualityTier.Medium)]
    [InlineData(8_000, 8, true, QualityTier.High)]
    [InlineData(12_000, 8, true, QualityTier.Ultra)]
    public void DeviceClassifier_PicksConservativeTier(int memoryMb, int cores, bool compute, QualityTier expected)
    {
        var device = new DeviceCapabilities(memoryMb, 2_000, cores, compute, isTablet: false);

        Assert.Equal(expected, DeviceTierClassifier.Classify(device));
    }

    [Fact]
    public void Profiles_ScaleMonotonically()
    {
        QualityProfile previous = QualityProfiles.Get(QualityTier.Low);
        foreach (QualityTier tier in new[] { QualityTier.Medium, QualityTier.High, QualityTier.Ultra })
        {
            QualityProfile current = QualityProfiles.Get(tier);
            Assert.True(current.RenderScale >= previous.RenderScale);
            Assert.True(current.ShadowDistance >= previous.ShadowDistance);
            Assert.True(current.MaxParticles >= previous.MaxParticles);
            Assert.True(current.LodBias >= previous.LodBias);
            Assert.InRange(current.RenderScale, 0.5f, 1f);
            previous = current;
        }
    }

    [Fact]
    public void Profiles_RejectUnknownTier()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => QualityProfiles.Get((QualityTier)99));
    }
}
