namespace ConflictCore.Protocol.Versioning
{
    public enum VersionCheckResult : byte
    {
        Compatible = 0,
        ProtocolMismatch = 1,
        ClientTooOld = 2,
        DataMismatch = 3,
    }

    /// <summary>
    /// Server-side rule set deciding whether a connecting client build may join. The minimum client version
    /// comes from server configuration (not compiled in), so old clients can be retired without a server rebuild.
    /// </summary>
    public sealed class VersionPolicy
    {
        public VersionPolicy(ushort protocolVersion, SemanticVersion minimumClientVersion, ulong gameDataHash)
        {
            ProtocolVersion = protocolVersion;
            MinimumClientVersion = minimumClientVersion;
            GameDataHash = gameDataHash;
        }

        public ushort ProtocolVersion { get; }

        public SemanticVersion MinimumClientVersion { get; }

        /// <summary>Hash of the balance data the server simulates with; clients must render the same data.</summary>
        public ulong GameDataHash { get; }

        public VersionCheckResult Evaluate(ushort clientProtocolVersion, SemanticVersion clientVersion, ulong clientGameDataHash)
        {
            if (clientProtocolVersion != ProtocolVersion)
            {
                return VersionCheckResult.ProtocolMismatch;
            }

            if (clientVersion < MinimumClientVersion)
            {
                return VersionCheckResult.ClientTooOld;
            }

            return clientGameDataHash != GameDataHash ? VersionCheckResult.DataMismatch : VersionCheckResult.Compatible;
        }
    }
}
