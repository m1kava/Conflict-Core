using System.ComponentModel.DataAnnotations;

namespace ConflictCore.Server.Hosting;

/// <summary>
/// Match server configuration, bound from the "MatchServer" section (appsettings.json, environment variables
/// such as <c>MatchServer__Port</c>, or command-line). Nothing environment-specific is compiled in.
/// </summary>
public sealed class MatchServerOptions
{
    public const string SectionName = "MatchServer";

    [Range(1, 65535)]
    public int Port { get; set; } = 7777;

    /// <summary>Authoritative simulation ticks per second. See docs/NETWORKING.md for why 15.</summary>
    [Range(5, 60)]
    public int TickRate { get; set; } = 15;

    /// <summary>Maximum ticks simulated in one loop iteration after a stall before the server drops time.</summary>
    [Range(1, 30)]
    public int MaxCatchUpTicks { get; set; } = 5;

    [Required]
    public string DataDirectory { get; set; } = "Data";

    /// <summary>Oldest client build allowed to join; raise it to retire old clients without a server rebuild.</summary>
    [Required]
    public string MinimumClientVersion { get; set; } = "0.1.0";

    /// <summary>How long a disconnected player's slot is held for reconnection.</summary>
    [Range(0, 600)]
    public int ReconnectGraceSeconds { get; set; } = 90;
}
