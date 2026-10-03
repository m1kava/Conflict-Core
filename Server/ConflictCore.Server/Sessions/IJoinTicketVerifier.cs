namespace ConflictCore.Server.Sessions;

/// <summary>Claims carried by a verified join ticket.</summary>
public sealed record JoinTicketClaims(string MatchId, string AccountId, byte PlayerSlot);

/// <summary>
/// Verifies backend-signed join tickets. The production implementation (Phase 4/9) checks an asymmetric
/// signature against the backend's public key, the expiry and the match id — the match server never holds a
/// signing secret, and the client never sees one.
/// </summary>
public interface IJoinTicketVerifier
{
    bool TryVerify(string ticket, out JoinTicketClaims? claims);
}
