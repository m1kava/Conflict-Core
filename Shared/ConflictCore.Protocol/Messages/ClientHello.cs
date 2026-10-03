using ConflictCore.Protocol.Serialization;
using ConflictCore.Protocol.Versioning;

namespace ConflictCore.Protocol.Messages
{
    /// <summary>
    /// First message a client sends to a match server.
    /// </summary>
    /// <remarks>
    /// <see cref="JoinTicket"/> is a short-lived token signed by the backend (matchmaking / lobby service) that
    /// names the match, account and slot; the match server only verifies the signature with the backend's
    /// public key, so no backend secret ever ships in the client. <see cref="ResumeToken"/> is empty on the
    /// first join and carries the server-issued reconnect token when resuming after a network drop.
    /// </remarks>
    public sealed class ClientHello
    {
        public const int MaxTicketBytes = 2048;
        public const int MaxResumeTokenBytes = 128;

        public ClientHello(SemanticVersion clientVersion, ulong gameDataHash, string joinTicket, string resumeToken)
        {
            ClientVersion = clientVersion;
            GameDataHash = gameDataHash;
            JoinTicket = joinTicket;
            ResumeToken = resumeToken;
        }

        public ushort ProtocolVersion { get; private set; } = ProtocolInfo.Version;

        public SemanticVersion ClientVersion { get; }

        public ulong GameDataHash { get; }

        public string JoinTicket { get; }

        public string ResumeToken { get; }

        public bool IsResume => ResumeToken.Length > 0;

        public void Write(PacketWriter writer)
        {
            writer.WriteByte((byte)MessageType.ClientHello);
            writer.WriteUInt32(ProtocolInfo.Magic);
            writer.WriteUInt16(ProtocolVersion);
            writer.WriteUInt16(ClientVersion.Major);
            writer.WriteUInt16(ClientVersion.Minor);
            writer.WriteUInt16(ClientVersion.Patch);
            writer.WriteUInt64(GameDataHash);
            writer.WriteString(JoinTicket, MaxTicketBytes);
            writer.WriteString(ResumeToken, MaxResumeTokenBytes);
        }

        /// <summary>
        /// Parses a hello. The magic and protocol version are read first so an incompatible client is identified
        /// (and can be told so) even when the rest of its message layout differs from ours.
        /// </summary>
        public static ClientHello Read(ref PacketReader reader)
        {
            if (reader.ReadByte() != (byte)MessageType.ClientHello)
            {
                throw new ProtocolException("Expected ClientHello.");
            }

            if (reader.ReadUInt32() != ProtocolInfo.Magic)
            {
                throw new ProtocolException("Bad handshake magic.");
            }

            ushort protocolVersion = reader.ReadUInt16();
            if (protocolVersion != ProtocolInfo.Version)
            {
                return new ClientHello(default, 0, string.Empty, string.Empty) { ProtocolVersion = protocolVersion };
            }

            var clientVersion = new SemanticVersion(reader.ReadUInt16(), reader.ReadUInt16(), reader.ReadUInt16());
            ulong dataHash = reader.ReadUInt64();
            string ticket = reader.ReadString(MaxTicketBytes);
            string resume = reader.ReadString(MaxResumeTokenBytes);
            reader.ExpectEnd();
            return new ClientHello(clientVersion, dataHash, ticket, resume);
        }
    }
}
