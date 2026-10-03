using System;
using System.Globalization;

namespace ConflictCore.Core.Numerics
{
    /// <summary>
    /// Deterministic signed fixed-point number in Q47.16 format (64-bit raw value, 16 fractional bits).
    /// </summary>
    /// <remarks>
    /// <para>
    /// All gameplay simulation (positions, health, damage, economy, timers) uses <see cref="Fixed"/> instead of
    /// <c>float</c>/<c>double</c>. Integer arithmetic produces bit-identical results on every CPU, compiler and
    /// runtime (x64 server, ARM64 phones, Mono/IL2CPP), which is what makes replays, server re-simulation and
    /// desync detection possible. See docs/adr/0003-fixed-point-simulation.md.
    /// </para>
    /// <para>
    /// Resolution is 1/65536 (~0.000015). Safe magnitude for products and quotients is about ±2^31 (2.1 billion),
    /// far beyond any map coordinate, health or credit value. Operations are unchecked for speed; the game-data
    /// validator keeps authored values inside safe bounds.
    /// </para>
    /// </remarks>
    public readonly struct Fixed : IEquatable<Fixed>, IComparable<Fixed>
    {
        public const int FractionalBits = 16;
        public const long OneRaw = 1L << FractionalBits;
        private const long FractionMask = OneRaw - 1;

        public static readonly Fixed Zero = new Fixed(0);
        public static readonly Fixed One = new Fixed(OneRaw);
        public static readonly Fixed Half = new Fixed(OneRaw / 2);
        public static readonly Fixed Epsilon = new Fixed(1);
        public static readonly Fixed MaxValue = new Fixed(long.MaxValue);
        public static readonly Fixed MinValue = new Fixed(long.MinValue);

        /// <summary>π rounded to the nearest representable value (205887 / 65536).</summary>
        public static readonly Fixed Pi = new Fixed(205887);
        public static readonly Fixed HalfPi = new Fixed(102944);
        public static readonly Fixed TwoPi = new Fixed(411775);

        public readonly long Raw;

        private Fixed(long raw)
        {
            Raw = raw;
        }

        public static Fixed FromRaw(long raw) => new Fixed(raw);

        public static Fixed FromInt(int value) => new Fixed((long)value << FractionalBits);

        /// <summary>Exact-as-possible <paramref name="numerator"/>/<paramref name="denominator"/>, rounded toward zero.</summary>
        public static Fixed FromRatio(long numerator, long denominator)
        {
            if (denominator == 0)
            {
                throw new DivideByZeroException("Fixed.FromRatio denominator is zero.");
            }

            return new Fixed((numerator << FractionalBits) / denominator);
        }

        /// <summary>
        /// Converts a <see cref="decimal"/> deterministically. <see cref="decimal"/> arithmetic is implemented in
        /// software, so authored data parsed as decimal maps to identical raw values on every platform.
        /// </summary>
        public static Fixed FromDecimal(decimal value)
        {
            decimal scaled = decimal.Round(value * OneRaw, 0, MidpointRounding.AwayFromZero);
            return new Fixed(decimal.ToInt64(scaled));
        }

        /// <summary>Parses an invariant-culture decimal literal such as "12.5" deterministically.</summary>
        public static Fixed Parse(string text)
        {
            if (text == null)
            {
                throw new ArgumentNullException(nameof(text));
            }

            decimal value = decimal.Parse(text, NumberStyles.Float, CultureInfo.InvariantCulture);
            return FromDecimal(value);
        }

        /// <summary>Lossy conversion for rendering, UI and logging only. Never feed the result back into simulation.</summary>
        public float ToFloat() => (float)Raw / OneRaw;

        /// <summary>Lossy conversion for rendering, UI and logging only. Never feed the result back into simulation.</summary>
        public double ToDouble() => (double)Raw / OneRaw;

        public decimal ToDecimal() => (decimal)Raw / OneRaw;

        /// <summary>Largest integer less than or equal to this value.</summary>
        public int FloorToInt() => (int)(Raw >> FractionalBits);

        /// <summary>Smallest integer greater than or equal to this value.</summary>
        public int CeilToInt() => (int)((Raw + FractionMask) >> FractionalBits);

        /// <summary>Nearest integer, halves rounded up (toward +∞).</summary>
        public int RoundToInt() => (int)((Raw + (OneRaw / 2)) >> FractionalBits);

        public Fixed Floor() => new Fixed(Raw & ~FractionMask);

        public static Fixed operator +(Fixed a, Fixed b) => new Fixed(a.Raw + b.Raw);

        public static Fixed operator -(Fixed a, Fixed b) => new Fixed(a.Raw - b.Raw);

        public static Fixed operator -(Fixed a) => new Fixed(-a.Raw);

        public static Fixed operator *(Fixed a, Fixed b) => new Fixed((a.Raw * b.Raw) >> FractionalBits);

        public static Fixed operator *(Fixed a, int b) => new Fixed(a.Raw * b);

        public static Fixed operator /(Fixed a, Fixed b)
        {
            if (b.Raw == 0)
            {
                throw new DivideByZeroException("Fixed division by zero.");
            }

            return new Fixed((a.Raw << FractionalBits) / b.Raw);
        }

        public static Fixed operator /(Fixed a, int b)
        {
            if (b == 0)
            {
                throw new DivideByZeroException("Fixed division by zero.");
            }

            return new Fixed(a.Raw / b);
        }

        public static Fixed operator %(Fixed a, Fixed b) => new Fixed(a.Raw % b.Raw);

        public static bool operator ==(Fixed a, Fixed b) => a.Raw == b.Raw;

        public static bool operator !=(Fixed a, Fixed b) => a.Raw != b.Raw;

        public static bool operator <(Fixed a, Fixed b) => a.Raw < b.Raw;

        public static bool operator >(Fixed a, Fixed b) => a.Raw > b.Raw;

        public static bool operator <=(Fixed a, Fixed b) => a.Raw <= b.Raw;

        public static bool operator >=(Fixed a, Fixed b) => a.Raw >= b.Raw;

        public static implicit operator Fixed(int value) => FromInt(value);

        public bool Equals(Fixed other) => Raw == other.Raw;

        public override bool Equals(object? obj) => obj is Fixed other && Equals(other);

        public override int GetHashCode() => Raw.GetHashCode();

        public int CompareTo(Fixed other) => Raw.CompareTo(other.Raw);

        public override string ToString() => ToDecimal().ToString("0.#####", CultureInfo.InvariantCulture);
    }
}
