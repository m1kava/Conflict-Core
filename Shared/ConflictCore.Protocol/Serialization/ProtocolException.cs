using System;

namespace ConflictCore.Protocol.Serialization
{
    /// <summary>
    /// Raised when inbound bytes violate the wire format (truncated, out-of-range, oversized). Peers sending
    /// malformed data are treated as hostile: the connection layer drops the packet and counts a strike.
    /// </summary>
    public sealed class ProtocolException : Exception
    {
        public ProtocolException(string message)
            : base(message)
        {
        }
    }
}
