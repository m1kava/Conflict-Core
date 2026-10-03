using ConflictCore.Core.Identifiers;

namespace ConflictCore.Server.Simulation;

/// <summary>
/// The authoritative match simulation driven by <see cref="Hosting.MatchHostService"/>.
/// One instance per match; it owns all gameplay state.
/// </summary>
public interface IMatchSimulation
{
    SimTick CurrentTick { get; }

    /// <summary>Advances exactly one fixed tick: apply validated commands, simulate, then produce snapshots.</summary>
    void Step();

    /// <summary>Deterministic checksum of gameplay state, for desync detection and replay verification.</summary>
    ulong ComputeStateHash();
}
