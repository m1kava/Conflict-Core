using ConflictCore.Core.Numerics;

namespace ConflictCore.Core.Tests;

public class FixedVector2Tests
{
    [Fact]
    public void Length_OfThreeFourVector_IsFive()
    {
        var vector = new FixedVector2(Fixed.FromInt(3), Fixed.FromInt(4));

        Assert.Equal(Fixed.FromInt(25), vector.LengthSquared);
        Assert.Equal(Fixed.FromInt(5), vector.Length);
    }

    [Fact]
    public void Normalized_ZeroVector_IsZero()
    {
        Assert.Equal(FixedVector2.Zero, FixedVector2.Zero.Normalized());
    }

    [Fact]
    public void Normalized_HasUnitLength()
    {
        var vector = new FixedVector2(Fixed.FromInt(-30), Fixed.FromInt(17)).Normalized();

        Assert.InRange(vector.Length.ToDouble(), 0.999, 1.001);
    }

    [Fact]
    public void MoveTowards_DoesNotOvershoot()
    {
        var start = FixedVector2.Zero;
        var target = new FixedVector2(Fixed.FromInt(10), Fixed.Zero);

        Assert.Equal(new FixedVector2(Fixed.FromInt(4), Fixed.Zero), FixedVector2.MoveTowards(start, target, Fixed.FromInt(4)));
        Assert.Equal(target, FixedVector2.MoveTowards(start, target, Fixed.FromInt(40)));
    }

    [Fact]
    public void FromAngle_RoundTripsThroughAngle()
    {
        Fixed angle = Fixed.Parse("1.2");

        Assert.InRange((FixedVector2.FromAngle(angle).Angle - angle).ToDouble(), -0.001, 0.001);
    }

    [Fact]
    public void Cross_SignIndicatesTurnDirection()
    {
        Assert.True(FixedVector2.Cross(FixedVector2.UnitX, FixedVector2.UnitY) > Fixed.Zero);
        Assert.True(FixedVector2.Cross(FixedVector2.UnitY, FixedVector2.UnitX) < Fixed.Zero);
    }
}
