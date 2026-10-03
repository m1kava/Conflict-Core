using ConflictCore.Core.Hashing;
using ConflictCore.Core.Identifiers;

namespace ConflictCore.Server.Simulation;

/// <summary>
/// PLACEHOLDER (Phase 1): advances the tick counter only, so the host loop, timing and metrics can be
/// exercised before the RTS simulation exists. Replaced by the real simulation in Phase 2.
/// </summary>
public sealed class EmptyMatchSimulation : IMatchSimulation
{
    public SimTick CurrentTick { get; private set; } = SimTick.Zero;

    public void Step() => CurrentTick = CurrentTick.Next;

    public ulong ComputeStateHash()
    {
        var hasher = new StateHasher();
        hasher.Add(CurrentTick.Value);
        return hasher.Value;
    }
}
