using ConflictCore.Core.Identifiers;
using ConflictCore.Core.Numerics;
using ConflictCore.Protocol.Serialization;

namespace ConflictCore.Protocol.Commands
{
    /// <summary>
    /// Compact binary encoding of <see cref="PlayerCommand"/>. A typical "move 12 tanks" command is ~20 bytes:
    /// subject ids are sorted and delta-encoded as varints, positions are quantised to 1/64 m.
    /// </summary>
    public static class CommandCodec
    {
        /// <summary>World positions in commands are quantised to 1/64 m — far below any visible or gameplay difference.</summary>
        public const int PositionPrecisionBits = 6;

        private const byte QueuedFlag = 1 << 0;
        private const int TargetKindShift = 1;
        private const byte TargetKindMask = 0b11 << TargetKindShift;
        private const int FormationShift = 3;
        private const byte FormationMask = 0b111 << FormationShift;
        private const byte KnownFlagsMask = QueuedFlag | TargetKindMask | FormationMask;

        private const byte MaxCommandType = (byte)CommandType.Surrender;
        private const byte MaxRotation = 3;

        public static void Write(PacketWriter writer, PlayerCommand command)
        {
            command.Subjects.Sort();

            byte flags = (byte)((command.Queued ? QueuedFlag : 0)
                | ((byte)command.TargetKind << TargetKindShift)
                | ((byte)command.Formation << FormationShift));

            writer.WriteByte((byte)command.Type);
            writer.WriteByte(flags);

            writer.WriteVarUInt((uint)command.Subjects.Count);
            uint previous = 0;
            foreach (EntityId subject in command.Subjects)
            {
                writer.WriteVarUInt(subject.Value - previous);
                previous = subject.Value;
            }

            switch (command.TargetKind)
            {
                case CommandTargetKind.Position:
                    writer.WriteQuantized(command.TargetPosition.X, PositionPrecisionBits);
                    writer.WriteQuantized(command.TargetPosition.Y, PositionPrecisionBits);
                    break;
                case CommandTargetKind.Entity:
                    writer.WriteVarUInt(command.TargetEntity.Value);
                    break;
            }

            writer.WriteVarUInt(command.Argument);
            writer.WriteByte(command.Rotation);
        }

        /// <summary>Decodes into <paramref name="into"/> (cleared first). Throws <see cref="ProtocolException"/> on malformed input.</summary>
        public static void Read(ref PacketReader reader, PlayerCommand into)
        {
            into.Clear();
            into.Type = (CommandType)reader.ReadEnumByte(MaxCommandType);

            byte flags = reader.ReadByte();
            if ((flags & ~KnownFlagsMask) != 0)
            {
                throw new ProtocolException($"Unknown command flags 0x{flags:X2}.");
            }

            into.Queued = (flags & QueuedFlag) != 0;
            byte targetKind = (byte)((flags & TargetKindMask) >> TargetKindShift);
            if (targetKind > (byte)CommandTargetKind.Entity)
            {
                throw new ProtocolException($"Invalid target kind {targetKind}.");
            }

            byte formation = (byte)((flags & FormationMask) >> FormationShift);
            if (formation > (byte)FormationKind.Spread)
            {
                throw new ProtocolException($"Invalid formation {formation}.");
            }

            into.TargetKind = (CommandTargetKind)targetKind;
            into.Formation = (FormationKind)formation;

            ReadSubjects(ref reader, into);

            switch (into.TargetKind)
            {
                case CommandTargetKind.Position:
                    Fixed x = reader.ReadQuantized(PositionPrecisionBits);
                    Fixed y = reader.ReadQuantized(PositionPrecisionBits);
                    into.TargetPosition = new FixedVector2(x, y);
                    break;
                case CommandTargetKind.Entity:
                    into.TargetEntity = new EntityId(reader.ReadVarUInt());
                    if (!into.TargetEntity.IsValid)
                    {
                        throw new ProtocolException("Entity target is the null entity.");
                    }

                    break;
            }

            into.Argument = reader.ReadVarUInt();
            into.Rotation = reader.ReadByte();
            if (into.Rotation > MaxRotation)
            {
                throw new ProtocolException($"Invalid rotation {into.Rotation}.");
            }
        }

        private static void ReadSubjects(ref PacketReader reader, PlayerCommand into)
        {
            int count = reader.ReadBoundedCount(PlayerCommand.MaxSubjects);
            uint previous = 0;
            for (int i = 0; i < count; i++)
            {
                uint delta = reader.ReadVarUInt();
                // Strictly increasing ids: rejects duplicates (which could double-apply an order) and id 0.
                if (delta == 0)
                {
                    throw new ProtocolException("Duplicate or null subject id.");
                }

                uint value = previous + delta;
                if (value < previous)
                {
                    throw new ProtocolException("Subject id overflow.");
                }

                into.Subjects.Add(new EntityId(value));
                previous = value;
            }
        }
    }
}
