using System.Collections.Generic;
using ConflictCore.Core.Identifiers;
using ConflictCore.Core.Numerics;

namespace ConflictCore.Protocol.Commands
{
    /// <summary>
    /// One player intent as transmitted on the wire. Mutable and reusable so decoders can fill pooled instances
    /// without allocating per command.
    /// </summary>
    /// <remarks>
    /// Structural validity (field ranges, list sizes) is enforced by <see cref="CommandCodec"/>. Semantic
    /// validity (ownership, affordability, tech requirements, cooldowns, placement) is enforced by the server's
    /// command validator against authoritative state — never trusted from this object.
    /// </remarks>
    public sealed class PlayerCommand
    {
        /// <summary>Upper bound on units addressed by one command; larger selections are split by the client.</summary>
        public const int MaxSubjects = 128;

        public CommandType Type { get; set; }

        /// <summary>Waypoint/shift-queue: append to the unit's order queue instead of replacing it.</summary>
        public bool Queued { get; set; }

        public CommandTargetKind TargetKind { get; set; }

        public FixedVector2 TargetPosition { get; set; }

        public EntityId TargetEntity { get; set; }

        /// <summary>Content index for build/produce/research/ability commands (see GameData definition registry).</summary>
        public uint Argument { get; set; }

        /// <summary>Building rotation in 90° steps (0..3) for <see cref="CommandType.PlaceBuilding"/>.</summary>
        public byte Rotation { get; set; }

        public FormationKind Formation { get; set; }

        /// <summary>Units or buildings the command is issued to, sorted ascending by the encoder.</summary>
        public List<EntityId> Subjects { get; } = new List<EntityId>();

        public void Clear()
        {
            Type = CommandType.Stop;
            Queued = false;
            TargetKind = CommandTargetKind.None;
            TargetPosition = FixedVector2.Zero;
            TargetEntity = EntityId.None;
            Argument = 0;
            Rotation = 0;
            Formation = FormationKind.Auto;
            Subjects.Clear();
        }

        public void CopyFrom(PlayerCommand other)
        {
            Type = other.Type;
            Queued = other.Queued;
            TargetKind = other.TargetKind;
            TargetPosition = other.TargetPosition;
            TargetEntity = other.TargetEntity;
            Argument = other.Argument;
            Rotation = other.Rotation;
            Formation = other.Formation;
            Subjects.Clear();
            Subjects.AddRange(other.Subjects);
        }
    }
}
