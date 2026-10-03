using ConflictCore.Protocol.Messages;
using ConflictCore.Protocol.Versioning;
using ConflictCore.Server.Sessions;

namespace ConflictCore.Server.Tests;

public class HandshakeHandlerTests
{
    private const ulong DataHash = 0x1234;
    private static readonly SemanticVersion Current = SemanticVersion.Parse("0.1.0");

    [Fact]
    public void ValidHello_IsAccepted()
    {
        JoinRejectReason reason = CreateHandler().Evaluate(Hello(Current, DataHash, "good"), out JoinTicketClaims? claims);

        Assert.Equal(JoinRejectReason.None, reason);
        Assert.Equal((byte)1, claims!.PlayerSlot);
    }

    [Fact]
    public void OldClient_IsRejectedBeforeTicketCheck()
    {
        var verifier = new FakeVerifier();
        var handler = new HandshakeHandler(new VersionPolicy(ProtocolInfo.Version, SemanticVersion.Parse("0.2.0"), DataHash), verifier, "match-1");

        Assert.Equal(JoinRejectReason.ClientTooOld, handler.Evaluate(Hello(Current, DataHash, "good"), out _));
        Assert.False(verifier.Called);
    }

    [Fact]
    public void DataMismatch_IsRejected()
    {
        Assert.Equal(JoinRejectReason.GameDataMismatch, CreateHandler().Evaluate(Hello(Current, 999, "good"), out _));
    }

    [Fact]
    public void InvalidTicket_IsRejected()
    {
        Assert.Equal(JoinRejectReason.InvalidTicket, CreateHandler().Evaluate(Hello(Current, DataHash, "forged"), out JoinTicketClaims? claims));
        Assert.Null(claims);
    }

    [Fact]
    public void TicketForAnotherMatch_IsRejected()
    {
        Assert.Equal(JoinRejectReason.InvalidTicket, CreateHandler().Evaluate(Hello(Current, DataHash, "other-match"), out _));
    }

    private static HandshakeHandler CreateHandler() =>
        new(new VersionPolicy(ProtocolInfo.Version, Current, DataHash), new FakeVerifier(), "match-1");

    private static ClientHello Hello(SemanticVersion version, ulong hash, string ticket) => new(version, hash, ticket, string.Empty);

    private sealed class FakeVerifier : IJoinTicketVerifier
    {
        public bool Called { get; private set; }

        public bool TryVerify(string ticket, out JoinTicketClaims? claims)
        {
            Called = true;
            claims = ticket switch
            {
                "good" => new JoinTicketClaims("match-1", "account-7", 1),
                "other-match" => new JoinTicketClaims("match-2", "account-7", 1),
                _ => null,
            };
            return claims is not null;
        }
    }
}
