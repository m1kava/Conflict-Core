using System;

namespace ConflictCore.Core.Numerics
{
    /// <summary>
    /// Deterministic 2D vector on the ground plane (X = east, Y = north). Height is derived from terrain data
    /// and altitude layers, never simulated as a free third axis, which keeps ground simulation cheap.
    /// </summary>
    public readonly struct FixedVector2 : IEquatable<FixedVector2>
    {
        public static readonly FixedVector2 Zero = new FixedVector2(Fixed.Zero, Fixed.Zero);
        public static readonly FixedVector2 UnitX = new FixedVector2(Fixed.One, Fixed.Zero);
        public static readonly FixedVector2 UnitY = new FixedVector2(Fixed.Zero, Fixed.One);

        public readonly Fixed X;
        public readonly Fixed Y;

        public FixedVector2(Fixed x, Fixed y)
        {
            X = x;
            Y = y;
        }

        public Fixed LengthSquared => (X * X) + (Y * Y);

        public Fixed Length => FixedMath.Sqrt(LengthSquared);

        /// <summary>Unit-length copy, or <see cref="Zero"/> for the zero vector.</summary>
        public FixedVector2 Normalized()
        {
            Fixed length = Length;
            return length.Raw == 0 ? Zero : new FixedVector2(X / length, Y / length);
        }

        /// <summary>Heading angle in radians (0 = +X, counter-clockwise positive).</summary>
        public Fixed Angle => FixedMath.Atan2(Y, X);

        public static FixedVector2 FromAngle(Fixed radians) =>
            new FixedVector2(FixedMath.Cos(radians), FixedMath.Sin(radians));

        public static Fixed Dot(FixedVector2 a, FixedVector2 b) => (a.X * b.X) + (a.Y * b.Y);

        /// <summary>Z component of the 3D cross product; positive when <paramref name="b"/> is counter-clockwise of <paramref name="a"/>.</summary>
        public static Fixed Cross(FixedVector2 a, FixedVector2 b) => (a.X * b.Y) - (a.Y * b.X);

        public static Fixed DistanceSquared(FixedVector2 a, FixedVector2 b) => (a - b).LengthSquared;

        public static Fixed Distance(FixedVector2 a, FixedVector2 b) => (a - b).Length;

        /// <summary>Moves <paramref name="current"/> toward <paramref name="target"/> by at most <paramref name="maxDistance"/>.</summary>
        public static FixedVector2 MoveTowards(FixedVector2 current, FixedVector2 target, Fixed maxDistance)
        {
            FixedVector2 delta = target - current;
            Fixed distance = delta.Length;
            if (distance <= maxDistance || distance.Raw == 0)
            {
                return target;
            }

            // Multiply before dividing to keep full precision (4/10 * 10 would truncate to 3.99994).
            return current + ((delta * maxDistance) / distance);
        }

        public static FixedVector2 operator +(FixedVector2 a, FixedVector2 b) => new FixedVector2(a.X + b.X, a.Y + b.Y);

        public static FixedVector2 operator -(FixedVector2 a, FixedVector2 b) => new FixedVector2(a.X - b.X, a.Y - b.Y);

        public static FixedVector2 operator -(FixedVector2 a) => new FixedVector2(-a.X, -a.Y);

        public static FixedVector2 operator *(FixedVector2 a, Fixed scalar) => new FixedVector2(a.X * scalar, a.Y * scalar);

        public static FixedVector2 operator /(FixedVector2 a, Fixed scalar) => new FixedVector2(a.X / scalar, a.Y / scalar);

        public static bool operator ==(FixedVector2 a, FixedVector2 b) => a.Equals(b);

        public static bool operator !=(FixedVector2 a, FixedVector2 b) => !a.Equals(b);

        public bool Equals(FixedVector2 other) => X == other.X && Y == other.Y;

        public override bool Equals(object? obj) => obj is FixedVector2 other && Equals(other);

        public override int GetHashCode() => HashCode.Combine(X.Raw, Y.Raw);

        public override string ToString() => $"({X}, {Y})";
    }
}
