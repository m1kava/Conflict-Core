using System;

namespace ConflictCore.Core.Numerics
{
    /// <summary>
    /// Deterministic math functions over <see cref="Fixed"/>. Everything is integer-only; there are no
    /// floating-point operations and no platform math library calls, so results are bit-identical everywhere.
    /// </summary>
    public static class FixedMath
    {
        // Taylor-series denominators for sin(x) on [0, π/2], evaluated in Horner form.
        // Max absolute error ≈ 1e-4 across the full circle, well below one heading quantisation step.
        private static readonly Fixed InvSix = Fixed.FromRatio(1, 6);
        private static readonly Fixed InvTwenty = Fixed.FromRatio(1, 20);
        private static readonly Fixed InvFortyTwo = Fixed.FromRatio(1, 42);
        private static readonly Fixed InvSeventyTwo = Fixed.FromRatio(1, 72);

        // Minimax polynomial for atan(z), z ∈ [0, 1] (Abramowitz & Stegun 4.4.49 family). Max error ≈ 1e-5 rad.
        private static readonly Fixed AtanC1 = Fixed.FromDecimal(0.9998660m);
        private static readonly Fixed AtanC3 = Fixed.FromDecimal(-0.3302995m);
        private static readonly Fixed AtanC5 = Fixed.FromDecimal(0.1801410m);
        private static readonly Fixed AtanC7 = Fixed.FromDecimal(-0.0851330m);
        private static readonly Fixed AtanC9 = Fixed.FromDecimal(0.0208351m);

        public static Fixed Abs(Fixed value) => value.Raw < 0 ? -value : value;

        public static Fixed Min(Fixed a, Fixed b) => a.Raw <= b.Raw ? a : b;

        public static Fixed Max(Fixed a, Fixed b) => a.Raw >= b.Raw ? a : b;

        public static Fixed Clamp(Fixed value, Fixed min, Fixed max)
        {
            if (value.Raw < min.Raw)
            {
                return min;
            }

            return value.Raw > max.Raw ? max : value;
        }

        public static Fixed Clamp01(Fixed value) => Clamp(value, Fixed.Zero, Fixed.One);

        public static int Sign(Fixed value) => value.Raw > 0 ? 1 : value.Raw < 0 ? -1 : 0;

        /// <summary>Linear interpolation; <paramref name="t"/> is not clamped.</summary>
        public static Fixed Lerp(Fixed a, Fixed b, Fixed t) => a + ((b - a) * t);

        /// <summary>Square root, rounded down. Negative input is a programming error.</summary>
        public static Fixed Sqrt(Fixed value)
        {
            if (value.Raw < 0)
            {
                throw new ArgumentOutOfRangeException(nameof(value), "Square root of a negative Fixed value.");
            }

            // sqrt(raw / 2^16) * 2^16 == sqrt(raw * 2^16)
            ulong shifted = (ulong)value.Raw << Fixed.FractionalBits;
            return Fixed.FromRaw((long)IntegerSqrt(shifted));
        }

        /// <summary>Wraps an angle in radians into [-π, π).</summary>
        public static Fixed WrapAngle(Fixed radians)
        {
            long twoPi = Fixed.TwoPi.Raw;
            long shifted = (radians.Raw + Fixed.Pi.Raw) % twoPi;
            if (shifted < 0)
            {
                shifted += twoPi;
            }

            return Fixed.FromRaw(shifted - Fixed.Pi.Raw);
        }

        public static Fixed Sin(Fixed radians)
        {
            Fixed x = WrapAngle(radians);
            bool negative = x.Raw < 0;
            if (negative)
            {
                x = -x;
            }

            // sin(π - x) == sin(x): fold (π/2, π] onto [0, π/2).
            if (x > Fixed.HalfPi)
            {
                x = Fixed.Pi - x;
            }

            Fixed x2 = x * x;
            Fixed series = Fixed.One - (x2 * InvSeventyTwo);
            series = Fixed.One - (x2 * InvFortyTwo * series);
            series = Fixed.One - (x2 * InvTwenty * series);
            series = Fixed.One - (x2 * InvSix * series);
            Fixed result = x * series;

            return negative ? -result : result;
        }

        public static Fixed Cos(Fixed radians) => Sin(radians + Fixed.HalfPi);

        /// <summary>Angle in radians, in (-π, π], of the vector (<paramref name="x"/>, <paramref name="y"/>).</summary>
        public static Fixed Atan2(Fixed y, Fixed x)
        {
            if (x.Raw == 0 && y.Raw == 0)
            {
                return Fixed.Zero;
            }

            Fixed absX = Abs(x);
            Fixed absY = Abs(y);
            bool steep = absY > absX;
            Fixed ratio = steep ? absX / absY : absY / absX;
            Fixed angle = AtanUnit(ratio);

            if (steep)
            {
                angle = Fixed.HalfPi - angle;
            }

            if (x.Raw < 0)
            {
                angle = Fixed.Pi - angle;
            }

            return y.Raw < 0 ? -angle : angle;
        }

        /// <summary>atan(z) for z in [0, 1].</summary>
        private static Fixed AtanUnit(Fixed z)
        {
            Fixed z2 = z * z;
            Fixed poly = AtanC9;
            poly = AtanC7 + (z2 * poly);
            poly = AtanC5 + (z2 * poly);
            poly = AtanC3 + (z2 * poly);
            poly = AtanC1 + (z2 * poly);
            return z * poly;
        }

        private static ulong IntegerSqrt(ulong value)
        {
            ulong result = 0;
            ulong bit = 1UL << 62;

            while (bit > value)
            {
                bit >>= 2;
            }

            while (bit != 0)
            {
                if (value >= result + bit)
                {
                    value -= result + bit;
                    result = (result >> 1) + bit;
                }
                else
                {
                    result >>= 1;
                }

                bit >>= 2;
            }

            return result;
        }
    }
}
