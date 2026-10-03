using System;

namespace ConflictCore.Core.Identifiers
{
    /// <summary>
    /// Server-assigned identifier of a simulated entity (unit, building, projectile owner...).
    /// Ids are allocated monotonically by the authoritative simulation and never reused within a match,
    /// so stale references held by clients or commands can never alias a newer entity.
    /// </summary>
    public readonly struct EntityId : IEquatable<EntityId>, IComparable<EntityId>
    {
        public static readonly EntityId None = new EntityId(0);

        public readonly uint Value;

        public EntityId(uint value)
        {
            Value = value;
        }

        public bool IsValid => Value != 0;

        public static bool operator ==(EntityId a, EntityId b) => a.Value == b.Value;

        public static bool operator !=(EntityId a, EntityId b) => a.Value != b.Value;

        public bool Equals(EntityId other) => Value == other.Value;

        public override bool Equals(object? obj) => obj is EntityId other && Equals(other);

        public override int GetHashCode() => (int)Value;

        public int CompareTo(EntityId other) => Value.CompareTo(other.Value);

        public override string ToString() => $"E{Value}";
    }
}
