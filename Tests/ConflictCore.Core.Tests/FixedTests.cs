using System;
using ConflictCore.Core.Numerics;

namespace ConflictCore.Core.Tests;

public class FixedTests
{
    [Fact]
    public void Arithmetic_MatchesExpectedValues()
    {
        Fixed a = Fixed.Parse("2.5");
        Fixed b = Fixed.FromInt(4);

        Assert.Equal(Fixed.Parse("6.5"), a + b);
        Assert.Equal(Fixed.Parse("-1.5"), a - b);
        Assert.Equal(Fixed.FromInt(10), a * b);
        Assert.Equal(Fixed.Parse("0.625"), a / b);
        Assert.Equal(Fixed.Parse("-2.5"), -a);
    }

    [Theory]
    [InlineData("1.5", 1, 2, 2)]
    [InlineData("-1.5", -2, -1, -1)]
    [InlineData("3", 3, 3, 3)]
    [InlineData("2.49", 2, 3, 2)]
    public void Rounding_FollowsDocumentedRules(string text, int floor, int ceil, int round)
    {
        Fixed value = Fixed.Parse(text);

        Assert.Equal(floor, value.FloorToInt());
        Assert.Equal(ceil, value.CeilToInt());
        Assert.Equal(round, value.RoundToInt());
    }

    [Fact]
    public void Parse_IsCultureInvariantAndExact()
    {
        Assert.Equal(Fixed.OneRaw / 4, Fixed.Parse("0.25").Raw);
        Assert.Equal(Fixed.FromDecimal(12.75m), Fixed.Parse("12.75"));
        Assert.Equal("12.75", Fixed.Parse("12.75").ToString());
    }

    [Fact]
    public void Division_ByZero_Throws()
    {
        Assert.Throws<DivideByZeroException>(() => Fixed.One / Fixed.Zero);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(0.0001)]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(144)]
    [InlineData(12345.678)]
    [InlineData(4_000_000)]
    public void Sqrt_IsAccurate(double input)
    {
        Fixed value = Fixed.FromDecimal((decimal)input);
        double expected = Math.Sqrt(value.ToDouble());

        Assert.InRange(FixedMath.Sqrt(value).ToDouble(), expected - 0.0001, expected + 0.0001);
    }

    [Fact]
    public void SinCos_AreAccurateAcrossFullCircle()
    {
        for (int degrees = -720; degrees <= 720; degrees += 3)
        {
            Fixed radians = Fixed.FromRatio(degrees, 180) * Fixed.Pi;
            double reference = radians.ToDouble();

            Assert.InRange(FixedMath.Sin(radians).ToDouble() - Math.Sin(reference), -0.0003, 0.0003);
            Assert.InRange(FixedMath.Cos(radians).ToDouble() - Math.Cos(reference), -0.0003, 0.0003);
        }
    }

    [Fact]
    public void Atan2_IsAccurateInAllQuadrants()
    {
        for (int degrees = -179; degrees <= 180; degrees += 7)
        {
            double angle = degrees * Math.PI / 180.0;
            Fixed x = Fixed.FromDecimal((decimal)(Math.Cos(angle) * 50));
            Fixed y = Fixed.FromDecimal((decimal)(Math.Sin(angle) * 50));
            double expected = Math.Atan2(y.ToDouble(), x.ToDouble());

            Assert.InRange(FixedMath.Atan2(y, x).ToDouble() - expected, -0.0005, 0.0005);
        }
    }

    [Fact]
    public void WrapAngle_StaysInHalfOpenRange()
    {
        for (int i = -50; i <= 50; i++)
        {
            Fixed wrapped = FixedMath.WrapAngle(Fixed.FromRatio(i, 3));
            Assert.True(wrapped >= -Fixed.Pi && wrapped < Fixed.Pi, $"{wrapped} out of range");
        }
    }

    /// <summary>
    /// Golden-value guard: if this hash changes, deterministic math changed and recorded replays from older
    /// builds can no longer be re-simulated. Update the constant only together with a protocol/version bump.
    /// </summary>
    [Fact]
    public void MathFunctions_ProduceGoldenChecksum()
    {
        var hasher = new Hashing.StateHasher();
        for (int i = -200; i <= 200; i++)
        {
            Fixed x = Fixed.FromRatio(i * 37, 41);
            hasher.Add(FixedMath.Sin(x).Raw);
            hasher.Add(FixedMath.Cos(x).Raw);
            hasher.Add(FixedMath.Atan2(x, Fixed.FromInt(7)).Raw);
            hasher.Add(FixedMath.Sqrt(FixedMath.Abs(x)).Raw);
            hasher.Add((x * x / Fixed.FromInt(3)).Raw);
        }

        Assert.Equal(GoldenChecksums.MathFunctions, hasher.Value);
    }
}
