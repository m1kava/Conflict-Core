using System;
using ConflictCore.Server.Simulation;

namespace ConflictCore.Server.Tests;

public class FixedTickClockTests
{
    [Fact]
    public void Advance_ReturnsWholeTicksAndKeepsRemainder()
    {
        var clock = new FixedTickClock(tickRate: 10, maxCatchUpTicks: 5);

        Assert.Equal(0, clock.Advance(TimeSpan.FromMilliseconds(50)));
        Assert.Equal(1, clock.Advance(TimeSpan.FromMilliseconds(60)));
        Assert.Equal(TimeSpan.FromMilliseconds(90), clock.TimeUntilNextTick);
    }

    [Fact]
    public void Advance_OverManySmallSteps_ProducesExactTickCount()
    {
        var clock = new FixedTickClock(tickRate: 15, maxCatchUpTicks: 5);
        int total = 0;
        for (int i = 0; i < 60_000; i++)
        {
            total += clock.Advance(TimeSpan.FromMilliseconds(1));
        }

        // 60 s at 15 Hz; tick duration is 666,666 .NET ticks so rounding may yield at most one extra tick.
        Assert.InRange(total, 900, 901);
    }

    [Fact]
    public void Advance_AfterStall_CapsCatchUpAndRecordsDroppedTime()
    {
        var clock = new FixedTickClock(tickRate: 10, maxCatchUpTicks: 3);

        Assert.Equal(3, clock.Advance(TimeSpan.FromSeconds(2)));
        Assert.Equal(TimeSpan.FromMilliseconds(1700), clock.DroppedTime);
        Assert.Equal(0, clock.Advance(TimeSpan.Zero));
    }

    [Fact]
    public void Advance_RejectsNegativeTime()
    {
        var clock = new FixedTickClock(15, 5);

        Assert.Throws<ArgumentOutOfRangeException>(() => clock.Advance(TimeSpan.FromMilliseconds(-1)));
    }
}
