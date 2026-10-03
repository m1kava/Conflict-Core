using ConflictCore.Protocol.Messages;
using ConflictCore.Protocol.Serialization;
using ConflictCore.Protocol.Versioning;

namespace ConflictCore.Protocol.Tests;

public class HandshakeMessageTests
{
    [Fact]
    public void ClientHello_RoundTrips()
    {
        var hello = new ClientHello(new SemanticVersion(0, 3, 1), 0xABCDEF, "ticket-abc", "resume-xyz");
        var writer = new PacketWriter(4096);
        hello.Write(writer);

        var reader = new PacketReader(writer.Written);
        ClientHello decoded = ClientHello.Read(ref reader);

        Assert.Equal(ProtocolInfo.Version, decoded.ProtocolVersion);
        Assert.Equal(hello.ClientVersion, decoded.ClientVersion);
        Assert.Equal(hello.GameDataHash, decoded.GameDataHash);
        Assert.Equal("ticket-abc", decoded.JoinTicket);
        Assert.True(decoded.IsResume);
    }

    [Fact]
    public void ClientHello_FromFutureProtocol_ReportsVersionWithoutParsingRest()
    {
        var writer = new PacketWriter(64);
        writer.WriteByte((byte)MessageType.ClientHello);
        writer.WriteUInt32(ProtocolInfo.Magic);
        writer.WriteUInt16(ProtocolInfo.Version + 1);
        writer.WriteByte(0xFF); // unknown future layout

        var reader = new PacketReader(writer.Written);
        ClientHello decoded = ClientHello.Read(ref reader);

        Assert.Equal(ProtocolInfo.Version + 1, decoded.ProtocolVersion);
    }

    [Fact]
    public void ClientHello_WithBadMagic_IsRejected()
    {
        var writer = new PacketWriter(64);
        writer.WriteByte((byte)MessageType.ClientHello);
        writer.WriteUInt32(0x12345678);

        Assert.Throws<ProtocolException>(() =>
        {
            var reader = new PacketReader(writer.Written);
            ClientHello.Read(ref reader);
        });
    }

    [Fact]
    public void HelloReply_Accept_RoundTrips()
    {
        var writer = new PacketWriter(256);
        HelloReply.Accept(3, "resume-token", 42).Write(writer);

        var reader = new PacketReader(writer.Written);
        HelloReply decoded = HelloReply.Read(ref reader);

        Assert.True(decoded.Accepted);
        Assert.Equal(3, decoded.PlayerSlot);
        Assert.Equal("resume-token", decoded.ResumeToken);
        Assert.Equal(42u, decoded.LastProcessedCommandSequence);
    }

    [Fact]
    public void HelloReply_Reject_RoundTrips()
    {
        var writer = new PacketWriter(16);
        HelloReply.Reject(JoinRejectReason.ClientTooOld).Write(writer);

        var reader = new PacketReader(writer.Written);
        HelloReply decoded = HelloReply.Read(ref reader);

        Assert.False(decoded.Accepted);
        Assert.Equal(JoinRejectReason.ClientTooOld, decoded.Reason);
    }
}
