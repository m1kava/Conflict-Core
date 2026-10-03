using System;
using System.Collections.Generic;
using ConflictCore.Protocol.Messages;
using ConflictCore.Protocol.Serialization;

namespace ConflictCore.Protocol.Commands
{
    /// <summary>
    /// Client → server message carrying consecutive commands. Each command has a per-player sequence number
    /// (<see cref="FirstSequence"/> + index). The server applies a sequence at most once and acknowledges the
    /// highest applied one, which makes resending after packet loss or reconnect idempotent.
    /// </summary>
    public sealed class CommandBatch
    {
        public const int MaxCommandsPerBatch = 16;

        private readonly List<PlayerCommand> _commands = new List<PlayerCommand>(MaxCommandsPerBatch);
        private readonly List<PlayerCommand> _pool = new List<PlayerCommand>(MaxCommandsPerBatch);

        public uint FirstSequence { get; set; }

        /// <summary>Latest server tick the client had rendered when sending; used for latency diagnostics only.</summary>
        public uint ClientObservedTick { get; set; }

        public IReadOnlyList<PlayerCommand> Commands => _commands;

        public uint LastSequence => _commands.Count == 0 ? FirstSequence : FirstSequence + (uint)_commands.Count - 1;

        public void Clear()
        {
            _commands.Clear();
            FirstSequence = 0;
            ClientObservedTick = 0;
        }

        /// <summary>Returns a cleared pooled command appended to the batch.</summary>
        public PlayerCommand Add()
        {
            if (_commands.Count >= MaxCommandsPerBatch)
            {
                throw new InvalidOperationException($"A batch holds at most {MaxCommandsPerBatch} commands.");
            }

            if (_pool.Count <= _commands.Count)
            {
                _pool.Add(new PlayerCommand());
            }

            PlayerCommand command = _pool[_commands.Count];
            command.Clear();
            _commands.Add(command);
            return command;
        }

        public void Write(PacketWriter writer)
        {
            writer.WriteByte((byte)MessageType.CommandBatch);
            writer.WriteVarUInt(FirstSequence);
            writer.WriteVarUInt(ClientObservedTick);
            writer.WriteVarUInt((uint)_commands.Count);
            foreach (PlayerCommand command in _commands)
            {
                CommandCodec.Write(writer, command);
            }
        }

        public void Read(ref PacketReader reader)
        {
            Clear();
            if (reader.ReadByte() != (byte)MessageType.CommandBatch)
            {
                throw new ProtocolException("Expected CommandBatch.");
            }

            FirstSequence = reader.ReadVarUInt();
            ClientObservedTick = reader.ReadVarUInt();
            int count = reader.ReadBoundedCount(MaxCommandsPerBatch);
            if (count > 0 && FirstSequence == 0)
            {
                throw new ProtocolException("Command sequence numbers start at 1.");
            }

            for (int i = 0; i < count; i++)
            {
                CommandCodec.Read(ref reader, Add());
            }

            reader.ExpectEnd();
        }
    }
}
