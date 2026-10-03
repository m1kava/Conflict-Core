using System;

namespace ConflictCore.Core.Identifiers
{
    /// <summary>Index of a fixed simulation step since match start.</summary>
    public readonly struct SimTick : IEquatable<SimTick>, IComparable<SimTick>
    {
        public static readonly SimTick Zero = new SimTick(0);

        public readonly uint Value;

        public SimTick(uint value)
        {
            Value = value;
        }

        public SimTick Next => new SimTick(Value + 1);

        public static bool operator ==(SimTick a, SimTick b) => a.Value == b.Value;

        public static bool operator !=(SimTick a, SimTick b) => a.Value != b.Value;

        public static bool operator <(SimTick a, SimTick b) => a.Value < b.Value;

        public static bool operator >(SimTick a, SimTick b) => a.Value > b.Value;

        public static bool operator <=(SimTick a, SimTick b) => a.Value <= b.Value;

        public static bool operator >=(SimTick a, SimTick b) => a.Value >= b.Value;

        public bool Equals(SimTick other) => Value == other.Value;

        public override bool Equals(object? obj) => obj is SimTick other && Equals(other);

        public override int GetHashCode() => (int)Value;

        public int CompareTo(SimTick other) => Value.CompareTo(other.Value);

        public override string ToString() => $"T{Value}";
    }
}
