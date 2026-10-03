namespace ConflictCore.Protocol.Versioning
{
    /// <summary>
    /// Wire protocol identity. <see cref="Version"/> must be incremented on ANY change to message layout,
    /// command encoding or snapshot format. Client and match server must agree exactly; the client build
    /// version is checked separately against the server's minimum supported client version.
    /// </summary>
    public static class ProtocolInfo
    {
        /// <summary>Magic prefix of the handshake so stray UDP traffic is rejected before parsing.</summary>
        public const uint Magic = 0x43434F52; // "CCOR"

        public const ushort Version = 1;
    }
}
