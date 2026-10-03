using ConflictCore.Protocol.Messages;
using ConflictCore.Protocol.Versioning;

namespace ConflictCore.Server.Sessions;

/// <summary>
/// Decides whether a <see cref="ClientHello"/> may join this match. Checks run cheapest-first, and every
/// rejection maps to a specific <see cref="JoinRejectReason"/> so the client can show an actionable message
/// ("update the game", "match is over") instead of a generic failure.
/// </summary>
public sealed class HandshakeHandler
{
    private readonly VersionPolicy _versionPolicy;
    private readonly IJoinTicketVerifier _ticketVerifier;
    private readonly string _matchId;

    public HandshakeHandler(VersionPolicy versionPolicy, IJoinTicketVerifier ticketVerifier, string matchId)
    {
        _versionPolicy = versionPolicy;
        _ticketVerifier = ticketVerifier;
        _matchId = matchId;
    }

    public JoinRejectReason Evaluate(ClientHello hello, out JoinTicketClaims? claims)
    {
        claims = null;
        VersionCheckResult version = _versionPolicy.Evaluate(hello.ProtocolVersion, hello.ClientVersion, hello.GameDataHash);
        switch (version)
        {
            case VersionCheckResult.ProtocolMismatch:
                return JoinRejectReason.ProtocolMismatch;
            case VersionCheckResult.ClientTooOld:
                return JoinRejectReason.ClientTooOld;
            case VersionCheckResult.DataMismatch:
                return JoinRejectReason.GameDataMismatch;
        }

        if (!_ticketVerifier.TryVerify(hello.JoinTicket, out claims) || claims is null || claims.MatchId != _matchId)
        {
            claims = null;
            return JoinRejectReason.InvalidTicket;
        }

        return JoinRejectReason.None;
    }
}
