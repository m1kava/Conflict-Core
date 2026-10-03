using System;

namespace ConflictCore.Core.Identifiers
{
    /// <summary>
    /// Index of a player inside one match (0..<see cref="MaxPlayers"/>-1). This is a match-local slot, not an
    /// account id: the backend maps accounts to slots when the match is created. Nothing in the simulation
    /// assumes exactly two players.
    /// </summary>
    public readonly struct PlayerSlot : IEquatable<PlayerSlot>
    {
        /// <summary>Upper bound sized for 4v4 / 8-player free-for-all.</summary>
        public const int MaxPlayers = 8;

        /// <summary>Owner of neutral entities (resource fields, capturable structures).</summary>
        public static readonly PlayerSlot Neutral = new PlayerSlot(byte.MaxValue);

        public readonly byte Index;

        public PlayerSlot(byte index)
        {
            if (index >= MaxPlayers && index != byte.MaxValue)
            {
                throw new ArgumentOutOfRangeException(nameof(index), index, $"Player slot must be below {MaxPlayers}.");
            }

            Index = index;
        }

        public bool IsNeutral => Index == byte.MaxValue;

        public static bool operator ==(PlayerSlot a, PlayerSlot b) => a.Index == b.Index;

        public static bool operator !=(PlayerSlot a, PlayerSlot b) => a.Index != b.Index;

        public bool Equals(PlayerSlot other) => Index == other.Index;

        public override bool Equals(object? obj) => obj is PlayerSlot other && Equals(other);

        public override int GetHashCode() => Index;

        public override string ToString() => IsNeutral ? "P-neutral" : $"P{Index}";
    }
}
