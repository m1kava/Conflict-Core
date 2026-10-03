using ConflictCore.Protocol.Serialization;

namespace ConflictCore.Protocol.Messages
{
    /// <summary>Why a match server refused a client. Shown to the player as a localised, actionable message.</summary>
    public enum JoinRejectReason : byte
    {
        None = 0,
        ProtocolMismatch = 1,
        ClientTooOld = 2,
        GameDataMismatch = 3,
        InvalidTicket = 4,
        MatchFull = 5,
        MatchEnded = 6,
        ResumeExpired = 7,
        ServerShuttingDown = 8,
    }

    /// <summary>Server answer to <see cref="ClientHello"/>.</summary>
    public sealed class HelloReply
    {
        public const int MaxResumeTokenBytes = ClientHello.MaxResumeTokenBytes;
        private const byte MaxReason = (byte)JoinRejectReason.ServerShuttingDown;

        private HelloReply(JoinRejectReason reason, byte playerSlot, string resumeToken, uint lastProcessedCommand)
        {
            Reason = reason;
            PlayerSlot = playerSlot;
            ResumeToken = resumeToken;
            LastProcessedCommandSequence = lastProcessedCommand;
        }

        public JoinRejectReason Reason { get; }

        public bool Accepted => Reason == JoinRejectReason.None;

        public byte PlayerSlot { get; }

        public string ResumeToken { get; }

        /// <summary>
        /// Highest command sequence the server has already applied for this player. After a reconnect the
        /// client drops every buffered command at or below it, so nothing is executed twice.
        /// </summary>
        public uint LastProcessedCommandSequence { get; }

        public static HelloReply Accept(byte playerSlot, string resumeToken, uint lastProcessedCommand) =>
            new HelloReply(JoinRejectReason.None, playerSlot, resumeToken, lastProcessedCommand);

        public static HelloReply Reject(JoinRejectReason reason) => new HelloReply(reason, 0, string.Empty, 0);

        public void Write(PacketWriter writer)
        {
            writer.WriteByte((byte)MessageType.HelloReply);
            writer.WriteByte((byte)Reason);
            if (!Accepted)
            {
                return;
            }

            writer.WriteByte(PlayerSlot);
            writer.WriteString(ResumeToken, MaxResumeTokenBytes);
            writer.WriteVarUInt(LastProcessedCommandSequence);
        }

        public static HelloReply Read(ref PacketReader reader)
        {
            if (reader.ReadByte() != (byte)MessageType.HelloReply)
            {
                throw new ProtocolException("Expected HelloReply.");
            }

            var reason = (JoinRejectReason)reader.ReadEnumByte(MaxReason);
            if (reason != JoinRejectReason.None)
            {
                reader.ExpectEnd();
                return Reject(reason);
            }

            byte slot = reader.ReadByte();
            string resumeToken = reader.ReadString(MaxResumeTokenBytes);
            uint lastProcessed = reader.ReadVarUInt();
            reader.ExpectEnd();
            return Accept(slot, resumeToken, lastProcessed);
        }
    }
}
