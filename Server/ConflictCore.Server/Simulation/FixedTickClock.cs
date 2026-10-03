using System;

namespace ConflictCore.Server.Simulation;

/// <summary>
/// Converts wall-clock time into a whole number of fixed simulation ticks (accumulator pattern).
/// </summary>
/// <remarks>
/// The simulation always advances in identical, fixed-size steps regardless of host load, which is required
/// for determinism. If the host stalls (GC pause, noisy neighbour), up to <see cref="MaxCatchUpTicks"/> ticks
/// are run back-to-back; beyond that, excess time is dropped so the server degrades by slowing down briefly
/// rather than spiralling into ever-longer catch-up frames.
/// </remarks>
public sealed class FixedTickClock
{
    private readonly long _tickDurationTicks;
    private long _accumulatedTicks;

    public FixedTickClock(int tickRate, int maxCatchUpTicks)
    {
        if (tickRate <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(tickRate));
        }

        if (maxCatchUpTicks <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(maxCatchUpTicks));
        }

        TickRate = tickRate;
        MaxCatchUpTicks = maxCatchUpTicks;
        _tickDurationTicks = TimeSpan.TicksPerSecond / tickRate;
    }

    public int TickRate { get; }

    public int MaxCatchUpTicks { get; }

    public TimeSpan TickDuration => TimeSpan.FromTicks(_tickDurationTicks);

    /// <summary>Total wall time discarded because the host fell too far behind (exported as a metric).</summary>
    public TimeSpan DroppedTime { get; private set; }

    /// <summary>Adds elapsed wall time and returns how many simulation ticks are now due.</summary>
    public int Advance(TimeSpan elapsed)
    {
        if (elapsed < TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(elapsed), "Elapsed time cannot be negative.");
        }

        _accumulatedTicks += elapsed.Ticks;
        long due = _accumulatedTicks / _tickDurationTicks;
        if (due > MaxCatchUpTicks)
        {
            long dropped = (due - MaxCatchUpTicks) * _tickDurationTicks;
            DroppedTime += TimeSpan.FromTicks(dropped);
            _accumulatedTicks -= dropped;
            due = MaxCatchUpTicks;
        }

        _accumulatedTicks -= due * _tickDurationTicks;
        return (int)due;
    }

    /// <summary>Time remaining until the next tick is due; the host sleeps for this long.</summary>
    public TimeSpan TimeUntilNextTick => TimeSpan.FromTicks(_tickDurationTicks - _accumulatedTicks);
}
