using System;

namespace ConflictCore.Core.Numerics
{
    /// <summary>
    /// PCG32 (XSH-RR) pseudo-random generator. Integer-only and fully determined by its state, so the server,
    /// replays and tests reproduce identical sequences. The whole state is two <see cref="ulong"/> values,
    /// which keeps it cheap to include in snapshots.
    /// </summary>
    /// <remarks>Never use <see cref="System.Random"/> in simulation code: its algorithm differs between runtimes.</remarks>
    public sealed class DeterministicRandom
    {
        private const ulong Multiplier = 6364136223846793005UL;

        private const ulong DefaultStream = 0xDA3E39CB94B95BDBUL;

        private ulong _state;
        private ulong _increment;

        public DeterministicRandom(ulong seed, ulong stream = DefaultStream)
        {
            _increment = (stream << 1) | 1UL;
            _state = 0;
            NextUInt();
            _state += seed;
            NextUInt();
        }

        public ulong State => _state;

        public ulong Increment => _increment;

        /// <summary>Recreates a generator from a previously captured <see cref="State"/>/<see cref="Increment"/> pair.</summary>
        public static DeterministicRandom Restore(ulong state, ulong increment)
        {
            if ((increment & 1UL) == 0)
            {
                throw new ArgumentException("PCG increment must be odd.", nameof(increment));
            }

            var random = new DeterministicRandom(0);
            random._state = state;
            random._increment = increment;
            return random;
        }

        public uint NextUInt()
        {
            ulong oldState = _state;
            _state = unchecked((oldState * Multiplier) + _increment);
            uint xorShifted = (uint)(((oldState >> 18) ^ oldState) >> 27);
            int rotation = (int)(oldState >> 59);
            return (xorShifted >> rotation) | (xorShifted << ((-rotation) & 31));
        }

        /// <summary>Uniform integer in [0, <paramref name="maxExclusive"/>) without modulo bias.</summary>
        public int NextInt(int maxExclusive)
        {
            if (maxExclusive <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(maxExclusive), "Upper bound must be positive.");
            }

            uint bound = (uint)maxExclusive;
            uint threshold = unchecked((uint)-bound) % bound;
            while (true)
            {
                uint value = NextUInt();
                if (value >= threshold)
                {
                    return (int)(value % bound);
                }
            }
        }

        /// <summary>Uniform integer in [<paramref name="minInclusive"/>, <paramref name="maxExclusive"/>).</summary>
        public int NextInt(int minInclusive, int maxExclusive)
        {
            if (maxExclusive <= minInclusive)
            {
                throw new ArgumentOutOfRangeException(nameof(maxExclusive), "Upper bound must exceed lower bound.");
            }

            return minInclusive + NextInt(maxExclusive - minInclusive);
        }

        /// <summary>Uniform value in [0, 1).</summary>
        public Fixed NextFixed01() => Fixed.FromRaw(NextUInt() >> (32 - Fixed.FractionalBits));

        /// <summary>Uniform value in [<paramref name="min"/>, <paramref name="max"/>).</summary>
        public Fixed NextFixed(Fixed min, Fixed max) => min + ((max - min) * NextFixed01());

        /// <summary>Returns true with probability <paramref name="chance"/> (0..1).</summary>
        public bool Chance(Fixed chance) => NextFixed01() < chance;
    }
}
