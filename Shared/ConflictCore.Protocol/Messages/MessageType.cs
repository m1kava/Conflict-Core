namespace ConflictCore.Protocol.Messages
{
    /// <summary>First byte of every application message. Values are part of the wire format: never renumber.</summary>
    public enum MessageType : byte
    {
        ClientHello = 1,
        HelloReply = 2,
        CommandBatch = 3,
        CommandAck = 4,
        Snapshot = 5,
        SnapshotAck = 6,
        MatchEvent = 7,
        Ping = 8,
        Pong = 9,
    }
}
